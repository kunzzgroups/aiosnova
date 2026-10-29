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
                                new AiChatController(service, policy.authorization, new AiToolChatLifecycle(service, policy.authorization, new AiToolChatRequests()), fixture.access)).build();
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

        @Test
        void validAgentParameterBoundariesAreAccepted() throws Exception {
                for (double temperature : new double[] { 0.0, 2.0 }) {
                        for (double topP : new double[] { 0.0001, 1.0 }) {
                                for (int maxTokens : new int[] { 1, 32000 }) {
                                        var fixture = new AiChatToolIntegrationTest.Fixture();

                                        fixture.supportsTemperature = true;
                                        fixture.supportsTopP = true;

                                        fixture.agentTemperature = temperature;
                                        fixture.agentTopP = topP;
                                        fixture.agentMaxTokens = maxTokens;

                                        var result = send(
                                                        fixture,
                                                        fixture.service,
                                                        "provider-test",
                                                        "test/model");

                                        assertStopped(result, fixture, 200, 2, 1);
                                        assertEquals(1, fixture.metadataRequests);

                                        for (var request : fixture.transport.requests) {
                                                var body = json.readTree(
                                                                AiChatToolIntegrationTest.readRequestBody(request));

                                                assertTrue(body.has("temperature"));
                                                assertTrue(body.has("top_p"));

                                                assertEquals(
                                                                temperature,
                                                                body.path("temperature").asDouble());

                                                assertEquals(
                                                                topP,
                                                                body.path("top_p").asDouble());

                                                assertEquals(
                                                                maxTokens,
                                                                body.path("max_tokens").asInt());
                                        }
                                }
                        }
                }
        }

        @Test
        void nextChatReadsLatestAgentParameters() throws Exception {
                var fixture = new AiChatToolIntegrationTest.Fixture();

                fixture.supportsTemperature = true;
                fixture.supportsTopP = true;

                fixture.agentTemperature = 0.3;
                fixture.agentTopP = 0.8;
                fixture.agentMaxTokens = 512;

                // 第一轮返回后，模拟数据库配置发生变化。
                fixture.transport.afterFirstResponse = () -> {
                        fixture.agentTemperature = 1.1;
                        fixture.agentTopP = 0.6;
                        fixture.agentMaxTokens = 1024;
                };

                var firstResult = send(
                                fixture,
                                fixture.service,
                                "provider-test",
                                "test/model");

                assertStopped(firstResult, fixture, 200, 2, 1);
                assertEquals(1, fixture.metadataRequests);

                for (var request : fixture.transport.requests) {
                        var body = json.readTree(
                                        AiChatToolIntegrationTest.readRequestBody(request));

                        assertEquals(0.3, body.path("temperature").asDouble());
                        assertEquals(0.8, body.path("top_p").asDouble());
                        assertEquals(512, body.path("max_tokens").asInt());
                }

                // 只重置模拟传输的计数，保留同一个 Fixture 和 Service。
                fixture.transport.requests.clear();
                fixture.transport.afterFirstResponse = () -> {
                };

                var secondResult = send(
                                fixture,
                                fixture.service,
                                "provider-test",
                                "test/model");

                // Calculator 计数没有清空，两条聊天累计执行两次。
                assertStopped(secondResult, fixture, 200, 2, 2);
                assertEquals(2, fixture.metadataRequests);

                for (var request : fixture.transport.requests) {
                        var body = json.readTree(
                                        AiChatToolIntegrationTest.readRequestBody(request));

                        assertEquals(1.1, body.path("temperature").asDouble());
                        assertEquals(0.6, body.path("top_p").asDouble());
                        assertEquals(1024, body.path("max_tokens").asInt());
                }
        }

        @Test
        void nextChatReloadsParameterSupport() throws Exception {
                var fixture = new AiChatToolIntegrationTest.Fixture();

                fixture.agentTemperature = 0.4;
                fixture.agentTopP = 0.75;
                fixture.agentMaxTokens = 512;

                boolean[][] supportStates = {
                                { true, true },
                                { false, false },
                                { true, true }
                };

                for (int index = 0; index < supportStates.length; index++) {
                        boolean temperatureSupported = supportStates[index][0];
                        boolean topPSupported = supportStates[index][1];

                        fixture.supportsTemperature = temperatureSupported;
                        fixture.supportsTopP = topPSupported;

                        // 只重置模拟传输记录，保留同一个 Service。
                        fixture.transport.requests.clear();

                        var result = send(
                                        fixture,
                                        fixture.service,
                                        "provider-test",
                                        "test/model");

                        assertStopped(result, fixture, 200, 2, index + 1);
                        assertEquals(index + 1, fixture.metadataRequests);

                        for (var request : fixture.transport.requests) {
                                var body = json.readTree(
                                                AiChatToolIntegrationTest.readRequestBody(request));

                                assertEquals(
                                                temperatureSupported,
                                                body.has("temperature"));

                                assertEquals(
                                                topPSupported,
                                                body.has("top_p"));

                                if (temperatureSupported) {
                                        assertEquals(
                                                        0.4,
                                                        body.path("temperature").asDouble());
                                }

                                if (topPSupported) {
                                        assertEquals(
                                                        0.75,
                                                        body.path("top_p").asDouble());
                                }

                                assertEquals(512, body.path("max_tokens").asInt());
                        }
                }
        }

        @Test
        void nextChatRecoversAfterMetadataFailure() throws Exception {
                var fixture = new AiChatToolIntegrationTest.Fixture();

                fixture.supportsTemperature = true;
                fixture.supportsTopP = true;

                fixture.agentTemperature = 0.3;
                fixture.agentTopP = 0.8;
                fixture.agentMaxTokens = 512;

                fixture.metadataFailure = new java.io.IOException(
                                "SECRET_INTERNAL_CATALOG_FAILURE");

                var failedResult = send(
                                fixture,
                                fixture.service,
                                "provider-test",
                                "test/model");

                assertStopped(failedResult, fixture, 502, 0, 0);
                assertEquals(1, fixture.metadataRequests);

                assertEquals(
                                "Unable to load model parameter support.",
                                message(failedResult));

                assertFalse(
                                message(failedResult)
                                                .contains("SECRET_INTERNAL_CATALOG_FAILURE"));

                // 恢复目录，并模拟 Agent 配置已更新。
                // 保留同一个 Fixture 和 Service。
                fixture.metadataFailure = null;
                fixture.agentTemperature = 0.9;
                fixture.agentTopP = 0.6;
                fixture.agentMaxTokens = 1024;

                var recoveredResult = send(
                                fixture,
                                fixture.service,
                                "provider-test",
                                "test/model");

                assertStopped(recoveredResult, fixture, 200, 2, 1);
                assertEquals(2, fixture.metadataRequests);

                var reply = json.readTree(new String(
                                recoveredResult.getResponse().getContentAsByteArray(),
                                StandardCharsets.UTF_8));

                assertEquals(
                                "The answer is 5.",
                                reply.path("reply").asString());

                for (var request : fixture.transport.requests) {
                        var body = json.readTree(
                                        AiChatToolIntegrationTest.readRequestBody(request));

                        assertTrue(body.has("temperature"));
                        assertTrue(body.has("top_p"));

                        assertEquals(
                                        0.9,
                                        body.path("temperature").asDouble());

                        assertEquals(
                                        0.6,
                                        body.path("top_p").asDouble());

                        assertEquals(
                                        1024,
                                        body.path("max_tokens").asInt());
                }
        }
}
