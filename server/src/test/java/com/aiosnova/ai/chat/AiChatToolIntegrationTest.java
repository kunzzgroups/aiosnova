package com.aiosnova.ai.chat;

import com.aiosnova.ai.model.AiModelRepository;
import com.aiosnova.ai.model.AiModelStateService;
import com.aiosnova.ai.model.ModelCapabilities;
import com.aiosnova.ai.model.OpenRouterModelService;
import com.aiosnova.ai.provider.AiApiKeyCrypto;
import com.aiosnova.ai.provider.AiProviderRepository;
import com.aiosnova.ai.tool.AiToolDefinition;
import com.aiosnova.ai.tool.AiToolHandler;
import com.aiosnova.ai.tool.AiToolRegistry;
import com.aiosnova.ai.tool.builtin.CalculatorTool;

import java.net.http.HttpRequest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

class AiChatToolIntegrationTest {

    private static final String COMPANY = "company-test";
    private static final String PROVIDER = "provider-test";
    private static final String MODEL = "test/model";
    private static final String FAKE_KEY = "fake-integration-key";

    private static final JsonMapper JSON =
            JsonMapper.builder().build();

    static final class FakeProviders
            extends AiProviderRepository {

        boolean enabled = true;
        final AiApiKeyCrypto crypto;
        final byte[] ciphertext;

        FakeProviders(AiApiKeyCrypto crypto) {
            // No DataSource: accidental SQL calls cannot reach a database.
            super(new JdbcTemplate());
            this.crypto = crypto;
            this.ciphertext = crypto.encrypt(
                    COMPANY, PROVIDER, FAKE_KEY);
        }

        @Override
        public List<ProviderSummary> findByCompany(String companyId) {
            if (!COMPANY.equals(companyId)) {
                return List.of();
            }

            return List.of(new ProviderSummary(
                    PROVIDER,
                    COMPANY,
                    "Test Provider",
                    "openrouter",
                    "https://openrouter.ai/api/v1",
                    enabled,
                    true,
                    0L));
        }

        @Override
        public Optional<ProviderExecutionConfig> findExecutionConfig(
                String companyId,
                String providerId) {

            if (!COMPANY.equals(companyId)
                    || !PROVIDER.equals(providerId)) {
                return Optional.empty();
            }

            return Optional.of(new ProviderExecutionConfig(
                    PROVIDER,
                    COMPANY,
                    "openrouter",
                    "https://openrouter.ai/api/v1",
                    enabled,
                    ciphertext.clone(),
                    crypto.keyId()));
        }
    }

    static final class FakeModels
            extends AiModelRepository {

        boolean enabled = true;
        boolean supportsTools = true;

        FakeModels() {
            super(new JdbcTemplate());
        }

        @Override
        public Optional<ModelSummary> findByExternalId(
                String companyId,
                String providerId,
                String modelId) {

            if (!COMPANY.equals(companyId)
                    || !PROVIDER.equals(providerId)
                    || !MODEL.equals(modelId)) {
                return Optional.empty();
            }

            return Optional.of(new ModelSummary(
                    "model-config-test",
                    COMPANY,
                    PROVIDER,
                    MODEL,
                    "Test Model",
                    "chat",
                    enabled ? "enabled" : "disabled",
                    "",
                    32000,
                    32000,
                    null,
                    new ModelCapabilities(
                            true, false, supportsTools, 32000),
                    Instant.parse("2026-01-01T00:00:00Z"),
                    null,
                    0L));
        }
    }

    static final class FakeTransport
            implements AiChatService.ChatTransport {

        final List<HttpRequest> requests = new ArrayList<>();
        Runnable afterFirstResponse = () -> {};
        String firstResponseOverride;

        @Override
        public AiChatService.ChatHttpResult send(
                HttpRequest request) {

            requests.add(request);

            if (requests.size() == 1) {
                String body = firstResponseOverride != null
                        ? firstResponseOverride
                        : firstResponse();
                afterFirstResponse.run();

                return new AiChatService.ChatHttpResult(200, body);
            }

            if (requests.size() == 2) {
                return new AiChatService.ChatHttpResult(
                        200,
                        """
                        {
                          "choices": [{
                            "finish_reason": "stop",
                            "message": {
                              "role": "assistant",
                              "content": "The answer is 5."
                            }
                          }]
                        }
                        """);
            }

            throw new AssertionError(
                    "Unexpected retry or third request.");
        }
    }

    static final class CountingCalculator
            implements AiToolHandler {

        private final CalculatorTool calculator =
                new CalculatorTool();

        int executions;
        boolean fail;
        Runnable afterExecution = () -> {};

        @Override
        public AiToolDefinition definition() {
            return calculator.definition();
        }

        @Override
        public void validateArguments(
                Map<String, Object> arguments) {
            calculator.validateArguments(arguments);
        }

        @Override
        public Map<String, Object> execute(
                Map<String, Object> arguments) {

            executions++;

            if (fail) {
                throw new IllegalStateException(
                        "SECRET_INTERNAL_DETAILS");
            }

            var output = calculator.execute(arguments);
            afterExecution.run();
            return output;
        }
    }

    static final class Fixture {

        final AiApiKeyCrypto crypto = newCrypto();
        final FakeProviders providers = new FakeProviders(crypto);
        final FakeModels models = new FakeModels();
        final FakeTransport transport = new FakeTransport();
        final CountingCalculator calculator =
                new CountingCalculator();

        final AiToolRegistry registry =
                new AiToolRegistry(List.of(
                        new AiToolRegistry.Registration(
                                "calculator", calculator)));

        final AiChatService service;

        Fixture() {
            // Override catalog lookup: never request real model metadata.
            var catalog = new OpenRouterModelService() {
                @Override
                public ModelCapabilities loadCapabilities(
                        String modelId) {
                    return new ModelCapabilities(
                            true, false, true, 32000);
                }
            };

            service = new AiChatService(
                    providers,
                    crypto,
                    transport,
                    new AiChatMessageValidator(catalog),
                    new AiModelStateService(models, providers));
        }

        AiChatService.ChatReply run() {
            return run(COMPANY, PROVIDER);
        }

        AiChatService.ChatReply run(
                String companyId,
                String providerId) {

            var input = new AiChatMessagesRequest(
                    companyId,
                    providerId,
                    MODEL,
                    null,
                    List.of(new AiChatMessagesRequest.Message(
                            "user",
                            JSON.readTree("\"Calculate 2 + 3.\""))));

            return service.chatMessagesWithTools(
                    input,
                    registry,
                    Set.of("calc_run"));
        }
    }

    private static AiApiKeyCrypto newCrypto() {
        byte[] masterKey = new byte[32];
        new SecureRandom().nextBytes(masterKey);

        return new AiApiKeyCrypto(
                Base64.getEncoder().encodeToString(masterKey));
    }

    private static String firstResponse() {
        String arguments = JSON.writeValueAsString(
                Map.of("operation", "add", "a", 2, "b", 3));

        return JSON.writeValueAsString(
                Map.of("choices", List.of(
                        Map.of(
                                "finish_reason", "tool_calls",
                                "message", Map.of(
                                        "role", "assistant",
                                        "tool_calls", List.of(
                                                Map.of(
                                                        "id", "call_add",
                                                        "type", "function",
                                                        "function", Map.of(
                                                                "name", "calc_run",
                                                                "arguments",
                                                                arguments))))))));
    }

    private static ResponseStatusException expectStatus(
            int expected,
            Runnable action) {

        var error = assertThrows(
                ResponseStatusException.class,
                action::run);

        assertEquals(expected, error.getStatusCode().value());
        return error;
    }

    @Test
    void successfulFlowUsesScopedKeyAndBoundModel() {
        var f = new Fixture();

        var reply = f.run();

        assertEquals(MODEL, reply.modelId());
        assertEquals("The answer is 5.", reply.reply());
        assertEquals(2, f.transport.requests.size());
        assertEquals(1, f.calculator.executions);

        for (var request : f.transport.requests) {
            assertEquals(
                    "Bearer " + FAKE_KEY,
                    request.headers()
                            .firstValue("Authorization")
                            .orElseThrow());
        }
    }

    @Test
    void anotherCompanyCannotUseThisProvider() {
        var f = new Fixture();

        expectStatus(
                404,
                () -> f.run("other-company", PROVIDER));

        assertEquals(0, f.transport.requests.size());
        assertEquals(0, f.calculator.executions);
    }

    @Test
    void anotherProviderIsNotSubstituted() {
        var f = new Fixture();

        expectStatus(
                404,
                () -> f.run(COMPANY, "other-provider"));

        assertEquals(0, f.transport.requests.size());
        assertEquals(0, f.calculator.executions);
    }

    @Test
    void initiallyDisabledModelStopsBeforeFirstRequest() {
        var f = new Fixture();
        f.models.enabled = false;

        expectStatus(409, () -> f.run());

        assertEquals(0, f.transport.requests.size());
        assertEquals(0, f.calculator.executions);
    }

    @Test
    void initiallyDisabledProviderStopsBeforeFirstRequest() {
        var f = new Fixture();
        f.providers.enabled = false;

        expectStatus(409, () -> f.run());

        assertEquals(0, f.transport.requests.size());
        assertEquals(0, f.calculator.executions);
    }

    @Test
    void unsupportedToolCallingStopsBeforeFirstRequest() {
        var f = new Fixture();
        f.models.supportsTools = false;

        expectStatus(409, () -> f.run());

        assertEquals(0, f.transport.requests.size());
        assertEquals(0, f.calculator.executions);
    }

    @Test
    void disablingAfterFirstResponsePreventsToolExecution() {
        var f = new Fixture();

        f.transport.afterFirstResponse =
                () -> f.models.enabled = false;

        expectStatus(409, () -> f.run());

        assertEquals(1, f.transport.requests.size());
        assertEquals(0, f.calculator.executions);
    }

    @Test
    void disablingAfterToolExecutionPreventsSecondRequest() {
        var f = new Fixture();

        f.calculator.afterExecution =
                () -> f.models.enabled = false;

        expectStatus(409, () -> f.run());

        assertEquals(1, f.transport.requests.size());
        assertEquals(1, f.calculator.executions);
    }

    @Test
    void toolFailureStopsWithoutRetry() {
        var f = new Fixture();
        f.calculator.fail = true;

        var error = expectStatus(502, () -> f.run());

        assertFalse(error.getMessage().contains("SECRET"));
        assertEquals(1, f.transport.requests.size());
        assertEquals(1, f.calculator.executions);
    }

    @Test
    void reenabledModelWorksOnANewRequest() {
        var f = new Fixture();
        f.models.enabled = false;

        expectStatus(409, () -> f.run());
        assertEquals(0, f.transport.requests.size());

        f.models.enabled = true;

        assertEquals("The answer is 5.", f.run().reply());
        assertEquals(2, f.transport.requests.size());
        assertEquals(1, f.calculator.executions);
    }
}
