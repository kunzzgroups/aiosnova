package com.aiosnova.ai.chat;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import com.aiosnova.ai.tool.AiToolAuthorizationService;
import com.aiosnova.ai.tool.AiToolDatabaseSource;
import com.aiosnova.ai.tool.AiToolRegistry;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class AiChatToolDatabaseControllerTest {

    private static final String URL = "/api/ai/chat/messages/tools";

    private final JsonMapper json = JsonMapper.builder().build();

    private MockMvc mvc(
            AiChatToolIntegrationTest.Fixture fixture,
            AiChatToolDatabaseAuthorizationTest.FakeRepository repository) {

        var source = new AiToolDatabaseSource(
                repository,
                "merchant-test");

        var authorization = new AiToolAuthorizationService(
                source,
                List.of(new AiToolRegistry.Registration(
                        "calculator",
                        fixture.calculator)));

        return MockMvcBuilders.standaloneSetup(
                new AiChatController(fixture.service, authorization, new AiToolChatLifecycle(fixture.service, authorization, new AiToolChatRequests()), fixture.access))
                .build();
    }

    private MvcResult send(
            MockMvc mvc,
            String companyId,
            String agentId) throws Exception {

        var body = json.writeValueAsString(Map.of(
                "companyId", companyId,
                "agentId", agentId,
                "providerId", "provider-test",
                "modelId", "test/model",
                "messages", List.of(Map.of(
                        "role", "user",
                        "content", "Calculate 2 + 3."))));

        return mvc.perform(post(URL)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
                .andReturn();
    }

    private String responseBody(MvcResult result) {
        return new String(
                result.getResponse().getContentAsByteArray(),
                StandardCharsets.UTF_8);
    }

    @Test
    void authorizedRequestReturnsFinalAnswer() throws Exception {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        var result = send(
                mvc(fixture, repository),
                "company-test",
                "agent-test");

        assertEquals(200, result.getResponse().getStatus());

        var body = json.readTree(responseBody(result));
        assertEquals("The answer is 5.", body.path("reply").asString());
        assertEquals("test/model", body.path("modelId").asString());

        assertEquals(2, fixture.transport.requests.size());
        assertEquals(1, fixture.calculator.executions);
    }

    @Test
    void disabledToolReturnsForbidden() throws Exception {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        repository.active = false;

        var result = send(
                mvc(fixture, repository),
                "company-test",
                "agent-test");

        assertEquals(403, result.getResponse().getStatus());
        assertFalse(
                json.readTree(responseBody(result))
                        .path("message").asString().isBlank());

        assertEquals(0, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
    }

    @Test
    void revokedBindingAfterFirstResponseStopsExecution()
            throws Exception {

        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        fixture.transport.afterFirstResponse = () -> repository.assigned = false;

        var result = send(
                mvc(fixture, repository),
                "company-test",
                "agent-test");

        assertEquals(403, result.getResponse().getStatus());
        assertEquals(1, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
    }

    @Test
    void revokedBindingAfterExecutionStopsSecondRequest()
            throws Exception {

        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        fixture.calculator.afterExecution = () -> repository.assigned = false;

        var result = send(
                mvc(fixture, repository),
                "company-test",
                "agent-test");

        assertEquals(403, result.getResponse().getStatus());
        assertEquals(1, fixture.transport.requests.size());
        assertEquals(1, fixture.calculator.executions);
    }

    @Test
    void unknownAgentIsRejectedBeforeModelRequest()
            throws Exception {

        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        var result = send(
                mvc(fixture, repository),
                "company-test",
                "other-agent");

        assertEquals(403, result.getResponse().getStatus());
        assertEquals(0, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
    }

    @Test
    void otherCompanyCannotUseAgent() throws Exception {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        var result = send(
                mvc(fixture, repository),
                "other-company",
                "agent-test");

        assertEquals(403, result.getResponse().getStatus());
        assertEquals(0, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
    }

    @Test
    void toolFailureWithDatabaseAuthorizationStopsWithoutRetry()
            throws Exception {

        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        fixture.calculator.fail = true;

        var result = send(
                mvc(fixture, repository),
                "company-test",
                "agent-test");

        assertEquals(502, result.getResponse().getStatus());

        var body = json.readTree(responseBody(result));
        String message = body.path("message").asString("");

        assertFalse(message.isBlank());
        assertFalse(message.contains("SECRET_INTERNAL_DETAILS"));

        // One attempted execution; no second model request or retry.
        assertEquals(1, fixture.calculator.executions);
        assertEquals(1, fixture.transport.requests.size());
    }
}