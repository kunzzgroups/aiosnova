package com.aiosnova.ai.chat;

import java.util.List;
import java.util.Optional;

import com.aiosnova.ai.tool.AiToolRepository;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.node.StringNode;

import static org.junit.jupiter.api.Assertions.*;

class AiAgentToolModelResolutionTest {

    static final class FakeRepository extends AiToolRepository {

        String provider = "provider-test";
        String modelConfig = "model-config-test";

        FakeRepository() {
            super(new JdbcTemplate());
        }

        @Override
        public Optional<AgentModelBinding> findAgentModelBinding(
                String company,
                String merchant,
                String agent) {

            assertEquals("company-test", company);
            assertEquals("merchant-test", merchant);
            assertEquals("agent-test", agent);

            return Optional.of(new AgentModelBinding(
                    company,
                    merchant,
                    agent,
                    "active",
                    provider,
                    modelConfig,
                    0L));
        }
    }

    private final AiChatToolIntegrationTest.Fixture fixture =
            new AiChatToolIntegrationTest.Fixture();

    private final FakeRepository repository = new FakeRepository();

    private final AiAgentModelBindingValidator validator =
            new AiAgentModelBindingValidator(
                    repository, "merchant-test");

    private AiChatMessagesRequest request() {
        return new AiChatMessagesRequest(
                "company-test",
                "provider-test",
                "test/model",
                null,
                List.of(new AiChatMessagesRequest.Message(
                        "user",
                        StringNode.valueOf("Calculate 2 + 3."))));
    }

    private void validate() {
        fixture.service.requireAgentToolModel(
                request(),
                "agent-test",
                validator);
    }

    @Test
    void resolvesExternalModelToStoredConfigurationUuid() {
        var binding = fixture.service.requireAgentToolModel(
                request(),
                "agent-test",
                validator);

        assertEquals("provider-test", binding.providerId());
        assertEquals("model-config-test", binding.modelConfigId());
        assertEquals(0, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
    }

    @Test
    void differentBoundProviderIsRejected() {
        repository.provider = "other-provider";

        var error = assertThrows(
                ResponseStatusException.class,
                this::validate);

        assertEquals(409, error.getStatusCode().value());
        assertEquals(0, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
    }

    @Test
    void externalModelNameCannotReplaceConfigurationUuid() {
        repository.modelConfig = "test/model";

        var error = assertThrows(
                ResponseStatusException.class,
                this::validate);

        assertEquals(409, error.getStatusCode().value());
        assertEquals(0, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
    }

    @Test
    void disabledModelIsRejectedBeforeAnyModelCall() {
        fixture.models.enabled = false;

        var error = assertThrows(
                ResponseStatusException.class,
                this::validate);

        assertEquals(409, error.getStatusCode().value());
        assertEquals(0, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
    }
}