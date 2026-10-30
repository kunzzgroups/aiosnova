package com.aiosnova.ai.mcp;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

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

class AiMcpCatalogSyncServiceTest {

    private static final String COMPANY = "company-j1";
    private static final String MERCHANT = "merchant-acme";
    private static final String SERVER = "server-test";

    private static final String SCHEMA = "{\"type\":\"object\",\"properties\":{}}";

    private static AiMcpRepository.CatalogToolRow row(
            String id,
            String name,
            String schema,
            boolean enabled,
            boolean available,
            long revision,
            long version) {

        return new AiMcpRepository.CatalogToolRow(
                id, COMPANY, SERVER, name, "Description", schema,
                enabled, available, revision, version);
    }

    private static AiMcpToolDiscovery.DiscoveredTool found(
            String name, String schema) {

        return new AiMcpToolDiscovery.DiscoveredTool(
                name, "Description", schema);
    }

    static class MemoryRepository extends AiMcpRepository {

        Map<String, CatalogToolRow> tools = new LinkedHashMap<>();

        Map<String, List<String>> bindings = new LinkedHashMap<>(Map.of(
                "existing-tool", List.of("hr-agent")));

        long serverVersion = 4L;
        long connectionRevision = 2L;
        boolean verified = true;
        boolean failToolWrite;
        boolean rejectCompletion;

        MemoryRepository() {
            super(new JdbcTemplate());
        }

        @Override
        public Optional<ServerRow> findServerForUpdate(
                String company, String merchant, String server) {

            if (!COMPANY.equals(company)
                    || !MERCHANT.equals(merchant)
                    || !SERVER.equals(server)) {
                return Optional.empty();
            }

            return Optional.of(new ServerRow(
                    SERVER, COMPANY, MERCHANT,
                    "Test MCP", "", "http://127.0.0.1:9090/mcp",
                    "streamable_http", "2025-11-25", "none",
                    false, 30, connectionRevision,
                    verified ? "verified" : "not_verified",
                    verified ? Long.valueOf(connectionRevision) : null,
                    serverVersion));
        }

        @Override
        public List<CatalogToolRow> findCatalogForUpdate(
                String company, String merchant, String server) {

            assertTrue(findServerForUpdate(company, merchant, server).isPresent());
            return new ArrayList<>(tools.values());
        }

        private int save(CatalogToolRow tool) {
            tools.put(tool.id(), tool);

            // 先修改模拟存储，再失败，验证事务确实恢复状态。
            if (failToolWrite) {
                throw new DataIntegrityViolationException(
                        "Simulated catalog write failure.");
            }

            return 1;
        }

        @Override
        public int insertCatalogTool(
                String company, String merchant, String server,
                CatalogToolWrite tool) {

            assertTrue(findServerForUpdate(company, merchant, server).isPresent());
            assertEquals(connectionRevision, tool.connectionRevision());

            return save(row(
                    tool.id(), tool.remoteName(), tool.inputSchema(),
                    false, true, tool.connectionRevision(), 0L));
        }

        @Override
        public int updateCatalogTool(
                String company, String merchant, String server,
                long expectedVersion, CatalogToolWrite tool,
                boolean disable) {

            assertTrue(findServerForUpdate(company, merchant, server).isPresent());

            var previous = tools.get(tool.id());

            if (previous == null || previous.version() != expectedVersion
                    || connectionRevision != tool.connectionRevision()) {
                return 0;
            }

            return save(row(
                    previous.id(), previous.remoteName(), tool.inputSchema(),
                    disable ? false : previous.enabled(),
                    true, tool.connectionRevision(), previous.version() + 1));
        }

        @Override
        public int markCatalogToolUnavailable(
                String company, String merchant, String server,
                String toolId, long expectedVersion) {

            assertTrue(findServerForUpdate(company, merchant, server).isPresent());

            var previous = tools.get(toolId);

            if (previous == null || previous.version() != expectedVersion) {
                return 0;
            }

            return save(row(
                    previous.id(), previous.remoteName(), previous.inputSchema(),
                    false, false, previous.discoveredConnectionRevision(),
                    previous.version() + 1));
        }

        @Override
        public int completeCatalogDiscovery(
                String company, String merchant, String server,
                long expectedVersion, long expectedRevision) {

            assertTrue(findServerForUpdate(company, merchant, server).isPresent());

            if (rejectCompletion || !verified
                    || serverVersion != expectedVersion
                    || connectionRevision != expectedRevision) {
                return 0;
            }

            serverVersion++;
            return 1;
        }

        @Override
        public Optional<ServerRow> findServer(
                String company,
                String merchant,
                String server) {

            // 模拟存储没有真实锁，复用已有范围过滤。
            return findServerForUpdate(company, merchant, server);
        }
    }

    private static final class Snapshot {
        Map<String, AiMcpRepository.CatalogToolRow> tools;
        Map<String, List<String>> bindings;
        long serverVersion;
    }

    static final class MemoryTransactions
            extends AbstractPlatformTransactionManager {

        final MemoryRepository repository;

        MemoryTransactions(MemoryRepository repository) {
            this.repository = repository;
        }

        @Override
        protected Object doGetTransaction() {
            return new Snapshot();
        }

        @Override
        protected void doBegin(
                Object transaction, TransactionDefinition definition) {

            var snapshot = (Snapshot) transaction;
            snapshot.tools = new LinkedHashMap<>(repository.tools);
            snapshot.bindings = new LinkedHashMap<>(repository.bindings);
            snapshot.serverVersion = repository.serverVersion;
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            var snapshot = (Snapshot) status.getTransaction();
            repository.tools = snapshot.tools;
            repository.bindings = snapshot.bindings;
            repository.serverVersion = snapshot.serverVersion;
        }
    }

    private final MemoryRepository repository = new MemoryRepository();

    private AiMcpCatalogSyncService service(String merchant) {
        var proxy = new ProxyFactory(new AiMcpCatalogSyncService(
                repository, merchant, Set.of(COMPANY)));

        proxy.setProxyTargetClass(true);

        var transactions = new TransactionInterceptor();
        transactions.setTransactionManager(
                new MemoryTransactions(repository));
        transactions.setTransactionAttributeSource(
                new AnnotationTransactionAttributeSource());

        proxy.addAdvice(transactions);

        return (AiMcpCatalogSyncService) proxy.getProxy();
    }

    private AiMcpCatalogSyncService.SyncResult sync(
            List<AiMcpToolDiscovery.DiscoveredTool> tools) {

        return service(MERCHANT).sync(
                COMPANY, SERVER, 4L, 2L, tools);
    }

    private void seed(boolean enabled, boolean available, long revision) {
        repository.tools.put("existing-tool", row(
                "existing-tool", "calculator.add", SCHEMA,
                enabled, available, revision, 7L));
    }

    private void expectStatus(int status, Runnable action) {
        var error = assertThrows(
                ResponseStatusException.class, action::run);

        assertEquals(status, error.getStatusCode().value());
    }

    @Test
    void preservesExistingIdEnabledStateAndBindingsAndAddsDisabledTool() {
        seed(true, true, 2L);
        var originalBindings = Map.copyOf(repository.bindings);

        var result = sync(List.of(
                found("calculator.add",
                        "{\"properties\":{},\"type\":\"object\"}"),
                found("calculator.subtract", SCHEMA)));

        var existing = repository.tools.get("existing-tool");

        assertEquals("existing-tool", existing.id());
        assertTrue(existing.enabled());
        assertTrue(existing.available());
        assertEquals(8L, existing.version());
        assertEquals(originalBindings, repository.bindings);

        var added = repository.tools.values().stream()
                .filter(tool -> tool.remoteName().equals("calculator.subtract"))
                .findFirst().orElseThrow();

        assertNotEquals(existing.id(), added.id());
        assertFalse(added.enabled());
        assertTrue(added.available());
        assertEquals(0L, added.version());
        assertFalse(repository.bindings.containsKey(added.id()));

        assertEquals(1, result.added());
        assertEquals(1, result.updated());
        assertEquals(0, result.unavailable());
        assertEquals(5L, repository.serverVersion);
        assertEquals(5L, result.version());
    }

    @Test
    void changedSchemaConnectionOrReappearanceDisablesExistingTool() {
        for (int scenario = 0; scenario < 3; scenario++) {
            repository.tools.clear();
            repository.serverVersion = 4L;

            seed(true, scenario != 2, scenario == 1 ? 1L : 2L);

            String incomingSchema = scenario == 0
                    ? "{\"type\":\"object\",\"required\":[\"a\"]}"
                    : SCHEMA;

            sync(List.of(found("calculator.add", incomingSchema)));

            var current = repository.tools.get("existing-tool");

            assertFalse(current.enabled());
            assertTrue(current.available());
            assertEquals("existing-tool", current.id());
            assertEquals(2L, current.discoveredConnectionRevision());
            assertEquals(
                    List.of("hr-agent"),
                    repository.bindings.get("existing-tool"));
        }
    }

    @Test
    void missingToolBecomesUnavailableWithoutDeletingBindings() {
        seed(true, true, 2L);

        var result = sync(List.of());

        var missing = repository.tools.get("existing-tool");

        assertNotNull(missing);
        assertFalse(missing.enabled());
        assertFalse(missing.available());
        assertEquals(8L, missing.version());
        assertEquals(1, result.unavailable());
        assertEquals(
                List.of("hr-agent"),
                repository.bindings.get("existing-tool"));
    }

    @Test
    void staleVersionsUnverifiedServerAndOtherScopesAreRejected() {
        seed(true, true, 2L);
        var original = Map.copyOf(repository.tools);
        var incoming = List.of(found("calculator.add", SCHEMA));

        expectStatus(409, () -> service(MERCHANT).sync(
                COMPANY, SERVER, 3L, 2L, incoming));

        expectStatus(409, () -> service(MERCHANT).sync(
                COMPANY, SERVER, 4L, 1L, incoming));

        expectStatus(403, () -> service(MERCHANT).sync(
                "company-j2", SERVER, 4L, 2L, incoming));

        expectStatus(404, () -> service("merchant-other").sync(
                COMPANY, SERVER, 4L, 2L, incoming));

        repository.verified = false;

        expectStatus(409, () -> sync(incoming));

        assertEquals(original, repository.tools);
        assertEquals(4L, repository.serverVersion);
    }

    @Test
    void toolWriteAndCompletionFailuresRollBackEntireCatalog() {
        seed(true, true, 2L);

        var originalTools = Map.copyOf(repository.tools);
        var originalBindings = Map.copyOf(repository.bindings);

        var incoming = List.of(
                found("calculator.add",
                        "{\"type\":\"object\",\"required\":[\"a\"]}"),
                found("calculator.subtract", SCHEMA));

        repository.failToolWrite = true;

        assertThrows(DataIntegrityViolationException.class,
                () -> sync(incoming));

        assertEquals(originalTools, repository.tools);
        assertEquals(originalBindings, repository.bindings);
        assertEquals(4L, repository.serverVersion);

        repository.failToolWrite = false;
        repository.rejectCompletion = true;

        expectStatus(409, () -> sync(incoming));

        assertEquals(originalTools, repository.tools);
        assertEquals(originalBindings, repository.bindings);
        assertEquals(4L, repository.serverVersion);
    }

    @Test
    void duplicateCatalogAndDirectCallWithoutTransactionAreRejected() {
        var incoming = found("calculator.add", SCHEMA);

        expectStatus(400, () -> sync(List.of(incoming, incoming)));

        assertTrue(repository.tools.isEmpty());
        assertEquals(4L, repository.serverVersion);

        var direct = new AiMcpCatalogSyncService(
                repository, MERCHANT, Set.of(COMPANY));

        assertThrows(IllegalStateException.class,
                () -> direct.sync(
                        COMPANY, SERVER, 4L, 2L, List.of(incoming)));

        assertTrue(repository.tools.isEmpty());
    }
}
