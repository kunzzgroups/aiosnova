package com.aiosnova.ai.tool;

import com.aiosnova.ai.tool.builtin.CalculatorTool;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class AiToolAuthorizationServiceTest {

    private static final String COMPANY = "company-test";
    private static final String AGENT = "agent-test";

    private static final class FakeSource
            implements AiToolAuthorizationService.Source {

        boolean active = true;
        boolean toolEnabled = true;
        boolean assigned = true;
        boolean exists = true;
        boolean returnWrongCompany;
        boolean unknownExecutor;

        @Override
        public Optional<AiToolAuthorizationService.AgentGrant>
                findAgent(String companyId, String agentId) {

            if (!exists
                    || !COMPANY.equals(companyId)
                    || !AGENT.equals(agentId)) {
                return Optional.empty();
            }

            String action = unknownExecutor
                    ? "missing.run"
                    : "calc.run";

            return Optional.of(
                    new AiToolAuthorizationService.AgentGrant(
                            returnWrongCompany ? "other-company" : COMPANY,
                            AGENT,
                            active,
                            assigned ? Set.of(action) : Set.of()));
        }

        @Override
        public List<AiToolAuthorizationService.ToolState> findTools(
                String companyId) {

            if (!COMPANY.equals(companyId)) {
                return List.of();
            }

            return List.of(
                    new AiToolAuthorizationService.ToolState(
                            unknownExecutor ? "missing.run" : "calc.run",
                            toolEnabled));
        }
    }

    private final FakeSource source = new FakeSource();

    private final AiToolAuthorizationService service =
            new AiToolAuthorizationService(
                    source,
                    List.of(new AiToolRegistry.Registration(
                            "calculator",
                            new CalculatorTool())));

    private void expectStatus(int status, Runnable action) {
        var error = assertThrows(
                ResponseStatusException.class,
                action::run);

        assertEquals(status, error.getStatusCode().value());
    }

    @Test
    void authorizesEnabledAssignedCalculator() {
        var result = service.authorize(COMPANY, AGENT);

        assertEquals(Set.of("calc_run"), result.functionNames());
        assertEquals(
                List.of("calc.run"),
                result.registry().definitions().stream()
                        .map(AiToolDefinition::action)
                        .toList());
    }

    @Test
    void anotherCompanyCannotUseAgent() {
        expectStatus(
                403,
                () -> service.authorize("other-company", AGENT));
    }

    @Test
    void returnedAgentMustBelongToRequestedCompany() {
        source.returnWrongCompany = true;

        expectStatus(
                403,
                () -> service.authorize(COMPANY, AGENT));
    }

    @Test
    void inactiveAgentIsRejected() {
        source.active = false;

        expectStatus(
                403,
                () -> service.authorize(COMPANY, AGENT));
    }

    @Test
    void unassignedToolIsNotGranted() {
        source.assigned = false;

        expectStatus(
                403,
                () -> service.authorize(COMPANY, AGENT));
    }

    @Test
    void disabledCompanyToolIsNotGranted() {
        source.toolEnabled = false;

        expectStatus(
                403,
                () -> service.authorize(COMPANY, AGENT));
    }

    @Test
    void missingAgentIsRejected() {
        source.exists = false;

        expectStatus(
                403,
                () -> service.authorize(COMPANY, AGENT));
    }

    @Test
    void missingExecutorFailsClosed() {
        source.unknownExecutor = true;

        expectStatus(
                500,
                () -> service.authorize(COMPANY, AGENT));
    }

    @Test
    void disablingToolInvalidatesExistingAuthorization() {
        var original = service.authorize(COMPANY, AGENT);

        source.toolEnabled = false;

        expectStatus(
                403,
                () -> service.requireStillAllowed(
                        COMPANY,
                        AGENT,
                        original.functionNames()));
    }

    @Test
    void removingAgentAssignmentInvalidatesAuthorization() {
        var original = service.authorize(COMPANY, AGENT);

        source.assigned = false;

        expectStatus(
                403,
                () -> service.requireStillAllowed(
                        COMPANY,
                        AGENT,
                        original.functionNames()));
    }

    @Test
    void invalidAgentIdIsRejected() {
        expectStatus(
                400,
                () -> service.authorize(COMPANY, "../agent"));
    }

    @Test
    void reenabledToolCanBeAuthorizedForANewRequest() {
        source.toolEnabled = false;

        expectStatus(
                403,
                () -> service.authorize(COMPANY, AGENT));

        source.toolEnabled = true;

        assertEquals(
                Set.of("calc_run"),
                service.authorize(COMPANY, AGENT).functionNames());
    }
}
