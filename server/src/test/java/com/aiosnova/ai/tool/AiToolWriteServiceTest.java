package com.aiosnova.ai.tool;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

/** Real Spring transaction proxy with simulated storage; no database connection. */
class AiToolWriteServiceTest {

    private static final String COMPANY = "company-test";
    private static final String MERCHANT = "merchant-test";

    static final class MemoryRepository extends AiToolRepository {
        NewTool tool;
        long version;
        List<String> bindings = List.of();
        boolean failBindings;
        boolean rejectUpdate;
        boolean inactiveAgent;

        MemoryRepository() {
            super(new JdbcTemplate());
        }

        @Override
        public boolean companyExistsInMerchant(String company, String merchant) {
            return COMPANY.equals(company) && MERCHANT.equals(merchant);
        }

        @Override
        public Optional<AgentScope> findAgentForUpdate(
                String company, String merchant, String agent) {
            if (!companyExistsInMerchant(company, merchant)
                    || !List.of("agent-a", "agent-b").contains(agent)) {
                return Optional.empty();
            }
            return Optional.of(new AgentScope(company, merchant, agent,
                    inactiveAgent ? "disabled" : "active"));
        }

        @Override
        public void insert(NewTool value) {
            if (tool != null) throw new DataIntegrityViolationException("Duplicate test tool");
            tool = value;
            version = 0;
        }

        @Override
        public Optional<LockedTool> findToolForUpdate(
                String company, String merchant, String id) {
            return tool != null && companyExistsInMerchant(company, merchant)
                    && tool.id().equals(id) && tool.companyId().equals(company)
                    ? Optional.of(new LockedTool(id, tool.action(), tool.executorType(), version))
                    : Optional.empty();
        }

        private boolean matches(String company, String id, long expected) {
            return !rejectUpdate && tool != null && tool.companyId().equals(company)
                    && tool.id().equals(id) && version == expected;
        }

        @Override
        public int updateConfiguration(NewTool value, long expected) {
            if (!matches(value.companyId(), value.id(), expected)) return 0;
            tool = value;
            version++;
            return 1;
        }

        @Override
        public int updateStatus(String company, String id, String status, long expected) {
            if (!matches(company, id, expected)) return 0;
            tool = new NewTool(tool.id(), tool.companyId(), tool.name(), tool.description(),
                    tool.module(), tool.action(), tool.executorType(), tool.risk(), status,
                    tool.timeoutSeconds(), tool.requiresConfirmation(), tool.configuration());
            version++;
            return 1;
        }

        @Override
        public int advanceVersion(String company, String id, long expected) {
            if (!matches(company, id, expected)) return 0;
            version++;
            return 1;
        }

        @Override
        public void clearAgentBindings(String company, String id) {
            bindings = List.of();
        }

        @Override
        public void insertAgentBindings(String company, String id, List<String> agents) {
            bindings = List.copyOf(agents);
            if (failBindings) throw new DataIntegrityViolationException("Simulated binding failure");
        }

        @Override
        public List<String> findBoundAgentIds(String company, String id) {
            return bindings;
        }
    }

    private static final class Snapshot {
        AiToolRepository.NewTool tool;
        long version;
        List<String> bindings;
    }

    private static final class MemoryTransactions extends AbstractPlatformTransactionManager {
        private final MemoryRepository repository;

        MemoryTransactions(MemoryRepository repository) {
            this.repository = repository;
        }

        @Override
        protected Object doGetTransaction() {
            return new Snapshot();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
            var snapshot = (Snapshot) transaction;
            snapshot.tool = repository.tool;
            snapshot.version = repository.version;
            snapshot.bindings = repository.bindings;
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            var snapshot = (Snapshot) status.getTransaction();
            repository.tool = snapshot.tool;
            repository.version = snapshot.version;
            repository.bindings = snapshot.bindings;
        }
    }

    final MemoryRepository repository = new MemoryRepository();
    final AiToolWriteService service = proxiedService();

    private AiToolWriteService proxiedService() {
        var proxy = new ProxyFactory(new AiToolWriteService(repository, MERCHANT));
        proxy.setProxyTargetClass(true);
        var transactions = new TransactionInterceptor();
        transactions.setTransactionManager(new MemoryTransactions(repository));
        transactions.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        proxy.addAdvice(transactions);
        return (AiToolWriteService) proxy.getProxy();
    }

    private AiToolWriteService.CreateRequest request(String name, List<String> agents) {
        return new AiToolWriteService.CreateRequest(COMPANY, name, "Description", "Utility",
                "calc.run", "calculator", "low", "active", 30, false, "{}", agents);
    }

    private AiToolWriteService.SavedTool create() {
        return service.create(request("Calculator", List.of("agent-b", "agent-a")));
    }

    private void expectStatus(int expected, Runnable operation) {
        var error = assertThrows(ResponseStatusException.class, operation::run);
        assertEquals(expected, error.getStatusCode().value());
    }

    @Test
    void editsConfigurationAndBindingsTogether() {
        var saved = create();
        var edited = service.update(saved.id(), 0, request("Edited", List.of("agent-b")));
        assertEquals(saved.id(), edited.id());
        assertEquals(1, edited.version());
        assertEquals("Edited", repository.tool.name());
        assertEquals(List.of("agent-b"), repository.bindings);
    }

    @Test
    void statusChangesPreserveBindingsAndRejectStaleVersions() {
        var saved = create();
        service.setEnabled(COMPANY, saved.id(), false, 0);
        assertEquals("disabled", repository.tool.status());
        assertEquals(List.of("agent-a", "agent-b"), repository.bindings);
        expectStatus(409, () -> service.setEnabled(COMPANY, saved.id(), true, 0));
        assertEquals("disabled", repository.tool.status());
        assertEquals(1, repository.version);
        service.setEnabled(COMPANY, saved.id(), true, 1);
        assertEquals("active", repository.tool.status());
        assertEquals(2, repository.version);
    }

    @Test
    void replacesAndExplicitlyClearsBindings() {
        var saved = create();
        service.replaceAgentBindings(COMPANY, saved.id(), 0, List.of("agent-b"));
        expectStatus(409, () -> service.replaceAgentBindings(
                COMPANY, saved.id(), 0, List.of()));
        assertEquals(List.of("agent-b"), repository.bindings);
        service.replaceAgentBindings(COMPANY, saved.id(), 1, List.of());
        assertEquals(List.of(), repository.bindings);
        assertEquals("Calculator", repository.tool.name());
        assertEquals(2, repository.version);
    }

    @Test
    void bindingFailureRestoresConfigurationVersionAndOldBindings() {
        var saved = create();
        var original = repository.tool;
        repository.failBindings = true;
        assertThrows(DataIntegrityViolationException.class,
                () -> service.update(saved.id(), 0, request("Edited", List.of("agent-b"))));
        assertEquals(original, repository.tool);
        assertEquals(0, repository.version);
        assertEquals(List.of("agent-a", "agent-b"), repository.bindings);
        assertThrows(DataIntegrityViolationException.class, () -> service.replaceAgentBindings(
                COMPANY, saved.id(), 0, List.of("agent-b")));
        assertEquals(0, repository.version);
        assertEquals(List.of("agent-a", "agent-b"), repository.bindings);
    }

    @Test
    void staleConfigurationAndRejectedConditionalUpdateDoNotWrite() {
        var saved = create();
        expectStatus(409, () -> service.update(saved.id(), 1, request("Edited", List.of())));
        repository.rejectUpdate = true;
        expectStatus(409, () -> service.update(saved.id(), 0, request("Edited", List.of())));
        assertEquals("Calculator", repository.tool.name());
        assertEquals(0, repository.version);
        assertEquals(List.of("agent-a", "agent-b"), repository.bindings);
    }

    @Test
    void invalidOrForeignAgentBindingsPreserveExistingState() {
        var saved = create();
        expectStatus(400, () -> service.replaceAgentBindings(COMPANY, saved.id(), 0, null));
        expectStatus(400, () -> service.replaceAgentBindings(
                COMPANY, saved.id(), 0, List.of("agent-a", "agent-a")));
        expectStatus(404, () -> service.replaceAgentBindings(
                COMPANY, saved.id(), 0, List.of("foreign-agent")));
        expectStatus(403, () -> service.setEnabled("other-company", saved.id(), false, 0));
        repository.inactiveAgent = true;
        expectStatus(400, () -> service.replaceAgentBindings(
                COMPANY, saved.id(), 0, List.of("agent-a")));
        assertEquals(0, repository.version);
        assertEquals(List.of("agent-a", "agent-b"), repository.bindings);
    }

    @Test
    void ambiguousJsonIsRejectedBeforeInsert() {
        for (String raw : List.of("{\"a\":1,\"a\":2}", "{} {}")) {
            var input = new AiToolWriteService.CreateRequest(COMPANY, "Calculator", "",
                    "Utility", "calc.run", "calculator", "low", "active", 30, false,
                    raw, List.of("agent-a"));
            expectStatus(400, () -> service.create(input));
            assertNull(repository.tool);
        }
    }

    @Test
    void directCallsCannotBypassTransactionRequirement() {
        var direct = new AiToolWriteService(repository, MERCHANT);
        assertThrows(IllegalStateException.class, () -> direct.create(request("Tool", List.of())));
        assertThrows(IllegalStateException.class, () -> direct.setEnabled(COMPANY, "tool", false, 0));
        assertNull(repository.tool);
    }
}
