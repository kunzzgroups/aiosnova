package com.aiosnova.ai.chat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;

class AiChatServiceToolCancellationTest {

    private void assertCancelled(
            AiChatToolIntegrationTest.Fixture fixture,
            AiToolChatCancellation cancellation,
            int expectedRequests,
            int expectedExecutions) {
        var policy = new AiToolAuthorizationFixture(fixture);
        var request = new AiChatMessagesRequest(
                "company-test", "provider-test", "test/model", 1.9,
                List.of(new AiChatMessagesRequest.Message("user",
                        new ObjectMapper().readTree("\"Calculate 2 + 3.\""))));
        var error = assertThrows(ResponseStatusException.class,
                () -> fixture.service.chatMessagesWithAuthorizedTools(
                        request, "agent-test", policy.authorization, cancellation));
        assertEquals(499, error.getStatusCode().value());
        assertEquals("Tool chat request cancelled.", error.getReason());
        assertEquals(expectedRequests, fixture.transport.requests.size());
        assertEquals(expectedExecutions, fixture.calculator.executions);
    }

    @Test
    void cancelledBeforeServiceEntryDoesNotCallModel() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var cancellation = new AiToolChatCancellation();
        cancellation.cancel();
        assertCancelled(fixture, cancellation, 0, 0);
        assertEquals(0, fixture.metadataRequests);
    }

    @Test
    void servicePassesCancellationAfterFirstResponse() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var cancellation = new AiToolChatCancellation();
        fixture.transport.afterFirstResponse = cancellation::cancel;
        assertCancelled(fixture, cancellation, 1, 0);
    }

    @Test
    void servicePassesCancellationAfterToolExecution() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var cancellation = new AiToolChatCancellation();
        fixture.calculator.afterExecution = cancellation::cancel;
        assertCancelled(fixture, cancellation, 1, 1);
    }
}
