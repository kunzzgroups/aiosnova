package com.aiosnova.ai.chat;

import java.util.Optional;

import com.aiosnova.ai.tool.AiToolRepository;
import com.aiosnova.ai.tool.AiToolRepository.AgentModelBinding;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class AiAgentModelBindingValidatorTest {

    private static final String COMPANY = "company-test";
    private static final String MERCHANT = "merchant-test";
    private static final String AGENT = "agent-test";
    private static final String PROVIDER = "provider-test";
    private static final String MODEL_CONFIG = "model-config-test";

    static final class FakeRepository extends AiToolRepository {

        AgentModelBinding binding = new AgentModelBinding(
                COMPANY, MERCHANT, AGENT, "active",
                PROVIDER, MODEL_CONFIG, 3L);

        FakeRepository() {
            super(new JdbcTemplate());
        }

        @Override
        public Optional<AgentModelBinding> findAgentModelBinding(
                String company,
                String merchant,
                String agent) {

            assertEquals(COMPANY, company);
            assertEquals(MERCHANT, merchant);
            assertEquals(AGENT, agent);

            return Optional.ofNullable(binding);
        }
    }

    private final FakeRepository repository = new FakeRepository();

    private final AiAgentModelBindingValidator validator =
            new AiAgentModelBindingValidator(repository, MERCHANT);

    private void expectStatus(
            int status,
            String provider,
            String modelConfig) {

        var error = assertThrows(
                ResponseStatusException.class,
                () -> validator.requireMatch(
                        COMPANY, AGENT, provider, modelConfig));

        assertEquals(status, error.getStatusCode().value());
    }

    @Test
    void exactFixedBindingIsAccepted() {
        var result = validator.requireMatch(
                COMPANY, AGENT, PROVIDER, MODEL_CONFIG);

        assertEquals(repository.binding, result);
        assertEquals(3L, result.version());
    }

    @Test
    void differentProviderIsRejected() {
        expectStatus(409, "other-provider", MODEL_CONFIG);
    }

    @Test
    void differentModelConfigurationIsRejected() {
        expectStatus(409, PROVIDER, "other-model-config");
    }

    @Test
    void autoBindingAcceptsThePreviouslyValidatedModel() {
        repository.binding = new AgentModelBinding(
                COMPANY, MERCHANT, AGENT, "active",
                null, null, 3L);

        var result = validator.requireMatch(
                COMPANY, AGENT, PROVIDER, MODEL_CONFIG);

        assertNull(result.providerId());
        assertNull(result.modelConfigId());
    }

    @Test
    void fixedBindingCannotBecomeAutoDuringRequest() {
        var initial = validator.requireMatch(
                COMPANY, AGENT, PROVIDER, MODEL_CONFIG);

        repository.binding = new AgentModelBinding(
                COMPANY, MERCHANT, AGENT, "active", null, null, 4L);

        var current = validator.requireMatch(
                COMPANY, AGENT, PROVIDER, MODEL_CONFIG);

        var error = assertThrows(
                ResponseStatusException.class,
                () -> validator.requireUnchanged(initial, current));

        assertEquals(409, error.getStatusCode().value());
    }

    @Test
    void autoCannotBecomeFixedDuringRequestEvenForSameModel() {
        repository.binding = new AgentModelBinding(
                COMPANY, MERCHANT, AGENT, "active", null, null, 3L);
        var initial = validator.requireMatch(
                COMPANY, AGENT, PROVIDER, MODEL_CONFIG);

        repository.binding = new AgentModelBinding(
                COMPANY, MERCHANT, AGENT, "active", PROVIDER, MODEL_CONFIG, 4L);
        var current = validator.requireMatch(
                COMPANY, AGENT, PROVIDER, MODEL_CONFIG);

        var error = assertThrows(
                ResponseStatusException.class,
                () -> validator.requireUnchanged(initial, current));

        assertEquals(409, error.getStatusCode().value());
    }

    @Test
    void unchangedAutoBindingAllowsUnrelatedVersionChange() {
        var initial = new AgentModelBinding(
                COMPANY, MERCHANT, AGENT, "active", null, null, 3L);
        var current = new AgentModelBinding(
                COMPANY, MERCHANT, AGENT, "active", null, null, 4L);

        assertDoesNotThrow(() -> validator.requireUnchanged(initial, current));
    }

    @Test
    void incompleteBindingIsRejected() {
        repository.binding = new AgentModelBinding(
                COMPANY, MERCHANT, AGENT, "active",
                PROVIDER, null, 3L);

        expectStatus(409, PROVIDER, MODEL_CONFIG);

        repository.binding = new AgentModelBinding(
                COMPANY, MERCHANT, AGENT, "active",
                null, MODEL_CONFIG, 3L);

        expectStatus(409, PROVIDER, MODEL_CONFIG);
    }

    @Test
    void missingOrInactiveAgentIsRejected() {
        repository.binding = null;
        expectStatus(403, PROVIDER, MODEL_CONFIG);

        for (String status : new String[]{"disabled", "draft"}) {
            repository.binding = new AgentModelBinding(
                    COMPANY, MERCHANT, AGENT, status,
                    PROVIDER, MODEL_CONFIG, 3L);

            expectStatus(403, PROVIDER, MODEL_CONFIG);
        }
    }

    @Test
    void returnedScopeMustMatchCompanyMerchantAndAgent() {
        repository.binding = new AgentModelBinding(
                "other-company", MERCHANT, AGENT, "active",
                PROVIDER, MODEL_CONFIG, 3L);
        expectStatus(403, PROVIDER, MODEL_CONFIG);

        repository.binding = new AgentModelBinding(
                COMPANY, "other-merchant", AGENT, "active",
                PROVIDER, MODEL_CONFIG, 3L);
        expectStatus(403, PROVIDER, MODEL_CONFIG);

        repository.binding = new AgentModelBinding(
                COMPANY, MERCHANT, "other-agent", "active",
                PROVIDER, MODEL_CONFIG, 3L);
        expectStatus(403, PROVIDER, MODEL_CONFIG);
    }

    @Test
    void invalidModelConfigurationIdIsRejected() {
        expectStatus(400, PROVIDER, "invalid/model/config");
    }
}
