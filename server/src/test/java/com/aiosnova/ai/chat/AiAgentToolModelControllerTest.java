package com.aiosnova.ai.chat;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import com.aiosnova.ai.model.AiModelRepository.ModelSummary;
import com.aiosnova.ai.model.AiModelStateService;
import com.aiosnova.ai.model.ModelCapabilities;
import com.aiosnova.ai.model.OpenRouterModelService;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class AiAgentToolModelControllerTest {

    private final JsonMapper json = JsonMapper.builder().build();

    private void addModel(
            AiChatToolIntegrationTest.Fixture fixture,
            String provider,
            String externalId,
            String configId) {

        var original = fixture.models.findByExternalId(
                "company-test", "provider-test", "test/model").orElseThrow();

        fixture.models.additionalModels.put(
                provider + "\n" + externalId,
                new ModelSummary(
                        configId, "company-test", provider, externalId,
                        "Alternate test model", "chat", "enabled", "",
                        32000, 32000, null, original.capabilities(),
                        original.capabilitiesCheckedAt(), null, 0L));
    }

    private MvcResult send(
            AiChatToolIntegrationTest.Fixture fixture,
            AiChatService service,
            String provider,
            String model) throws Exception {

        var policy = new AiToolAuthorizationFixture(fixture);
        var mvc = MockMvcBuilders.standaloneSetup(
                new AiChatController(service, policy.authorization)).build();
        var body = json.writeValueAsString(Map.of(
                "companyId", "company-test",
                "agentId", "agent-test",
                "providerId", provider,
                "modelId", model,
                "temperature", 1.9,
                "messages", List.of(Map.of(
                        "role", "user", "content", "Calculate 2 + 3."))));

        return mvc.perform(post("/api/ai/chat/messages/tools")
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn();
    }

    private void assertStopped(
            MvcResult result,
            AiChatToolIntegrationTest.Fixture fixture,
            int status, int requests, int executions) {

        assertEquals(status, result.getResponse().getStatus());
        assertEquals(requests, fixture.transport.requests.size());
        assertEquals(executions, fixture.calculator.executions);
    }

    private String message(MvcResult result) {
        return json.readTree(new String(
                result.getResponse().getContentAsByteArray(),
                StandardCharsets.UTF_8))
                .path("message").asString("");
    }

    @Test
    void matchingBindingCompletesTwoRounds() throws Exception {
        for (boolean temperatureSupported : List.of(true, false)) {
            for (boolean topPSupported : List.of(true, false)) {
                var fixture = new AiChatToolIntegrationTest.Fixture();

                fixture.supportsTemperature = temperatureSupported;
                fixture.supportsTopP = topPSupported;

                fixture.agentTemperature = 0.0;
                fixture.agentTopP = 0.85;
                fixture.agentMaxTokens = 512;

                fixture.transport.afterFirstResponse = () -> {
                    fixture.agentTemperature = 1.2;
                    fixture.agentTopP = 0.4;
                    fixture.agentMaxTokens = 1024;

                    fixture.supportsTemperature = !temperatureSupported;
                    fixture.supportsTopP = !topPSupported;
                };

                var result = send(
                        fixture,
                        fixture.service,
                        "provider-test",
                        "test/model");

                assertStopped(result, fixture, 200, 2, 1);

                for (var request : fixture.transport.requests) {
                    var body = json.readTree(
                            AiChatToolIntegrationTest.readRequestBody(request));

                    assertEquals(512, body.path("max_tokens").asInt());

                    assertEquals(
                            temperatureSupported,
                            body.has("temperature"));

                    if (temperatureSupported) {
                        assertEquals(
                                0.0,
                                body.path("temperature").asDouble());
                    }

                    assertEquals(topPSupported, body.has("top_p"));

                    if (topPSupported) {
                        assertEquals(
                                0.85,
                                body.path("top_p").asDouble());
                    }
                }
            }
        }
    }

    @Test
    void tamperedValidProviderIsRejected() throws Exception {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        fixture.providers.additionalProviderIds.add("other-provider");
        addModel(fixture, "other-provider", "test/alternate", "alternate-config");

        var state = new AiModelStateService(fixture.models, fixture.providers);
        assertEquals("alternate-config", state.requireEnabledModel(
                "company-test", "other-provider", "test/alternate").id());
        assertTrue(fixture.providers.findExecutionConfig(
                "company-test", "other-provider").isPresent());

        var result = send(fixture, fixture.service, "other-provider", "test/alternate");
        assertStopped(result, fixture, 409, 0, 0);
        assertTrue(message(result).contains("fixed model binding"));
    }

    @Test
    void tamperedValidModelIsRejected() throws Exception {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        addModel(fixture, "provider-test", "test/alternate", "alternate-config");
        var state = new AiModelStateService(fixture.models, fixture.providers);
        assertEquals("alternate-config", state.requireEnabledModel(
                "company-test", "provider-test", "test/alternate").id());

        var result = send(fixture, fixture.service, "provider-test", "test/alternate");
        assertStopped(result, fixture, 409, 0, 0);
        assertTrue(message(result).contains("fixed model binding"));
    }

    @Test
    void bindingChangedAfterFirstResponseStopsTool() throws Exception {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        addModel(fixture, "provider-test", "test/alternate", "alternate-config");
        fixture.transport.afterFirstResponse = () -> fixture.boundModelConfig = "alternate-config";

        var result = send(fixture, fixture.service, "provider-test", "test/model");
        assertStopped(result, fixture, 409, 1, 0);
        assertTrue(message(result).contains("fixed model binding"));
    }

    @Test
    void bindingChangedAfterExecutionStopsSecondRequest() throws Exception {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        addModel(fixture, "provider-test", "test/alternate", "alternate-config");
        fixture.calculator.afterExecution = () -> fixture.boundModelConfig = "alternate-config";

        var result = send(fixture, fixture.service, "provider-test", "test/model");
        assertStopped(result, fixture, 409, 1, 1);
        assertTrue(message(result).contains("fixed model binding"));
    }

    @Test
    void missingBindingValidatorRejectsToolChat() throws Exception {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var catalog = new OpenRouterModelService() {
            @Override
            public ModelCapabilities loadCapabilities(String modelId) {
                throw new AssertionError(
                        "Missing validator must reject before catalog lookup.");
            }
        };
        var service = new AiChatService(
                fixture.providers, fixture.crypto, fixture.transport,
                new AiChatMessageValidator(catalog),
                new AiModelStateService(fixture.models, fixture.providers));

        var result = send(fixture, service, "provider-test", "test/model");
        assertStopped(result, fixture, 503, 0, 0);
        assertTrue(message(result).contains("binding validation is not configured"));
    }

    @Test
    void invalidMetadataStopsBeforeModelAndTool() throws Exception {
        var fixture = new AiChatToolIntegrationTest.Fixture();

        fixture.metadataFailure = new java.io.IOException(
                "SECRET_INTERNAL_CATALOG_DETAILS");

        var result = send(
                fixture,
                fixture.service,
                "provider-test",
                "test/model");

        assertStopped(result, fixture, 502, 0, 0);
        assertEquals(1, fixture.metadataRequests);

        assertEquals(
                "Unable to load model parameter support.",
                message(result));

        assertFalse(
                message(result).contains("SECRET_INTERNAL_CATALOG_DETAILS"));
    }

    @Test
    void metadataTimeoutStopsBeforeModelAndTool() throws Exception {
        var fixture = new AiChatToolIntegrationTest.Fixture();

        fixture.metadataFailure = new java.net.http.HttpTimeoutException(
                "SECRET_INTERNAL_TIMEOUT_DETAILS");

        var result = send(
                fixture,
                fixture.service,
                "provider-test",
                "test/model");

        assertStopped(result, fixture, 504, 0, 0);
        assertEquals(1, fixture.metadataRequests);

        assertEquals(
                "Loading model parameter support timed out.",
                message(result));

        assertFalse(
                message(result).contains("SECRET_INTERNAL_TIMEOUT_DETAILS"));
    }

    @Test
    void invalidAgentTemperatureStopsBeforeCatalogAndModel()
            throws Exception {

        for (double value : new double[] {
                -0.1,
                2.1,
                Double.NaN,
                Double.POSITIVE_INFINITY
        }) {
            var fixture = new AiChatToolIntegrationTest.Fixture();
            fixture.agentTemperature = value;

            var result = send(
                    fixture,
                    fixture.service,
                    "provider-test",
                    "test/model");

            assertStopped(result, fixture, 409, 0, 0);
            assertEquals(0, fixture.metadataRequests);

            assertEquals(
                    "The Agent Temperature configuration is invalid.",
                    message(result));
        }
    }

    @Test
    void invalidAgentTopPStopsBeforeCatalogAndModel()
            throws Exception {

        for (double value : new double[] {
                0.0,
                -0.1,
                1.1,
                Double.NaN,
                Double.POSITIVE_INFINITY
        }) {
            var fixture = new AiChatToolIntegrationTest.Fixture();
            fixture.agentTopP = value;

            // 即使模型不支持 Top P，也不能放过非法的已保存配置。
            fixture.supportsTopP = false;

            var result = send(
                    fixture,
                    fixture.service,
                    "provider-test",
                    "test/model");

            assertStopped(result, fixture, 409, 0, 0);
            assertEquals(0, fixture.metadataRequests);

            assertEquals(
                    "The Agent Top P configuration is invalid.",
                    message(result));
        }
    }

    @Test
    void invalidAgentMaxTokensStopsBeforeCatalogAndModel()
            throws Exception {

        // Fixture 中模型的有效 Context 是 32000。
        for (int value : new int[] { -1, 0, 32001 }) {
            var fixture = new AiChatToolIntegrationTest.Fixture();
            fixture.agentMaxTokens = value;

            var result = send(
                    fixture,
                    fixture.service,
                    "provider-test",
                    "test/model");

            assertStopped(result, fixture, 409, 0, 0);
            assertEquals(0, fixture.metadataRequests);

            assertEquals(
                    "The Agent Max Tokens must be positive "
                            + "and must not exceed the model Context.",
                    message(result));
        }
    }
}
