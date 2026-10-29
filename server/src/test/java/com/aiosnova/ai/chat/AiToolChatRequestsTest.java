package com.aiosnova.ai.chat;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class AiToolChatRequestsTest {

    @Test
    void registeredRequestCanBeCancelled() {
        var requests = new AiToolChatRequests();

        var registration = requests.register(
                "company-a", "agent-a", "request-1");

        assertEquals(1, requests.activeCount());
        assertFalse(registration.cancellation().isCancelled());

        assertTrue(requests.cancel(
                "company-a", "agent-a", "request-1"));

        assertTrue(registration.cancellation().isCancelled());

        // 重复取消保持成功，等待执行中的请求完成清理。
        assertTrue(requests.cancel(
                "company-a", "agent-a", "request-1"));
    }

    @Test
    void companyAndAgentScopesAreIsolated() {
        var requests = new AiToolChatRequests();

        var first = requests.register(
                "company-a", "agent-a", "request-1");

        var otherCompany = requests.register(
                "company-b", "agent-a", "request-1");

        var otherAgent = requests.register(
                "company-a", "agent-b", "request-1");

        assertTrue(requests.cancel(
                "company-a", "agent-a", "request-1"));

        assertTrue(first.cancellation().isCancelled());
        assertFalse(otherCompany.cancellation().isCancelled());
        assertFalse(otherAgent.cancellation().isCancelled());

        assertFalse(requests.cancel(
                "company-c", "agent-a", "request-1"));
    }

    @Test
    void duplicateActiveIdIsRejectedWithoutReplacingOriginal() {
        var requests = new AiToolChatRequests();

        var original = requests.register(
                "company-a", "agent-a", "request-1");

        var error = assertThrows(
                ResponseStatusException.class,
                () -> requests.register(
                        "company-a", "agent-a", "request-1"));

        assertEquals(409, error.getStatusCode().value());
        assertEquals(1, requests.activeCount());

        requests.cancel("company-a", "agent-a", "request-1");
        assertTrue(original.cancellation().isCancelled());
    }

    @Test
    void completionCleansRequestAndOldCleanupCannotRemoveReplacement() {
        var requests = new AiToolChatRequests();

        var original = requests.register(
                "company-a", "agent-a", "request-1");

        requests.complete(original);

        assertEquals(0, requests.activeCount());
        assertFalse(requests.cancel(
                "company-a", "agent-a", "request-1"));

        var replacement = requests.register(
                "company-a", "agent-a", "request-1");

        // 旧请求晚到的finally不能删除新请求。
        requests.complete(original);

        assertEquals(1, requests.activeCount());
        assertTrue(requests.cancel(
                "company-a", "agent-a", "request-1"));

        assertTrue(replacement.cancellation().isCancelled());
        assertFalse(original.cancellation().isCancelled());

        requests.complete(replacement);
        requests.complete(replacement);

        assertEquals(0, requests.activeCount());
    }

    @Test
    void differentRequestIdsHaveIndependentCancellation() {
        var requests = new AiToolChatRequests();

        var first = requests.register(
                "company-a", "agent-a", "request-1");

        var second = requests.register(
                "company-a", "agent-a", "request-2");

        requests.cancel("company-a", "agent-a", "request-1");

        assertTrue(first.cancellation().isCancelled());
        assertFalse(second.cancellation().isCancelled());

        assertFalse(requests.cancel(
                "company-a", "agent-a", "missing"));
    }

    @Test
    void invalidScopeOrRequestIdIsRejectedWithoutRegistration() {
        var requests = new AiToolChatRequests();

        assertThrows(
                ResponseStatusException.class,
                () -> requests.register(
                        "bad/company", "agent-a", "request-1"));

        assertThrows(
                ResponseStatusException.class,
                () -> requests.register(
                        "company-a", "", "request-1"));

        var error = assertThrows(
                ResponseStatusException.class,
                () -> requests.register(
                        "company-a", "agent-a", null));

        assertEquals(400, error.getStatusCode().value());
        assertEquals(0, requests.activeCount());
    }

    @Test
    void differentUsersCannotCancelEachOthersRequests() {
        var requests = new AiToolChatRequests();

        var ownerA = new AiToolChatOwner("merchant-a", "user-a");
        var ownerB = new AiToolChatOwner("merchant-a", "user-b");

        var first = requests.register(
                ownerA, "company-a", "agent-a", "request-1");

        assertFalse(requests.cancel(
                ownerB, "company-a", "agent-a", "request-1"));

        assertFalse(first.cancellation().isCancelled());

        var second = requests.register(
                ownerB, "company-a", "agent-a", "request-1");

        assertTrue(requests.cancel(
                ownerA, "company-a", "agent-a", "request-1"));

        assertTrue(first.cancellation().isCancelled());
        assertFalse(second.cancellation().isCancelled());

        // 旧入口也不能取消带Owner的请求。
        assertFalse(requests.cancel(
                "company-a", "agent-a", "request-1"));

        requests.complete(first);
        requests.complete(second);

        assertEquals(0, requests.activeCount());
    }

    @Test
    void differentMerchantsCannotCancelEachOthersRequests() {
        var requests = new AiToolChatRequests();

        var ownerA = new AiToolChatOwner("merchant-a", "user-a");
        var ownerB = new AiToolChatOwner("merchant-b", "user-a");

        var registration = requests.register(
                ownerA, "company-a", "agent-a", "request-1");

        assertFalse(requests.cancel(
                ownerB, "company-a", "agent-a", "request-1"));

        assertFalse(registration.cancellation().isCancelled());

        assertTrue(requests.cancel(
                ownerA, "company-a", "agent-a", "request-1"));

        assertTrue(registration.cancellation().isCancelled());

        requests.complete(registration);
        assertEquals(0, requests.activeCount());
    }
}
