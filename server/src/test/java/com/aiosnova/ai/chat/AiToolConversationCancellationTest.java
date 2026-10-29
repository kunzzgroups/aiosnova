package com.aiosnova.ai.chat;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class AiToolConversationCancellationTest {

    private void assertCancelled(
            AiChatToolIntegrationTest.Fixture fixture,
            AiToolChatCancellation cancellation,
            int expectedRequests,
            int expectedExecutions) {

        var conversation = new AiToolConversationService(
                fixture.transport,
                fixture.registry,
                () -> {},
                cancellation);

        List<Map<String, Object>> messages = List.of(
                Map.of(
                        "role", "user",
                        "content", "Calculate 2 + 3."));

        var error = assertThrows(
                ResponseStatusException.class,
                () -> conversation.chatWithParameters(
                        "test/model",
                        messages,
                        new AiToolRequestParameters(0.4, 0.75, 512),
                        "fake-test-key",
                        Set.of("calc_run")));

        assertEquals(499, error.getStatusCode().value());

        assertEquals(
                "Tool chat request cancelled.",
                error.getReason());

        assertEquals(
                expectedRequests,
                fixture.transport.requests.size());

        assertEquals(
                expectedExecutions,
                fixture.calculator.executions);
    }

    @Test
    void cancellationBeforeStartPreventsFirstRequest() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var cancellation = new AiToolChatCancellation();

        cancellation.cancel();

        assertCancelled(fixture, cancellation, 0, 0);
    }

    @Test
    void cancellationAfterFirstResponsePreventsToolExecution() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var cancellation = new AiToolChatCancellation();

        fixture.transport.afterFirstResponse = cancellation::cancel;

        assertCancelled(fixture, cancellation, 1, 0);
    }

    @Test
    void cancellationAfterToolExecutionPreventsSecondRequest() {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var cancellation = new AiToolChatCancellation();

        fixture.calculator.afterExecution = cancellation::cancel;

        assertCancelled(fixture, cancellation, 1, 1);
    }
}
