package com.aiosnova.ai.chat;

import java.util.HashMap;
import java.util.Map;
import java.util.Arrays;

import com.aiosnova.ai.tool.AiToolAuthorizationService;
import com.aiosnova.ai.tool.AiToolDatabaseSource;
import com.aiosnova.ai.tool.AiToolRepository;
import com.aiosnova_standalone.AiStandaloneApplication;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.context.annotation.Import;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class AiToolChatConfigurationTest {

        private static final String REQUEST = """
                        {
                          "companyId": "company-test",
                          "agentId": "agent-test",
                          "providerId": "provider-test",
                          "modelId": "test/model",
                          "messages": [
                            {"role": "user", "content": "Calculate 2 + 3."}
                          ]
                        }
                        """;

        private AnnotationConfigApplicationContext context(
                        Boolean enabled,
                        boolean includeRepository,
                        String merchant) {

                var context = new AnnotationConfigApplicationContext();
                var properties = new HashMap<String, Object>();

                if (enabled != null) {
                        properties.put("ai.tools.chat.enabled", enabled);
                }
                if (merchant != null) {
                        properties.put("ai.agents.merchant-id", merchant);
                }

                properties.put("server.address", "127.0.0.1");
                properties.put("ai.tools.management.enabled", true);

                context.getEnvironment().getPropertySources().addFirst(
                                new MapPropertySource("tool-chat-switch-test", properties));

                context.registerBean(
                                AiChatToolIntegrationTest.Fixture.class,
                                () -> new AiChatToolIntegrationTest.Fixture());

                context.registerBean(
                                AiChatService.class,
                                () -> context.getBean(
                                                AiChatToolIntegrationTest.Fixture.class).service);

                if (includeRepository) {
                        context.registerBean(
                                        AiToolRepository.class,
                                        AiChatToolDatabaseAuthorizationTest.FakeRepository::new);
                }

                context.registerBean(AiToolChatAccess.class,
                () -> context.getBean(AiChatToolIntegrationTest.Fixture.class).access);

                context.register(
                AiToolChatConfiguration.class,
                                AiChatController.class);

                return context;
        }

        private int send(
                        AnnotationConfigApplicationContext context) throws Exception {

                var mvc = MockMvcBuilders.standaloneSetup(
                                context.getBean(AiChatController.class)).build();

                return mvc.perform(post("/api/ai/chat/messages/tools")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(REQUEST))
                                .andReturn()
                                .getResponse()
                                .getStatus();
        }

        @Test
        void defaultOffKeepsEndpointDisabled() throws Exception {
                try (var context = context(null, false, null)) {
                        context.refresh();

                        assertTrue(context.getBeansOfType(
                                        AiToolChatRequests.class).isEmpty());

                        assertTrue(context.getBeansOfType(
                                        AiToolChatLifecycle.class).isEmpty());

                        assertTrue(context.getBeansOfType(
                                        AiAgentExecutionParameterValidator.class).isEmpty());

                        assertTrue(context.getBeansOfType(
                                        AiToolDatabaseSource.class).isEmpty());
                        assertTrue(context.getBeansOfType(
                                        AiToolAuthorizationService.class).isEmpty());

                        assertEquals(503, send(context));

                        assertEquals(0, context.getBean(
                                        AiChatToolIntegrationTest.Fixture.class).transport.requests.size());
                }
        }

        @Test
        void explicitOffKeepsEndpointDisabled() throws Exception {
                try (var context = context(false, false, null)) {
                        context.refresh();
                        assertEquals(503, send(context));
                }
        }

        @Test
        void enabledConfigurationUsesSimulatedModel() throws Exception {
                try (var context = context(true, true, "merchant-test")) {
                        context.refresh();

                        assertEquals(1, context.getBeansOfType(
                                        AiAgentExecutionParameterValidator.class).size());

                        assertEquals(1, context.getBeansOfType(
                                        AiToolDatabaseSource.class).size());
                        assertEquals(1, context.getBeansOfType(
                                        AiToolAuthorizationService.class).size());

                        assertEquals(200, send(context));

                        assertEquals(2, context.getBean(
                                        AiChatToolIntegrationTest.Fixture.class).transport.requests.size());
                }
        }

        @Test
        void enabledWithoutRepositoryFailsStartup() {
                try (var context = context(true, false, "merchant-test")) {
                        var error = assertThrows(
                                        RuntimeException.class,
                                        context::refresh);

                        assertTrue(causeMessages(error)
                                        .contains("AiToolRepository"));
                }
        }

        @Test
        void enabledWithoutMerchantFailsStartup() {
                try (var context = context(true, true, null)) {
                        var error = assertThrows(
                                        RuntimeException.class,
                                        context::refresh);

                        assertTrue(causeMessages(error)
                                        .contains("valid Merchant ID"));
                }
        }

        private String causeMessages(Throwable error) {
                var messages = new StringBuilder();

                while (error != null) {
                        messages.append(error.getMessage()).append('\n');
                        error = error.getCause();
                }

                return messages.toString();
        }

        @Test
        void enabledWithNonLocalAddressFailsStartup() {
                try (var context = context(true, true, "merchant-test")) {
                        context.getEnvironment().getPropertySources().addFirst(
                                        new MapPropertySource(
                                                        "non-local-address",
                                                        Map.of("server.address", "0.0.0.0")));

                        var error = assertThrows(
                                        RuntimeException.class,
                                        context::refresh);

                        assertTrue(
                                        causeMessages(error).contains(
                                                        "Local tool chat requires loopback address"),
                                        causeMessages(error));
                }
        }

        @Test
        void enabledWithoutAuthorizationBeanFailsStartup() {
                var fixture = new AiChatToolIntegrationTest.Fixture();

                try (var context = new AnnotationConfigApplicationContext()) {
                        context.getEnvironment().getPropertySources().addFirst(
                                        new MapPropertySource(
                                                        "missing-authorization",
                                                        Map.of("ai.tools.chat.enabled", true)));

                        context.registerBean(
                                        AiChatService.class,
                                        () -> fixture.service);

                        // Deliberately exclude AiToolChatConfiguration:
                        // no authorization Bean is registered.
                        context.register(AiChatController.class);

                        var error = assertThrows(
                                        RuntimeException.class,
                                        context::refresh);

                        assertTrue(
                                        causeMessages(error).contains(
                                                        AiToolAuthorizationService.class.getName()),
                                        causeMessages(error));

                        assertEquals(0, fixture.transport.requests.size());
                        assertEquals(0, fixture.calculator.executions);
                }
        }

        @Test
        void standaloneEntryImportsToolChatConfigurationOnce() {
                var imports = AiStandaloneApplication.class
                                .getAnnotation(Import.class);

                assertNotNull(imports);

                long count = Arrays.stream(imports.value())
                                .filter(type -> type == AiToolChatConfiguration.class)
                                .count();

                assertEquals(1L, count);
        }
}
