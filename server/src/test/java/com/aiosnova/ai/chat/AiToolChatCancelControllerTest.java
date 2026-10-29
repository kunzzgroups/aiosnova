package com.aiosnova.ai.chat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class AiToolChatCancelControllerTest {

    private final AiChatToolIntegrationTest.Fixture fixture =
            new AiChatToolIntegrationTest.Fixture();

    private final AiToolAuthorizationFixture policy =
            new AiToolAuthorizationFixture(fixture);

    private final AiToolChatRequests requests =
            new AiToolChatRequests();

    private final AiToolChatOwner owner =
            new AiToolChatOwner("merchant-test", "user-test");

    private MvcResult cancel(
            AiToolChatAccess access,
            String companyId,
            String agentId,
            String requestId) throws Exception {

        var lifecycle = new AiToolChatLifecycle(
                fixture.service, policy.authorization, requests);

        var controller = new AiChatController(
                fixture.service,
                policy.authorization,
                lifecycle,
                access);

        var mvc = MockMvcBuilders.standaloneSetup(controller).build();

        var request = post("/api/ai/chat/messages/tools/cancel")
                .contentType(MediaType.APPLICATION_JSON)
                .content(new ObjectMapper().writeValueAsString(
                        Map.of(
                                "companyId", companyId,
                                "agentId", agentId)));

        if (requestId != null) {
            request.header("X-AI-Tool-Request-Id", requestId);
        }

        return mvc.perform(request).andReturn();
    }

    private void assertNoExecution() {
        assertEquals(0, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
    }

    @Test
    void ownerCanCancelAndCompletedRequestReturnsNotFound()
            throws Exception {

        var registration = requests.register(
                owner, "company-test", "agent-test", "request-1");

        try {
            var result = cancel(
                    fixture.access,
                    "company-test", "agent-test", "request-1");

            assertEquals(202, result.getResponse().getStatus());
            assertTrue(registration.cancellation().isCancelled());

            // 取消本身不删除仍在执行的记录。
            assertEquals(1, requests.activeCount());
        } finally {
            requests.complete(registration);
        }

        var finished = cancel(
                fixture.access,
                "company-test", "agent-test", "request-1");

        assertEquals(404, finished.getResponse().getStatus());
        assertEquals(0, requests.activeCount());
        assertNoExecution();
    }

    @Test
    void otherUserMerchantOrAgentCannotCancelRequest()
            throws Exception {

        var registration = requests.register(
                owner, "company-test", "agent-test", "request-1");

        try {
            for (var otherOwner : List.of(
                    new AiToolChatOwner("merchant-test", "other-user"),
                    new AiToolChatOwner("other-merchant", "user-test"))) {

                var result = cancel(
                        (request, company) -> otherOwner,
                        "company-test", "agent-test", "request-1");

                assertEquals(404, result.getResponse().getStatus());
                assertFalse(registration.cancellation().isCancelled());
            }

            var otherAgent = cancel(
                    fixture.access,
                    "company-test", "other-agent", "request-1");

            assertEquals(404, otherAgent.getResponse().getStatus());

            var otherCompany = cancel(
                    fixture.access,
                    "other-company", "agent-test", "request-1");

            assertEquals(403, otherCompany.getResponse().getStatus());

            assertFalse(registration.cancellation().isCancelled());
            assertEquals(1, requests.activeCount());
            assertNoExecution();
        } finally {
            requests.complete(registration);
        }
    }

    @Test
    void missingAuthenticationCannotCancelRequest() throws Exception {
        var registration = requests.register(
                owner, "company-test", "agent-test", "request-1");

        try {
            var missing = cancel(
                    null,
                    "company-test", "agent-test", "request-1");

            assertEquals(503, missing.getResponse().getStatus());

            var unauthenticated = cancel(
                    (request, company) -> {
                        throw new ResponseStatusException(
                                HttpStatus.UNAUTHORIZED);
                    },
                    "company-test", "agent-test", "request-1");

            assertEquals(401, unauthenticated.getResponse().getStatus());
            assertFalse(registration.cancellation().isCancelled());
            assertNoExecution();
        } finally {
            requests.complete(registration);
        }
    }

    @Test
    void missingRequestIdIsRejected() throws Exception {
        var result = cancel(
                fixture.access,
                "company-test", "agent-test", null);

        assertEquals(400, result.getResponse().getStatus());
        assertEquals(0, requests.activeCount());
        assertNoExecution();
    }
}