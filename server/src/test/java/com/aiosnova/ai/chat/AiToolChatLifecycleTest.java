package com.aiosnova.ai.chat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.*;

class AiToolChatLifecycleTest {

    private final AiChatToolIntegrationTest.Fixture fixture = new AiChatToolIntegrationTest.Fixture();

    private final AiToolAuthorizationFixture policy = new AiToolAuthorizationFixture(fixture);

    private final AiToolChatRequests requests = new AiToolChatRequests();

    private final AiToolChatLifecycle lifecycle = new AiToolChatLifecycle(
            fixture.service,
            policy.authorization,
            requests);

    private AiChatMessagesRequest request(String companyId) {
        return new AiChatMessagesRequest(
                companyId,
                "provider-test",
                "test/model",
                null,
                List.of(new AiChatMessagesRequest.Message(
                        "user",
                        new ObjectMapper().readTree(
                                "\"Calculate 2 + 3.\""))));
    }

    private void assertCleaned() {
        assertEquals(0, requests.activeCount());

        assertFalse(requests.cancel(
                "company-test",
                "agent-test",
                "request-1"));

        // 清理后可以重新注册同一个ID。
        var replacement = requests.register(
                "company-test",
                "agent-test",
                "request-1");

        assertFalse(replacement.cancellation().isCancelled());

        requests.complete(replacement);
        assertEquals(0, requests.activeCount());
    }

    private void assertOwnerRequestCleaned(AiToolChatOwner owner) {
        assertEquals(0, requests.activeCount());

        assertFalse(requests.cancel(
                owner,
                "company-test",
                "agent-test",
                "request-owner-1"));

        // 清理后，同一个Owner可以复用ID，得到新的取消对象。
        var replacement = requests.register(
                owner,
                "company-test",
                "agent-test",
                "request-owner-1");

        try {
            assertFalse(replacement.cancellation().isCancelled());
        } finally {
            requests.complete(replacement);
        }

        assertEquals(0, requests.activeCount());
    }

    @Test
    void successfulChatCleansRegistration() {
        fixture.transport.afterFirstResponse = () -> assertEquals(1, requests.activeCount());

        var reply = lifecycle.chat(
                request("company-test"),
                "agent-test",
                "request-1");

        assertEquals("The answer is 5.", reply.reply());
        assertEquals(2, fixture.transport.requests.size());
        assertEquals(1, fixture.calculator.executions);

        assertCleaned();
    }

    @Test
    void failedToolExecutionCleansRegistration() {
        fixture.calculator.fail = true;

        fixture.transport.afterFirstResponse = () -> assertEquals(1, requests.activeCount());

        var error = assertThrows(
                ResponseStatusException.class,
                () -> lifecycle.chat(
                        request("company-test"),
                        "agent-test",
                        "request-1"));

        assertEquals(502, error.getStatusCode().value());
        assertEquals(1, fixture.transport.requests.size());
        assertEquals(1, fixture.calculator.executions);

        assertCleaned();
    }

    @Test
    void cancelledChatCleansRegistration() {
        fixture.calculator.afterExecution = () -> {
            assertEquals(1, requests.activeCount());

            // 公司或Agent不匹配，不能取消当前请求。
            assertFalse(requests.cancel(
                    "other-company", "agent-test", "request-1"));

            assertFalse(requests.cancel(
                    "company-test", "other-agent", "request-1"));

            assertTrue(requests.cancel(
                    "company-test", "agent-test", "request-1"));
        };

        var error = assertThrows(
                ResponseStatusException.class,
                () -> lifecycle.chat(
                        request("company-test"),
                        "agent-test",
                        "request-1"));

        assertEquals(499, error.getStatusCode().value());
        assertEquals(
                "Tool chat request cancelled.",
                error.getReason());

        assertEquals(1, fixture.transport.requests.size());
        assertEquals(1, fixture.calculator.executions);

        assertCleaned();
    }

    @Test
    void unauthorizedCompanyOrAgentCannotRegisterRequest() {
        var companyError = assertThrows(
                ResponseStatusException.class,
                () -> lifecycle.chat(
                        request("other-company"),
                        "agent-test",
                        "request-1"));

        assertEquals(403, companyError.getStatusCode().value());
        assertEquals(0, requests.activeCount());

        var agentError = assertThrows(
                ResponseStatusException.class,
                () -> lifecycle.chat(
                        request("company-test"),
                        "other-agent",
                        "request-1"));

        assertEquals(403, agentError.getStatusCode().value());

        assertEquals(0, requests.activeCount());
        assertEquals(0, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
    }

    @Test
    void duplicateRequestDoesNotRemoveOrReplaceActiveRegistration() {
        var original = requests.register(
                "company-test",
                "agent-test",
                "request-1");

        try {
            var error = assertThrows(
                    ResponseStatusException.class,
                    () -> lifecycle.chat(
                            request("company-test"),
                            "agent-test",
                            "request-1"));

            assertEquals(409, error.getStatusCode().value());

            assertEquals(
                    "Tool chat request ID is already active.",
                    error.getReason());

            // 重复请求未进入模型或工具执行。
            assertEquals(0, fixture.transport.requests.size());
            assertEquals(0, fixture.calculator.executions);

            // 原注册记录仍然存在，取消对象没有被替换。
            assertEquals(1, requests.activeCount());
            assertFalse(original.cancellation().isCancelled());

            assertTrue(requests.cancel(
                    "company-test",
                    "agent-test",
                    "request-1"));

            assertTrue(original.cancellation().isCancelled());
            assertEquals(1, requests.activeCount());

        } finally {
            requests.complete(original);
        }

        assertCleaned();
    }

    @Test
    void ownerCanCancelChatAndRegistrationIsCleaned() {
        var owner = new AiToolChatOwner(
                "merchant-test",
                "user-a");

        fixture.calculator.afterExecution = () -> {
            assertEquals(1, requests.activeCount());

            assertTrue(requests.cancel(
                    owner,
                    "company-test",
                    "agent-test",
                    "request-owner-1"));
        };

        var error = assertThrows(
                ResponseStatusException.class,
                () -> lifecycle.chat(
                        owner,
                        request("company-test"),
                        "agent-test",
                        "request-owner-1"));

        assertEquals(499, error.getStatusCode().value());

        assertEquals(
                "Tool chat request cancelled.",
                error.getReason());

        assertEquals(1, fixture.transport.requests.size());
        assertEquals(1, fixture.calculator.executions);

        assertOwnerRequestCleaned(owner);
    }

    @Test
    void anotherUserCannotCancelChatAndCompletionCleansRegistration() {
        var owner = new AiToolChatOwner(
                "merchant-test",
                "user-a");

        var anotherUser = new AiToolChatOwner(
                "merchant-test",
                "user-b");

        fixture.transport.afterFirstResponse = () -> {
            assertEquals(1, requests.activeCount());

            assertFalse(requests.cancel(
                    anotherUser,
                    "company-test",
                    "agent-test",
                    "request-owner-1"));

            // 无Owner旧入口同样不能取消这个请求。
            assertFalse(requests.cancel(
                    "company-test",
                    "agent-test",
                    "request-owner-1"));

            assertEquals(1, requests.activeCount());
        };

        var reply = lifecycle.chat(
                owner,
                request("company-test"),
                "agent-test",
                "request-owner-1");

        assertEquals("The answer is 5.", reply.reply());
        assertEquals(2, fixture.transport.requests.size());
        assertEquals(1, fixture.calculator.executions);

        assertOwnerRequestCleaned(owner);
    }
}
