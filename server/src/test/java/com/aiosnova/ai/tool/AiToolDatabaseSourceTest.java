package com.aiosnova.ai.tool;

import com.aiosnova.ai.tool.builtin.CalculatorTool;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class AiToolDatabaseSourceTest {

    private static final String COMPANY = "company-test";
    private static final String MERCHANT = "merchant-test";
    private static final String AGENT = "agent-test";

    private static final class FakeRepository extends AiToolRepository {

        String agentStatus = "active";
        List<String> bindings = List.of("calc.run");

        String toolStatus = "active";
        String action = "calc.run";
        String executorType = "calculator";
        String risk = "low";
        boolean confirmation;
        int timeout = 30;
        String configuration = "{}";

        boolean wrongAgentCompany;
        boolean wrongToolCompany;

        FakeRepository() {
            super(new JdbcTemplate());
        }

        private boolean inScope(String company, String merchant) {
            return COMPANY.equals(company) && MERCHANT.equals(merchant);
        }

        @Override
        public Optional<AgentScope> findAgent(
                String company,
                String merchant,
                String agent) {

            if (!inScope(company, merchant) || !AGENT.equals(agent)) {
                return Optional.empty();
            }

            return Optional.of(new AgentScope(
                    wrongAgentCompany ? "other-company" : COMPANY,
                    MERCHANT,
                    AGENT,
                    agentStatus));
        }

        @Override
        public List<String> findBoundActions(
                String company,
                String merchant,
                String agent) {

            return inScope(company, merchant) && AGENT.equals(agent)
                    ? List.copyOf(bindings)
                    : List.of();
        }

        @Override
        public List<ToolRow> findTools(
                String company,
                String merchant) {

            if (!inScope(company, merchant)) {
                return List.of();
            }

            return List.of(new ToolRow(
                    "tool-test",
                    wrongToolCompany ? "other-company" : COMPANY,
                    "Calculator",
                    "Test calculator",
                    "Utility",
                    action,
                    executorType,
                    risk,
                    toolStatus,
                    timeout,
                    confirmation,
                    configuration,
                    0L));
        }
    }

    private final FakeRepository repository = new FakeRepository();

    private final AiToolDatabaseSource source =
            new AiToolDatabaseSource(repository, MERCHANT);

    private final AiToolAuthorizationService authorization =
            new AiToolAuthorizationService(
                    source,
                    List.of(new AiToolRegistry.Registration(
                            "calculator",
                            new CalculatorTool())));

    private void expectDenied(Runnable operation) {
        var error = assertThrows(
                ResponseStatusException.class,
                operation::run);

        assertEquals(403, error.getStatusCode().value());
    }

    private boolean toolEnabled() {
        return source.findTools(COMPANY).getFirst().enabled();
    }

    @Test
    void activeScopedAgentGetsBoundCalculator() {
        var grant = source.findAgent(COMPANY, AGENT).orElseThrow();

        assertEquals(COMPANY, grant.companyId());
        assertEquals(AGENT, grant.agentId());
        assertTrue(grant.active());
        assertEquals(Set.of("calc.run"), grant.allowedActions());

        assertEquals(
                Set.of("calc_run"),
                authorization.authorize(COMPANY, AGENT).functionNames());
    }

    @Test
    void companyMerchantAndAgentScopesAreNotSubstituted() {
        assertTrue(source.findAgent("other-company", AGENT).isEmpty());
        assertTrue(source.findAgent(COMPANY, "other-agent").isEmpty());

        var otherMerchantSource =
                new AiToolDatabaseSource(repository, "other-merchant");

        assertTrue(
                otherMerchantSource.findAgent(COMPANY, AGENT).isEmpty());
        assertTrue(otherMerchantSource.findTools(COMPANY).isEmpty());

        expectDenied(
                () -> authorization.authorize("other-company", AGENT));
    }

    @Test
    void draftAndDisabledAgentsAreDenied() {
        for (String status : List.of("draft", "disabled")) {
            repository.agentStatus = status;

            assertFalse(
                    source.findAgent(COMPANY, AGENT)
                            .orElseThrow().active());

            expectDenied(
                    () -> authorization.authorize(COMPANY, AGENT));
        }
    }

    @Test
    void disabledAndErrorToolsAreDenied() {
        for (String status : List.of("disabled", "error")) {
            repository.toolStatus = status;

            assertFalse(toolEnabled());

            expectDenied(
                    () -> authorization.authorize(COMPANY, AGENT));
        }

        repository.toolStatus = "active";

        assertTrue(toolEnabled());
    }

    @Test
    void unsupportedExecutionSettingsFailClosed() {
        repository.executorType = "unknown_executor";
        assertFalse(toolEnabled());
        repository.executorType = "calculator";

        repository.action = "email.send";
        assertFalse(toolEnabled());
        repository.action = "calc.run";

        repository.risk = "high";
        assertFalse(toolEnabled());
        repository.risk = "low";

        repository.confirmation = true;
        assertFalse(toolEnabled());
        repository.confirmation = false;

        repository.timeout = 60;
        assertFalse(toolEnabled());
        repository.timeout = 30;

        for (String config : List.of(
                "{invalid", "[]", "null", "{\"unexpected\":true}")) {
            repository.configuration = config;
            assertFalse(toolEnabled());
        }

        repository.configuration = null;
        assertFalse(toolEnabled());

        repository.configuration = "{}";
        assertTrue(toolEnabled());
    }

    @Test
    void returnedRowsMustStillMatchCompanyScope() {
        repository.wrongAgentCompany = true;

        assertThrows(
                IllegalStateException.class,
                () -> source.findAgent(COMPANY, AGENT));

        repository.wrongAgentCompany = false;
        repository.wrongToolCompany = true;

        assertThrows(
                IllegalStateException.class,
                () -> source.findTools(COMPANY));
    }

    @Test
    void missingBindingDoesNotGrantCompanyToolsAutomatically() {
        repository.bindings = List.of();

        assertTrue(toolEnabled());

        assertTrue(
                source.findAgent(COMPANY, AGENT)
                        .orElseThrow().allowedActions().isEmpty());

        expectDenied(
                () -> authorization.authorize(COMPANY, AGENT));
    }

    @Test
    void recheckReadsCurrentToolStateAndBindings() {
        var original = authorization.authorize(COMPANY, AGENT);

        repository.toolStatus = "disabled";

        expectDenied(
                () -> authorization.requireStillAllowed(
                        COMPANY, AGENT, original.functionNames()));

        repository.toolStatus = "active";
        repository.bindings = List.of();

        expectDenied(
                () -> authorization.requireStillAllowed(
                        COMPANY, AGENT, original.functionNames()));

        repository.bindings = List.of("calc.run");

        assertDoesNotThrow(
                () -> authorization.requireStillAllowed(
                        COMPANY, AGENT, original.functionNames()));
    }
}