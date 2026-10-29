package com.aiosnova.ai.chat;

import java.util.Map;
import com.aiosnova.ai.model.AiModelRepository;
import com.aiosnova.ai.model.AiModelStateService;
import com.aiosnova.ai.model.ModelCapabilities;
import com.aiosnova.ai.model.OpenRouterModelService;
import com.aiosnova.ai.provider.AiApiKeyCrypto;
import com.aiosnova.ai.provider.AiProviderRepository;
import com.aiosnova.ai.tool.AiToolRepository;
import com.aiosnova.ai.tool.AiToolHandler;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

final class AiToolSpringTestSupport {

    private AiToolSpringTestSupport() {}

    static AnnotationConfigApplicationContext authorizedContext(
            AiChatToolIntegrationTest.Fixture fixture,
            AiChatToolDatabaseAuthorizationTest.FakeRepository repository) {

        return authorizedContext(fixture, repository, fixture.transport);
    }

    static AnnotationConfigApplicationContext authorizedContext(
            AiChatToolIntegrationTest.Fixture fixture,
            AiChatToolDatabaseAuthorizationTest.FakeRepository repository,
            AiChatService.ChatTransport transport) {

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

        var context = new AnnotationConfigApplicationContext();

        try {
            context.getEnvironment().getPropertySources().addFirst(
                    new MapPropertySource(
                            "authorized-rejection-test",
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
                    () -> transport);

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
                    transport,
                    context.getBean(AiChatService.ChatTransport.class));

            assertEquals(
                    1,
                    context.getBeansOfType(
                            AiChatService.ChatTransport.class).size());

            assertFalse(context.containsBean("aiChatTransport"));

            return context;
        } catch (RuntimeException | Error error) {
            context.close();
            throw error;
        }
    }

    static void assertRejectedBeforeModel(
            AnnotationConfigApplicationContext context,
            AiChatToolIntegrationTest.Fixture fixture,
            int expectedStatus) throws Exception {

        assertRejectedAfterRequests(context, fixture, expectedStatus, 0);
    }

    static void assertRejectedAfterRequests(
            AnnotationConfigApplicationContext context,
            AiChatToolIntegrationTest.Fixture fixture,
            int expectedStatus,
            int expectedModelRequests) throws Exception {

        assertRejectedAfterExecution(context, fixture, expectedStatus,
                expectedModelRequests, 0);
    }

    static void assertRejectedAfterExecution(
            AnnotationConfigApplicationContext context,
            AiChatToolIntegrationTest.Fixture fixture,
            int expectedStatus,
            int expectedModelRequests,
            int expectedToolExecutions) throws Exception {

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
                                  "messages": [{
                                    "role": "user",
                                    "content": "Calculate 2 + 3."
                                  }]
                                }
                                """))
                .andReturn();

        assertEquals(
                expectedStatus,
                result.getResponse().getStatus());

        assertEquals(expectedModelRequests, fixture.transport.requests.size());

        assertEquals(
                expectedToolExecutions,
                fixture.calculator.executions,
                "Unexpected Calculator execution count.");

        var body = new ObjectMapper().readTree(
                result.getResponse().getContentAsByteArray());

        assertFalse(body.path("message").asString("").isBlank());
        assertFalse(body.has("reply"));
    }

}
