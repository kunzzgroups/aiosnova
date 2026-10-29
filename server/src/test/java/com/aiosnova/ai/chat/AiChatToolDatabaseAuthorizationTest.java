package com.aiosnova.ai.chat;

import java.util.List;
import java.util.Optional;

import com.aiosnova.ai.tool.AiToolAuthorizationService;
import com.aiosnova.ai.tool.AiToolDatabaseSource;
import com.aiosnova.ai.tool.AiToolRegistry;
import com.aiosnova.ai.tool.AiToolRepository;
import com.aiosnova.ai.tool.AiToolRepository.AgentScope;
import com.aiosnova.ai.tool.AiToolRepository.ToolRow;

import tools.jackson.databind.node.StringNode;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class AiChatToolDatabaseAuthorizationTest {

    private static final String COMPANY = "company-test";
    private static final String MERCHANT = "merchant-test";
    private static final String AGENT = "agent-test";

    static final class FakeRepository extends AiToolRepository {

        boolean active = true;
        boolean assigned = true;
        boolean agentActive = true;

        FakeRepository() {
            // No DataSource: this test cannot access MySQL.
            super(new JdbcTemplate());
        }

        private boolean inScope(String company, String merchant) {
            return COMPANY.equals(company)
                    && MERCHANT.equals(merchant);
        }

        @Override
        public Optional<AgentScope> findAgent(
                String company,
                String merchant,
                String agent) {

            if (!inScope(company, merchant)
                    || !AGENT.equals(agent)) {
                return Optional.empty();
            }

            return Optional.of(new AgentScope(
                    COMPANY,
                    MERCHANT,
                    AGENT,
                    agentActive ? "active" : "disabled"));
        }

        @Override
        public List<String> findBoundActions(
                String company,
                String merchant,
                String agent) {

            if (!inScope(company, merchant)
                    || !AGENT.equals(agent)
                    || !assigned) {
                return List.of();
            }

            return List.of("calc.run");
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
                    COMPANY,
                    "Calculator",
                    "Simulated calculator",
                    "Utility",
                    "calc.run",
                    "calculator",
                    "low",
                    active ? "active" : "disabled",
                    30,
                    false,
                    "{}",
                    0L));
        }

        @Override
        public Optional<AgentModelBinding> findAgentModelBinding(
                String company,
                String merchant,
                String agent) {

            return findAgent(company, merchant, agent)
                    .map(scope -> new AgentModelBinding(
                            scope.companyId(),
                            scope.merchantId(),
                            scope.agentId(),
                            scope.status(),
                            "provider-test",
                            "model-config-test",
                            0L));
        }

        @Override
        public Optional<AgentExecutionParameters> findAgentExecutionParameters(
                String company,
                String merchant,
                String agent) {

            return findAgent(company, merchant, agent)
                    .map(scope -> new AgentExecutionParameters(
                            scope.companyId(),
                            scope.merchantId(),
                            scope.agentId(),
                            scope.status(),
                            0.4,
                            0.75,
                            512,
                            0L));
        }
    }

    private AiToolAuthorizationService authorization(
            AiChatToolIntegrationTest.Fixture fixture,
            FakeRepository repository,
            String merchantId) {

        return new AiToolAuthorizationService(
                new AiToolDatabaseSource(repository, merchantId),
                List.of(new AiToolRegistry.Registration(
                        "calculator",
                        fixture.calculator)));
    }

    private AiChatMessagesRequest request() {
        return new AiChatMessagesRequest(
                COMPANY,
                "provider-test",
                "test/model",
                null,
                List.of(new AiChatMessagesRequest.Message(
                        "user",
                        StringNode.valueOf("Calculate 2 + 3."))));
    }

    @Test
    void databaseSourceAllowsBoundActiveCalculator() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new FakeRepository();

        var reply = fixture.service.chatMessagesWithAuthorizedTools(
                request(),
                AGENT,
                authorization(fixture, repository, MERCHANT));

        assertEquals("The answer is 5.", reply.reply());
        assertEquals(2, fixture.transport.requests.size());
        assertEquals(1, fixture.calculator.executions);
    }

    @Test
    void disabledToolStopsBeforeFirstRequest() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new FakeRepository();
        repository.active = false;

        var error = assertThrows(
                ResponseStatusException.class,
                () -> fixture.service.chatMessagesWithAuthorizedTools(
                        request(),
                        AGENT,
                        authorization(fixture, repository, MERCHANT)));

        assertEquals(403, error.getStatusCode().value());
        assertEquals(0, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
    }

    @Test
    void disablingToolAfterFirstResponseStopsExecution() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new FakeRepository();
        var policy = authorization(fixture, repository, MERCHANT);

        fixture.transport.afterFirstResponse = () -> repository.active = false;

        var error = assertThrows(
                ResponseStatusException.class,
                () -> fixture.service.chatMessagesWithAuthorizedTools(
                        request(),
                        AGENT,
                        policy));

        assertEquals(403, error.getStatusCode().value());
        assertEquals(1, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
    }

    @Test
    void revokingBindingAfterFirstResponseStopsExecution() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new FakeRepository();
        var policy = authorization(fixture, repository, MERCHANT);

        fixture.transport.afterFirstResponse = () -> repository.assigned = false;

        var error = assertThrows(
                ResponseStatusException.class,
                () -> fixture.service.chatMessagesWithAuthorizedTools(
                        request(),
                        AGENT,
                        policy));

        assertEquals(403, error.getStatusCode().value());
        assertEquals(1, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
    }

    @Test
    void revokingBindingAfterExecutionStopsSecondRequest() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new FakeRepository();
        var policy = authorization(fixture, repository, MERCHANT);

        fixture.calculator.afterExecution = () -> repository.assigned = false;

        var error = assertThrows(
                ResponseStatusException.class,
                () -> fixture.service.chatMessagesWithAuthorizedTools(
                        request(),
                        AGENT,
                        policy));

        assertEquals(403, error.getStatusCode().value());
        assertEquals(1, fixture.transport.requests.size());
        assertEquals(1, fixture.calculator.executions);
    }

    @Test
    void clearedBindingStopsBeforeFirstRequest() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new FakeRepository();
        repository.assigned = false;

        var error = assertThrows(
                ResponseStatusException.class,
                () -> fixture.service.chatMessagesWithAuthorizedTools(
                        request(),
                        AGENT,
                        authorization(fixture, repository, MERCHANT)));

        assertEquals(403, error.getStatusCode().value());
        assertEquals(0, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
    }

    @Test
    void wrongMerchantCannotAuthorizeAgent() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new FakeRepository();

        assertThrows(
                ResponseStatusException.class,
                () -> fixture.service.chatMessagesWithAuthorizedTools(
                        request(),
                        AGENT,
                        authorization(
                                fixture,
                                repository,
                                "other-merchant")));

        assertEquals(0, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
    }
}
