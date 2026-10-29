package com.aiosnova.ai.chat;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class AiToolChatControllerLifecycleTest {
    private static final AiToolChatOwner OWNER = new AiToolChatOwner("merchant-test", "user-test");
    private final AiChatToolIntegrationTest.Fixture fixture = new AiChatToolIntegrationTest.Fixture();
    private final AiToolAuthorizationFixture policy = new AiToolAuthorizationFixture(fixture);
    private final AiToolChatRequests requests = new AiToolChatRequests();

    private MvcResult send() throws Exception {
        return send(fixture.access);
    }

    private MvcResult send(AiToolChatAccess access) throws Exception {
        var lifecycle = new AiToolChatLifecycle(fixture.service, policy.authorization, requests);
        var controller = new AiChatController(fixture.service, policy.authorization, lifecycle, access);
        var mvc = MockMvcBuilders.standaloneSetup(controller).build();
        return mvc.perform(post("/api/ai/chat/messages/tools")
                .header("X-AI-Tool-Request-Id", "request-http-1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"companyId":"company-test","agentId":"agent-test",
                         "providerId":"provider-test","modelId":"test/model",
                         "messages":[{"role":"user","content":"Calculate 2 + 3."}]}
                        """))
                .andReturn();
    }

    private void observeRegistration() {
        fixture.transport.afterFirstResponse = () -> {
            assertEquals(1, requests.activeCount());
            var error = assertThrows(ResponseStatusException.class,
                    () -> requests.register(OWNER, "company-test", "agent-test", "request-http-1"));
            assertEquals(409, error.getStatusCode().value());
        };
    }

    private void assertCleaned() {
        assertEquals(0, requests.activeCount());
        assertFalse(requests.cancel(OWNER, "company-test", "agent-test", "request-http-1"));
    }

    @Test
    void missingAuthenticationCannotFallBackToUnownedLifecycle() throws Exception {
        for (AiToolChatAccess access : new AiToolChatAccess[] {null, (request, company) -> null}) {
            var result = send(access);
            assertEquals(503, result.getResponse().getStatus());
            var body = new tools.jackson.databind.ObjectMapper().readTree(
                    result.getResponse().getContentAsByteArray());
            assertEquals("Tool chat authentication is not configured.", body.path("message").asString());
            assertEquals(0, fixture.transport.requests.size());
            assertEquals(0, fixture.calculator.executions);
            assertEquals(0, fixture.metadataRequests);
            assertCleaned();
        }
    }

    @Test
    void unauthenticatedRequestStopsBeforeRegistrationAndModel() throws Exception {
        var result = send((request, company) -> {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED,
                    "Authentication is required.");
        });
        assertEquals(401, result.getResponse().getStatus());
        assertEquals(0, fixture.transport.requests.size());
        assertEquals(0, fixture.calculator.executions);
        assertEquals(0, fixture.metadataRequests);
        assertCleaned();
    }

    @Test
    void controllerUsesRequestIdAndCleansSuccessfulChat() throws Exception {
        observeRegistration();
        var result = send();
        assertEquals(200, result.getResponse().getStatus());
        assertEquals(2, fixture.transport.requests.size());
        assertEquals(1, fixture.calculator.executions);
        assertCleaned();
    }

    @Test
    void controllerCleansFailedChat() throws Exception {
        observeRegistration();
        fixture.calculator.fail = true;
        var result = send();
        assertEquals(502, result.getResponse().getStatus());
        assertEquals(1, fixture.transport.requests.size());
        assertEquals(1, fixture.calculator.executions);
        assertCleaned();
    }

    @Test
    void controllerCleansCancelledChat() throws Exception {
        observeRegistration();

        fixture.calculator.afterExecution = () -> {
            assertEquals(1, requests.activeCount());

            assertFalse(requests.cancel(OWNER, 
                    "other-company",
                    "agent-test",
                    "request-http-1"));

            assertFalse(requests.cancel(OWNER, 
                    "company-test",
                    "other-agent",
                    "request-http-1"));

            assertTrue(requests.cancel(OWNER, 
                    "company-test",
                    "agent-test",
                    "request-http-1"));
        };

        var result = send();

        assertEquals(499, result.getResponse().getStatus());
        assertEquals(1, fixture.transport.requests.size());
        assertEquals(1, fixture.calculator.executions);

        var body = new tools.jackson.databind.ObjectMapper().readTree(
                result.getResponse().getContentAsByteArray());

        assertEquals(
                "Tool chat request cancelled.",
                body.path("message").asString());

        assertFalse(body.has("reply"));

        assertCleaned();
    }

    @Test
    void controllerRejectsDuplicateIdWithoutRemovingOriginal()
            throws Exception {

        var original = requests.register(OWNER, 
                "company-test",
                "agent-test",
                "request-http-1");

        try {
            var result = send();

            assertEquals(409, result.getResponse().getStatus());

            assertEquals(0, fixture.transport.requests.size());
            assertEquals(0, fixture.calculator.executions);
            assertEquals(1, requests.activeCount());

            var body = new tools.jackson.databind.ObjectMapper().readTree(
                    result.getResponse().getContentAsByteArray());

            assertEquals(
                    "Tool chat request ID is already active.",
                    body.path("message").asString());

            assertFalse(body.has("reply"));

            // 重复请求没有替换或取消原来的对象。
            assertFalse(original.cancellation().isCancelled());

            assertTrue(requests.cancel(OWNER, 
                    "company-test",
                    "agent-test",
                    "request-http-1"));

            assertTrue(original.cancellation().isCancelled());

        } finally {
            requests.complete(original);
        }

        assertCleaned();
    }
}
