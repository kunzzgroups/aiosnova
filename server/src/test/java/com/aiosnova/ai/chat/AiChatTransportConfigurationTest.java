package com.aiosnova.ai.chat;

import java.util.List;
import java.util.Map;
import java.util.Set;

import com.aiosnova.ai.model.AiModelRepository;
import com.aiosnova.ai.model.AiModelStateService;
import com.aiosnova.ai.model.ModelCapabilities;
import com.aiosnova.ai.model.OpenRouterModelService;
import com.aiosnova.ai.provider.AiApiKeyCrypto;
import com.aiosnova.ai.provider.AiProviderRepository;
import com.aiosnova.ai.tool.AiToolRepository;
import com.aiosnova.ai.tool.AiToolHandler;
import com.aiosnova.ai.tool.AiToolAuthorizationService;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import static com.aiosnova.ai.chat.AiToolSpringTestSupport.*;

class AiChatTransportConfigurationTest {

    private void assertSpringServiceCancellation(
            AiChatToolIntegrationTest.Fixture fixture,
            AiToolChatCancellation cancellation,
            int expectedToolExecutions) {
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();
        try (var context = authorizedContext(fixture, repository)) {
            var service = context.getBean(AiChatService.class);
            var authorization = context.getBean(AiToolAuthorizationService.class);
            assertNotSame(fixture.service, service);
            var request = new AiChatMessagesRequest(
                    "company-test", "provider-test", "test/model", 1.9,
                    List.of(new AiChatMessagesRequest.Message("user",
                            new ObjectMapper().readTree("\"Calculate 2 + 3.\""))));
            var error = assertThrows(ResponseStatusException.class,
                    () -> service.chatMessagesWithAuthorizedTools(
                            request, "agent-test", authorization, cancellation));
            assertEquals(499, error.getStatusCode().value());
            assertEquals("Tool chat request cancelled.", error.getReason());
            assertTrue(cancellation.isCancelled());
            assertEquals(1, fixture.transport.requests.size());
            assertEquals(expectedToolExecutions, fixture.calculator.executions);
            assertTrue(repository.active);
            assertTrue(repository.assigned);
        }
    }

    @Test
    void springCreatedServiceStopsAfterFirstResponseCancellation() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var cancellation = new AiToolChatCancellation();
        fixture.transport.afterFirstResponse = cancellation::cancel;
        assertSpringServiceCancellation(fixture, cancellation, 0);
    }

    @Test
    void springCreatedServiceStopsAfterToolExecutionCancellation() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var cancellation = new AiToolChatCancellation();
        fixture.calculator.afterExecution = cancellation::cancel;
        assertSpringServiceCancellation(fixture, cancellation, 1);
    }

    @Test
    void defaultTransportIsRegisteredWithoutSendingRequests() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.register(AiChatTransportConfiguration.class);
            context.refresh();

            assertEquals(
                    1,
                    context.getBeansOfType(
                            AiChatService.ChatTransport.class).size());

            assertNotNull(
                    context.getBean(AiChatService.ChatTransport.class));

            // 不调用 send() 或 openStream()。
        }
    }

    @Test
    void springCreatedServiceUsesSimulatedTransport() {
        var fixture = new AiChatToolIntegrationTest.Fixture();

        var catalog = new OpenRouterModelService() {
            @Override
            public ModelCapabilities loadCapabilities(String modelId) {
                return new ModelCapabilities(
                        true, false, true, 32000);
            }

            @Override
            public ModelMetadata loadMetadata(String modelId) {
                return new ModelMetadata(
                        new ModelCapabilities(
                                true, false, true, 32000),
                        true,
                        true);
            }
        };

        try (var context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().getPropertySources().addFirst(
                    new MapPropertySource(
                            "transport-test",
                            Map.of("ai.tools.chat.enabled", false)));

            context.registerBean(
                    AiProviderRepository.class,
                    () -> fixture.providers);

            context.registerBean(
                    AiModelRepository.class,
                    () -> fixture.models);

            context.registerBean(
                    AiApiKeyCrypto.class,
                    () -> fixture.crypto);

            context.registerBean(
                    OpenRouterModelService.class,
                    () -> catalog);

            // 在处理默认配置前注册，确保默认 Transport 退让。
            context.registerBean(
                    AiChatService.ChatTransport.class,
                    () -> fixture.transport);

            context.registerBean(AiToolChatAccess.class, () -> fixture.access);

            context.register(
                    AiChatTransportConfiguration.class,
                    AiChatMessageValidator.class,
                    AiModelStateService.class,
                    AiChatService.class);

            context.refresh();

            assertEquals(
                    1,
                    context.getBeansOfType(
                            AiChatService.ChatTransport.class).size());

            assertSame(
                    fixture.transport,
                    context.getBean(AiChatService.ChatTransport.class));
            assertFalse(context.containsBean("aiChatTransport"));

            var service = context.getBean(AiChatService.class);

            // 必须使用 Spring 创建的 Service。
            assertNotSame(fixture.service, service);

            var json = new ObjectMapper();

            var request = new AiChatMessagesRequest(
                    "company-test",
                    "provider-test",
                    "test/model",
                    null,
                    List.of(new AiChatMessagesRequest.Message(
                            "user",
                            json.readTree("\"Calculate 2 + 3.\""))));

            var reply = service.chatMessagesWithTools(
                    request,
                    fixture.registry,
                    Set.of("calc_run"));

            assertEquals("The answer is 5.", reply.reply());
            assertEquals(2, fixture.transport.requests.size());
            assertEquals(1, fixture.calculator.executions);
        }
    }

    @Test
    void springAssemblesAuthorizedToolChatWithSimulatedTransport()
            throws Exception {

        for (boolean supported : List.of(true, false)) {
            var fixture = new AiChatToolIntegrationTest.Fixture();

            var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

            var catalog = new OpenRouterModelService() {
                @Override
                public ModelCapabilities loadCapabilities(String modelId) {
                    return new ModelCapabilities(
                            true, false, true, 32000);
                }

                @Override
                public ModelMetadata loadMetadata(String modelId) {
                    return new ModelMetadata(
                            new ModelCapabilities(
                                    true, false, true, 32000),
                            supported,
                            supported);
                }
            };

            try (var context = new AnnotationConfigApplicationContext()) {
                context.getEnvironment().getPropertySources().addFirst(
                        new MapPropertySource(
                                "authorized-transport-test",
                                Map.of(
                                        "ai.tools.chat.enabled", true,
                                        "ai.tools.management.enabled", true,
                                        "ai.agents.merchant-id", "merchant-test",
                                        "server.address", "127.0.0.1")));

                context.registerBean(
                        "toolChatCalculator",
                        AiToolHandler.class,
                        () -> fixture.calculator);

                context.registerBean(
                        AiProviderRepository.class,
                        () -> fixture.providers);

                context.registerBean(
                        AiModelRepository.class,
                        () -> fixture.models);

                context.registerBean(
                        AiToolRepository.class,
                        () -> repository);

                context.registerBean(
                        AiApiKeyCrypto.class,
                        () -> fixture.crypto);

                context.registerBean(
                        OpenRouterModelService.class,
                        () -> catalog);

                context.registerBean(
                        AiChatService.ChatTransport.class,
                        () -> fixture.transport);

                context.registerBean(AiToolChatAccess.class, () -> fixture.access);

                context.register(
                        AiChatTransportConfiguration.class,
                        AiToolChatConfiguration.class,
                        AiChatMessageValidator.class,
                        AiModelStateService.class,
                        AiChatService.class,
                        AiChatController.class);

                context.refresh();

                assertSame(
                        fixture.calculator,
                        context.getBean("toolChatCalculator", AiToolHandler.class));

                assertNotSame(
                        fixture.service,
                        context.getBean(AiChatService.class));

                assertSame(
                        fixture.transport,
                        context.getBean(AiChatService.ChatTransport.class));
                assertEquals(1, context.getBeansOfType(
                        AiChatService.ChatTransport.class).size());
                assertFalse(context.containsBean("aiChatTransport"));

                assertEquals(
                        1,
                        context.getBeansOfType(
                                AiAgentModelBindingValidator.class).size());

                assertEquals(
                        1,
                        context.getBeansOfType(
                                AiAgentExecutionParameterValidator.class).size());

                var mvc = MockMvcBuilders.standaloneSetup(
                        context.getBean(AiChatController.class))
                        .build();

                var result = mvc.perform(
                        post("/api/ai/chat/messages/tools")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {
                                          "companyId": "company-test",
                                          "agentId": "agent-test",
                                          "providerId": "provider-test",
                                          "modelId": "test/model",
                                          "temperature": 1.9,
                                          "messages": [{
                                            "role": "user",
                                            "content": "Calculate 2 + 3."
                                          }]
                                        }
                                        """))
                        .andReturn();

                assertEquals(200, result.getResponse().getStatus());
                assertEquals(2, fixture.transport.requests.size());
                assertEquals(1, fixture.calculator.executions);

                var json = new ObjectMapper();
                var reply = json.readTree(
                        result.getResponse().getContentAsByteArray());

                assertEquals(
                        "The answer is 5.",
                        reply.path("reply").asString());

                for (var request : fixture.transport.requests) {
                    var body = json.readTree(
                            AiChatToolIntegrationTest.readRequestBody(request));

                    assertEquals(512, body.path("max_tokens").asInt());
                    assertEquals(supported, body.has("temperature"));
                    assertEquals(supported, body.has("top_p"));

                    if (supported) {
                        assertEquals(
                                0.4,
                                body.path("temperature").asDouble());

                        assertEquals(
                                0.75,
                                body.path("top_p").asDouble());
                    }
                }

                var second = json.readTree(
                        AiChatToolIntegrationTest.readRequestBody(
                                fixture.transport.requests.get(1)));

                var messages = second.path("messages");
                var toolMessage = messages.get(messages.size() - 1);

                assertEquals(
                        "tool",
                        toolMessage.path("role").asString());

                assertEquals(
                        "call_add",
                        toolMessage.path("tool_call_id").asString());

                var toolResult = json.readTree(
                        toolMessage.path("content").asString());

                assertTrue(toolResult.path("ok").asBoolean());
                assertEquals(
                        5.0,
                        toolResult.path("output").path("result").asDouble());
            }
        }
    }

    @Test
    void springAssemblyRejectsDisabledToolBeforeModel()
            throws Exception {

        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        repository.active = false;

        try (var context = authorizedContext(fixture, repository)) {
            assertRejectedBeforeModel(context, fixture, 403);
        }
    }

    @Test
    void springAssemblyRejectsUnboundToolBeforeModel()
            throws Exception {

        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        repository.assigned = false;

        try (var context = authorizedContext(fixture, repository)) {
            assertRejectedBeforeModel(context, fixture, 403);
        }
    }

    @Test
    void springAssemblyRejectsDisabledModelBeforeModelRequest()
            throws Exception {

        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        fixture.models.enabled = false;

        try (var context = authorizedContext(fixture, repository)) {
            assertRejectedBeforeModel(context, fixture, 409);
        }
    }

    @Test
    void springAssemblyStopsWhenToolIsDisabledAfterFirstResponse()
            throws Exception {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();
        fixture.transport.afterFirstResponse = () -> repository.active = false;

        try (var context = authorizedContext(fixture, repository)) {
            assertRejectedAfterRequests(context, fixture, 403, 1);
            assertFalse(repository.active);
        }
    }

    @Test
    void springAssemblyStopsWhenBindingIsRevokedAfterFirstResponse()
            throws Exception {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();
        fixture.transport.afterFirstResponse = () -> repository.assigned = false;

        try (var context = authorizedContext(fixture, repository)) {
            assertRejectedAfterRequests(context, fixture, 403, 1);
            assertFalse(repository.assigned);
        }
    }

    @Test
    void springAssemblyStopsSecondRequestWhenBindingIsRevokedAfterExecution()
            throws Exception {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();
        fixture.calculator.afterExecution = () -> repository.assigned = false;

        try (var context = authorizedContext(fixture, repository)) {
            assertRejectedAfterExecution(context, fixture, 403, 1, 1);
            assertFalse(repository.assigned);
        }
    }

    @Test
    void springAssemblyStopsSecondRequestWhenToolIsDisabledAfterExecution()
            throws Exception {

        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        fixture.calculator.afterExecution = () -> repository.active = false;

        try (var context = authorizedContext(fixture, repository)) {
            assertRejectedAfterExecution(
                    context,
                    fixture,
                    403,
                    1,
                    1);

            assertFalse(repository.active);

            // 工具停用，但 Agent 工具绑定仍然保留。
            assertTrue(repository.assigned);
        }
    }

    @Test
    void springAssemblesLifecycleAndCleansSuccessfulRequest() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        try (var context = authorizedContext(fixture, repository)) {
            assertEquals(
                    1,
                    context.getBeansOfType(AiToolChatRequests.class).size());

            assertEquals(
                    1,
                    context.getBeansOfType(AiToolChatLifecycle.class).size());

            var requests = context.getBean(AiToolChatRequests.class);
            var lifecycle = context.getBean(AiToolChatLifecycle.class);

            fixture.transport.afterFirstResponse = () -> assertEquals(1, requests.activeCount());

            var request = new AiChatMessagesRequest(
                    "company-test",
                    "provider-test",
                    "test/model",
                    null,
                    List.of(new AiChatMessagesRequest.Message(
                            "user",
                            new ObjectMapper().readTree(
                                    "\"Calculate 2 + 3.\""))));

            var reply = lifecycle.chat(
                    request,
                    "agent-test",
                    "request-spring-1");

            assertEquals("The answer is 5.", reply.reply());
            assertEquals(2, fixture.transport.requests.size());
            assertEquals(1, fixture.calculator.executions);

            assertEquals(0, requests.activeCount());

            assertFalse(requests.cancel(
                    "company-test",
                    "agent-test",
                    "request-spring-1"));
        }
    }

    private AiChatMessagesRequest lifecycleRequest() {
        return new AiChatMessagesRequest(
                "company-test",
                "provider-test",
                "test/model",
                null,
                List.of(new AiChatMessagesRequest.Message(
                        "user",
                        new ObjectMapper().readTree(
                                "\"Calculate 2 + 3.\""))));
    }

    @Test
    void springLifecycleCleansRequestAfterToolFailure() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        fixture.calculator.fail = true;

        try (var context = authorizedContext(fixture, repository)) {
            var requests = context.getBean(AiToolChatRequests.class);
            var lifecycle = context.getBean(AiToolChatLifecycle.class);

            fixture.transport.afterFirstResponse = () -> assertEquals(1, requests.activeCount());

            var error = assertThrows(
                    ResponseStatusException.class,
                    () -> lifecycle.chat(
                            lifecycleRequest(),
                            "agent-test",
                            "request-failure-1"));

            assertEquals(502, error.getStatusCode().value());

            assertEquals(1, fixture.transport.requests.size());
            assertEquals(1, fixture.calculator.executions);

            assertEquals(0, requests.activeCount());

            assertFalse(requests.cancel(
                    "company-test",
                    "agent-test",
                    "request-failure-1"));

            // 失败清理后，同一个ID可以重新注册。
            var replacement = requests.register(
                    "company-test",
                    "agent-test",
                    "request-failure-1");

            try {
                assertFalse(replacement.cancellation().isCancelled());
            } finally {
                requests.complete(replacement);
            }

            assertEquals(0, requests.activeCount());
        }
    }

    @Test
    void springLifecycleCleansCancelledRequest() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        try (var context = authorizedContext(fixture, repository)) {
            var requests = context.getBean(AiToolChatRequests.class);
            var lifecycle = context.getBean(AiToolChatLifecycle.class);

            fixture.calculator.afterExecution = () -> {
                assertEquals(1, requests.activeCount());

                assertFalse(requests.cancel(
                        "other-company",
                        "agent-test",
                        "request-cancel-1"));

                assertFalse(requests.cancel(
                        "company-test",
                        "other-agent",
                        "request-cancel-1"));

                assertTrue(requests.cancel(
                        "company-test",
                        "agent-test",
                        "request-cancel-1"));
            };

            var error = assertThrows(
                    ResponseStatusException.class,
                    () -> lifecycle.chat(
                            lifecycleRequest(),
                            "agent-test",
                            "request-cancel-1"));

            assertEquals(499, error.getStatusCode().value());

            assertEquals(
                    "Tool chat request cancelled.",
                    error.getReason());

            assertEquals(1, fixture.transport.requests.size());
            assertEquals(1, fixture.calculator.executions);

            assertEquals(0, requests.activeCount());

            assertFalse(requests.cancel(
                    "company-test",
                    "agent-test",
                    "request-cancel-1"));

            var replacement = requests.register(
                    "company-test",
                    "agent-test",
                    "request-cancel-1");

            try {
                assertFalse(replacement.cancellation().isCancelled());
            } finally {
                requests.complete(replacement);
            }

            assertEquals(0, requests.activeCount());
        }
    }

    @Test
    void springControllerCancellationStopsToolAndCleansRequest()
            throws Exception {

        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        try (var context = authorizedContext(fixture, repository)) {
            var requests = context.getBean(AiToolChatRequests.class);

            var mvc = MockMvcBuilders.standaloneSetup(
                    context.getBean(AiChatController.class))
                    .build();

            String requestId = "spring-owner-cancel-1";

            fixture.transport.afterFirstResponse = () -> {
                assertEquals(1, requests.activeCount());

                try {
                    var cancelled = mvc.perform(
                            post("/api/ai/chat/messages/tools/cancel")
                                    .header(
                                            "X-AI-Tool-Request-Id",
                                            requestId)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("""
                                            {
                                              "companyId": "company-test",
                                              "agentId": "agent-test"
                                            }
                                            """))
                            .andReturn();

                    assertEquals(
                            202,
                            cancelled.getResponse().getStatus());
                } catch (Exception error) {
                    throw new AssertionError(
                            "Cancellation request failed.", error);
                }
            };

            var chat = mvc.perform(
                    post("/api/ai/chat/messages/tools")
                            .header("X-AI-Tool-Request-Id", requestId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {
                                      "companyId": "company-test",
                                      "agentId": "agent-test",
                                      "providerId": "provider-test",
                                      "modelId": "test/model",
                                      "messages": [{
                                        "role": "user",
                                        "content": "Calculate 2 + 3."
                                      }]
                                    }
                                    """))
                    .andReturn();

            assertEquals(499, chat.getResponse().getStatus());
            assertEquals(1, fixture.transport.requests.size());
            assertEquals(0, fixture.calculator.executions);
            assertEquals(0, requests.activeCount());

            var finished = mvc.perform(
                    post("/api/ai/chat/messages/tools/cancel")
                            .header("X-AI-Tool-Request-Id", requestId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {
                                      "companyId": "company-test",
                                      "agentId": "agent-test"
                                    }
                                    """))
                    .andReturn();

            assertEquals(404, finished.getResponse().getStatus());
        }
    }
}
