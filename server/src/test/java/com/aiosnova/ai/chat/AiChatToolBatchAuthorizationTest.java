package com.aiosnova.ai.chat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class AiChatToolBatchAuthorizationTest {

    private final JsonMapper json = JsonMapper.builder().build();

    private final AiChatToolIntegrationTest.Fixture fixture =
            new AiChatToolIntegrationTest.Fixture();

    private final AiToolAuthorizationFixture policy =
            new AiToolAuthorizationFixture(fixture);

    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(
            new AiChatController(
                    fixture.service,
                    policy.authorization))
            .build();

    private String threeCallsResponse() {
        String arguments = json.writeValueAsString(
                Map.of(
                        "operation", "add",
                        "a", 2,
                        "b", 3));

        var calls = new ArrayList<Map<String, Object>>();

        for (String id : List.of("call_1", "call_2", "call_3")) {
            calls.add(Map.of(
                    "id", id,
                    "type", "function",
                    "function", Map.of(
                            "name", "calc_run",
                            "arguments", arguments)));
        }

        return json.writeValueAsString(
                Map.of("choices", List.of(
                        Map.of(
                                "finish_reason", "tool_calls",
                                "message", Map.of(
                                        "role", "assistant",
                                        "tool_calls", calls)))));
    }

    private String requestBody() {
        return json.writeValueAsString(
                Map.of(
                        "companyId", "company-test",
                        "agentId", "agent-test",
                        "providerId", "provider-test",
                        "modelId", "test/model",
                        "messages", List.of(
                                Map.of(
                                        "role", "user",
                                        "content", "Run three calculations."))));
    }

    private void assertStoppedAfterFirstTool(
            Runnable change,
            int expectedStatus) throws Exception {

        fixture.transport.firstResponseOverride =
                threeCallsResponse();

        // The first calculation succeeds, then state changes.
        fixture.calculator.afterExecution = change;

        var result = mvc.perform(
                post("/api/ai/chat/messages/tools")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody()))
                .andReturn();

        assertEquals(
                expectedStatus,
                result.getResponse().getStatus());

        // Initial model response only; no second request or retries.
        assertEquals(1, fixture.transport.requests.size());

        // Calls 2 and 3 must never execute.
        assertEquals(1, fixture.calculator.executions);
    }

    @Test
    void enabledBatchExecutesAllThreeCalls() throws Exception {
        fixture.transport.firstResponseOverride =
                threeCallsResponse();

        var result = mvc.perform(
                post("/api/ai/chat/messages/tools")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody()))
                .andReturn();

        assertEquals(200, result.getResponse().getStatus());
        assertEquals(3, fixture.calculator.executions);
        assertEquals(2, fixture.transport.requests.size());
    }

    @Test
    void disablingToolAfterFirstCallStopsRemainingCalls()
            throws Exception {

        assertStoppedAfterFirstTool(
                () -> policy.toolEnabled = false,
                403);
    }

    @Test
    void revokingAssignmentAfterFirstCallStopsRemainingCalls()
            throws Exception {

        assertStoppedAfterFirstTool(
                () -> policy.assigned = false,
                403);
    }

    @Test
    void disablingAgentAfterFirstCallStopsRemainingCalls()
            throws Exception {

        assertStoppedAfterFirstTool(
                () -> policy.active = false,
                403);
    }

    @Test
    void disablingModelAfterFirstCallStopsRemainingCalls()
            throws Exception {

        assertStoppedAfterFirstTool(
                () -> fixture.models.enabled = false,
                409);
    }
}