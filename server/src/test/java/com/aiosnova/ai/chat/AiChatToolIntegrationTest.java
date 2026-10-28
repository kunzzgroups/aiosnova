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
import com.aiosnova.ai.tool.AiToolRepository;
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
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.HashSet;
import java.util.HashMap;

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

    private static final JsonMapper JSON = JsonMapper.builder().build();

    static final class FakeProviders
            extends AiProviderRepository {

        final Set<String> additionalProviderIds = new HashSet<>();

        boolean enabled = true;
        final AiApiKeyCrypto crypto;
        final byte[] ciphertext;
        final String company;

        FakeProviders(AiApiKeyCrypto crypto) {
            this(crypto, COMPANY);
        }

        FakeProviders(AiApiKeyCrypto crypto, String company) {
            super(new JdbcTemplate());

            this.company = company;
            this.crypto = crypto;
            this.ciphertext = crypto.encrypt(
                    company, PROVIDER, FAKE_KEY);
        }

        @Override
        public List<ProviderSummary> findByCompany(String companyId) {
            if (!company.equals(companyId)) {
                return List.of();
            }

            var ids = new ArrayList<String>();
            ids.add(PROVIDER);
            ids.addAll(additionalProviderIds);
            return ids.stream()
                    .map(id -> new ProviderSummary(
                            id,
                            company,
                            "Test Provider",
                            "openrouter",
                            "https://openrouter.ai/api/v1",
                            enabled,
                            true,
                            0L))
                    .toList();
        }

        @Override
        public Optional<ProviderExecutionConfig> findExecutionConfig(
                String companyId,
                String providerId) {

            if (!company.equals(companyId)
                    || (!PROVIDER.equals(providerId)
                            && !additionalProviderIds.contains(providerId))) {
                return Optional.empty();
            }

            return Optional.of(new ProviderExecutionConfig(
                    providerId,
                    company,
                    "openrouter",
                    "https://openrouter.ai/api/v1",
                    enabled,
                    PROVIDER.equals(providerId)
                            ? ciphertext.clone()
                            : crypto.encrypt(company, providerId, FAKE_KEY),
                    crypto.keyId()));
        }
    }

    static final class FakeModels
            extends AiModelRepository {

        final Map<String, ModelSummary> additionalModels = new HashMap<>();

        boolean enabled = true;
        boolean supportsTools = true;
        final String company;

        FakeModels() {
            this(COMPANY);
        }

        FakeModels(String company) {
            super(new JdbcTemplate());
            this.company = company;
        }

        @Override
        public Optional<ModelSummary> findByExternalId(
                String companyId,
                String providerId,
                String modelId) {

            if (!company.equals(companyId)) {
                return Optional.empty();
            }

            var additional = additionalModels.get(providerId + "\n" + modelId);
            if (additional != null) {
                return Optional.of(additional);
            }

            if (!PROVIDER.equals(providerId) || !MODEL.equals(modelId)) {
                return Optional.empty();
            }

            return Optional.of(new ModelSummary(
                    "model-config-test",
                    company,
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
        Runnable afterFirstResponse = () -> {
        };
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

        private final CalculatorTool calculator = new CalculatorTool();

        int executions;
        boolean fail;
        Runnable afterExecution = () -> {
        };

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
        final String company;
        final FakeProviders providers;
        final FakeModels models;
        final FakeTransport transport = new FakeTransport();
        final CountingCalculator calculator = new CountingCalculator();
        boolean supportsTopP = false;
        java.io.IOException metadataFailure;
        int metadataRequests;

        final AiToolRegistry registry = new AiToolRegistry(List.of(
                new AiToolRegistry.Registration(
                        "calculator", calculator)));

        final AiChatService service;
        double agentTemperature = 0.7;
        double agentTopP = 1.0;
        int agentMaxTokens = 1024;
        boolean supportsTemperature = true;
        String boundProvider = PROVIDER;
        String boundModelConfig = "model-config-test";

        Fixture() {
            this(COMPANY);
        }

        Fixture(String company) {
            if (company == null
                    || !company.matches("[A-Za-z0-9_-]{1,64}")) {
                throw new IllegalArgumentException("Invalid test company.");
            }

            this.company = company;
            this.providers = new FakeProviders(crypto, company);
            this.models = new FakeModels(company);

            // Override catalog lookup: never request real model metadata.
            var catalog = new OpenRouterModelService() {
                @Override
                public ModelMetadata loadMetadata(String modelId)
                        throws java.io.IOException {

                    metadataRequests++;

                    if (metadataFailure != null) {
                        throw metadataFailure;
                    }

                    return new ModelMetadata(
                            new ModelCapabilities(true, false, true, 32000),
                            Fixture.this.supportsTemperature,
                            Fixture.this.supportsTopP);
                }

                @Override
                public ModelCapabilities loadCapabilities(String modelId) {
                    return new ModelCapabilities(true, false, true, 32000);
                }
            };

            var bindingRepository = new AiToolRepository(new JdbcTemplate()) {
                @Override
                public Optional<AgentExecutionParameters> findAgentExecutionParameters(
                        String requestedCompany, String requestedMerchant, String requestedAgent) {
                    if (!company.equals(requestedCompany)
                            || !"merchant-test".equals(requestedMerchant)) {
                        return Optional.empty();
                    }
                    return Optional.of(new AgentExecutionParameters(
                            company, requestedMerchant, requestedAgent, "active",
                            agentTemperature, agentTopP, agentMaxTokens, 0L));
                }

                @Override
                public Optional<AgentModelBinding> findAgentModelBinding(
                        String requestedCompany,
                        String requestedMerchant,
                        String requestedAgent) {

                    if (!company.equals(requestedCompany)
                            || !"merchant-test".equals(requestedMerchant)) {
                        return Optional.empty();
                    }

                    // Synthetic model binding only. Tool authorization separately
                    // checks Agent access; no actual Agent model rows are read here.
                    return Optional.of(new AgentModelBinding(
                            company,
                            requestedMerchant,
                            requestedAgent,
                            "active",
                            boundProvider,
                            boundModelConfig,
                            0L));
                }
            };
            var bindingValidator = new AiAgentModelBindingValidator(
                    bindingRepository, "merchant-test");

            service = new AiChatService(
                    providers,
                    crypto,
                    transport,
                    new AiChatMessageValidator(catalog),
                    new AiModelStateService(models, providers),
                    bindingValidator,
                    new AiAgentExecutionParameterValidator(bindingRepository, "merchant-test"),
                    catalog);
        }

        AiChatService.ChatReply run() {
            return run(company, PROVIDER);
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

    static String readRequestBody(HttpRequest request)
            throws Exception {

        var subscriber = HttpResponse.BodySubscribers.ofString(
                StandardCharsets.UTF_8);

        request.bodyPublisher().orElseThrow().subscribe(
                new Flow.Subscriber<ByteBuffer>() {
                    @Override
                    public void onSubscribe(Flow.Subscription subscription) {
                        subscriber.onSubscribe(subscription);
                    }

                    @Override
                    public void onNext(ByteBuffer item) {
                        subscriber.onNext(List.of(item));
                    }

                    @Override
                    public void onError(Throwable error) {
                        subscriber.onError(error);
                    }

                    @Override
                    public void onComplete() {
                        subscriber.onComplete();
                    }
                });

        return subscriber.getBody().toCompletableFuture()
                .get(2, TimeUnit.SECONDS);
    }

    @Test
    void secondRequestContainsCalculatorResultAndOriginalToolCall()
            throws Exception {

        var fixture = new Fixture();

        fixture.run();

        assertEquals(2, fixture.transport.requests.size());
        assertEquals(1, fixture.calculator.executions);

        var first = JSON.readTree(
                readRequestBody(fixture.transport.requests.get(0)));

        var second = JSON.readTree(
                readRequestBody(fixture.transport.requests.get(1)));

        assertEquals("auto", first.path("tool_choice").asString());
        assertEquals("none", second.path("tool_choice").asString());

        var originalMessages = first.path("messages");
        var messages = second.path("messages");

        // Second request preserves the original conversation,
        // then appends assistant tool_calls and the tool result.
        assertEquals(originalMessages.size() + 2, messages.size());

        for (int i = 0; i < originalMessages.size(); i++) {
            assertEquals(originalMessages.get(i), messages.get(i));
        }

        var assistant = messages.get(originalMessages.size());
        var toolMessage = messages.get(originalMessages.size() + 1);

        assertEquals("assistant", assistant.path("role").asString());

        var calls = assistant.path("tool_calls");
        assertEquals(1, calls.size());

        var call = calls.get(0);

        assertEquals("call_add", call.path("id").asString());
        assertEquals("function", call.path("type").asString());
        assertEquals(
                "calc_run",
                call.path("function").path("name").asString());

        var arguments = JSON.readTree(
                call.path("function").path("arguments").asString());

        assertEquals("add", arguments.path("operation").asString());
        assertEquals(2, arguments.path("a").asInt());
        assertEquals(3, arguments.path("b").asInt());

        assertEquals("tool", toolMessage.path("role").asString());
        assertEquals(
                call.path("id").asString(),
                toolMessage.path("tool_call_id").asString());

        // Tool content must be a JSON string containing the actual result.
        assertTrue(toolMessage.path("content").isString());

        var output = JSON.readTree(
                toolMessage.path("content").asString());

        assertTrue(output.path("ok").asBoolean());
        assertEquals(
                5,
                output.path("output").path("result").asInt());
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

        f.transport.afterFirstResponse = () -> f.models.enabled = false;

        expectStatus(409, () -> f.run());

        assertEquals(1, f.transport.requests.size());
        assertEquals(0, f.calculator.executions);
    }

    @Test
    void disablingAfterToolExecutionPreventsSecondRequest() {
        var f = new Fixture();

        f.calculator.afterExecution = () -> f.models.enabled = false;

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

    @Test
    void fixtureSupportsLocalCompanyWithoutRealModel() {
        var fixture = new Fixture("company-j1");

        var reply = fixture.run();

        assertEquals("The answer is 5.", reply.reply());
        assertEquals(2, fixture.transport.requests.size());
        assertEquals(1, fixture.calculator.executions);

        assertTrue(fixture.providers
                .findByCompany("company-test").isEmpty());

        assertTrue(fixture.models.findByExternalId(
                "company-test",
                PROVIDER,
                MODEL).isEmpty());
    }
}
