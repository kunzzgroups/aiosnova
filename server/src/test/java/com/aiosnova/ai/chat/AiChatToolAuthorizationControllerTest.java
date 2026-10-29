package com.aiosnova.ai.chat;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class AiChatToolAuthorizationControllerTest {

    private static final String URL =
            "/api/ai/chat/messages/tools";

    private final JsonMapper json = JsonMapper.builder().build();

    private final AiChatToolIntegrationTest.Fixture fixture =
            new AiChatToolIntegrationTest.Fixture();

    private final AiToolAuthorizationFixture policy =
            new AiToolAuthorizationFixture(fixture);

    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(
            new AiChatController(fixture.service, policy.authorization, new AiToolChatLifecycle(fixture.service, policy.authorization, new AiToolChatRequests()), fixture.access))
            .build();

    private String requestBody(String agentId) {
        var body = new HashMap<String, Object>();

        body.put("companyId", "company-test");
        body.put("providerId", "provider-test");
        body.put("modelId", "test/model");
        body.put("messages", List.of(
                Map.of(
                        "role", "user",
                        "content", "Calculate 2 + 3.")));

        if (agentId != null) {
            body.put("agentId", agentId);
        }

        return json.writeValueAsString(body);
    }

    private void expectStopped(
            String agentId,
            int status,
            int modelRequests,
            int executions) throws Exception {

        var result = mvc.perform(
                post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody(agentId)))
                .andReturn();

        assertEquals(status, result.getResponse().getStatus());
        assertEquals(modelRequests, fixture.transport.requests.size());
        assertEquals(executions, fixture.calculator.executions);
    }

    @Test
    void missingAgentIdIsRejected() throws Exception {
        expectStopped(null, 400, 0, 0);
    }

    @Test
    void unknownAgentIsRejected() throws Exception {
        expectStopped("other-agent", 403, 0, 0);
    }

    @Test
    void initiallyDisabledToolStopsBeforeFirstRequest()
            throws Exception {

        policy.toolEnabled = false;

        expectStopped("agent-test", 403, 0, 0);
    }

    @Test
    void initiallyUnassignedToolStopsBeforeFirstRequest()
            throws Exception {

        policy.assigned = false;

        expectStopped("agent-test", 403, 0, 0);
    }

    @Test
    void disablingToolAfterFirstResponsePreventsExecution()
            throws Exception {

        fixture.transport.afterFirstResponse =
                () -> policy.toolEnabled = false;

        expectStopped("agent-test", 403, 1, 0);
    }

    @Test
    void revokingAssignmentAfterFirstResponsePreventsExecution()
            throws Exception {

        fixture.transport.afterFirstResponse =
                () -> policy.assigned = false;

        expectStopped("agent-test", 403, 1, 0);
    }

    @Test
    void disablingToolAfterExecutionPreventsSecondRequest()
            throws Exception {

        fixture.calculator.afterExecution =
                () -> policy.toolEnabled = false;

        expectStopped("agent-test", 403, 1, 1);
    }

    @Test
    void revokingAssignmentAfterExecutionPreventsSecondRequest()
            throws Exception {

        fixture.calculator.afterExecution =
                () -> policy.assigned = false;

        expectStopped("agent-test", 403, 1, 1);
    }
}