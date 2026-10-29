package com.aiosnova.ai.chat;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import com.aiosnova.ai.tool.AiToolAuthorizationService;
import com.aiosnova.ai.tool.AiToolDatabaseSource;
import com.aiosnova.ai.tool.AiToolRegistry;
import com.aiosnova.ai.tool.AiToolRepository;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.MapPropertySource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class AiChatToolSpringConfigurationTest {

    private final JsonMapper json = JsonMapper.builder().build();

    @Configuration(proxyBeanMethods = false)
    static class TestConfiguration {

        @Bean
        AiChatToolIntegrationTest.Fixture fixture() {
            return new AiChatToolIntegrationTest.Fixture();
        }

        @Bean
        AiChatToolDatabaseAuthorizationTest.FakeRepository repository() {
            return new AiChatToolDatabaseAuthorizationTest.FakeRepository();
        }

        @Bean
        AiToolDatabaseSource source(
                AiToolRepository repository,
                @Value("${ai.agents.merchant-id}") String merchantId) {

            return new AiToolDatabaseSource(repository, merchantId);
        }

        @Bean
        AiToolAuthorizationService authorization(
                AiToolDatabaseSource source,
                AiChatToolIntegrationTest.Fixture fixture) {

            return new AiToolAuthorizationService(
                    source,
                    List.of(new AiToolRegistry.Registration(
                            "calculator",
                            fixture.calculator)));
        }

        @Bean
        AiChatService chatService(
                AiChatToolIntegrationTest.Fixture fixture) {

            // Fixture uses simulated transport and model metadata.
            return fixture.service;
        }

        @Bean
        AiChatController controller(
                AiChatService service,
                AiToolAuthorizationService authorization,
                AiChatToolIntegrationTest.Fixture fixture) {

            return new AiChatController(service, authorization, new AiToolChatLifecycle(service, authorization, new AiToolChatRequests()), fixture.access);
        }
    }

    private AnnotationConfigApplicationContext context(String merchantId) {
        var context = new AnnotationConfigApplicationContext();

        context.getEnvironment().getPropertySources().addFirst(
                new MapPropertySource(
                        "tool-chat-test",
                        Map.of("ai.agents.merchant-id", merchantId)));

        context.register(TestConfiguration.class);
        context.refresh();

        return context;
    }

    private MockMvc mvc(AnnotationConfigApplicationContext context) {
        return MockMvcBuilders.standaloneSetup(
                context.getBean(AiChatController.class))
                .build();
    }

    private MvcResult send(MockMvc mvc) throws Exception {
        var body = json.writeValueAsString(Map.of(
                "companyId", "company-test",
                "agentId", "agent-test",
                "providerId", "provider-test",
                "modelId", "test/model",
                "messages", List.of(Map.of(
                        "role", "user",
                        "content", "Calculate 2 + 3."))));

        return mvc.perform(post("/api/ai/chat/messages/tools")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();
    }

    @Test
    void springAssemblesAuthorizationChainAndReturnsAnswer()
            throws Exception {

        try (var context = context("merchant-test")) {
            assertEquals(
                    1,
                    context.getBeansOfType(AiToolRepository.class).size());
            assertEquals(
                    1,
                    context.getBeansOfType(AiToolDatabaseSource.class).size());
            assertEquals(
                    1,
                    context.getBeansOfType(
                            AiToolAuthorizationService.class).size());

            var result = send(mvc(context));

            assertEquals(200, result.getResponse().getStatus());

            var body = json.readTree(new String(
                    result.getResponse().getContentAsByteArray(),
                    StandardCharsets.UTF_8));

            assertEquals(
                    "The answer is 5.",
                    body.path("reply").asString());

            var fixture = context.getBean(
                    AiChatToolIntegrationTest.Fixture.class);

            assertEquals(2, fixture.transport.requests.size());
            assertEquals(1, fixture.calculator.executions);
        }
    }

    @Test
    void configuredMerchantControlsAuthorization() throws Exception {
        try (var context = context("other-merchant")) {
            var result = send(mvc(context));

            assertEquals(403, result.getResponse().getStatus());

            var fixture = context.getBean(
                    AiChatToolIntegrationTest.Fixture.class);

            assertEquals(0, fixture.transport.requests.size());
            assertEquals(0, fixture.calculator.executions);
        }
    }

    @Test
    void assembledSourceRechecksBindingAfterFirstResponse()
            throws Exception {

        try (var context = context("merchant-test")) {
            var fixture = context.getBean(
                    AiChatToolIntegrationTest.Fixture.class);

            var repository = context.getBean(
                    AiChatToolDatabaseAuthorizationTest.FakeRepository.class);

            fixture.transport.afterFirstResponse =
                    () -> repository.assigned = false;

            var result = send(mvc(context));

            assertEquals(403, result.getResponse().getStatus());
            assertEquals(1, fixture.transport.requests.size());
            assertEquals(0, fixture.calculator.executions);
        }
    }
}