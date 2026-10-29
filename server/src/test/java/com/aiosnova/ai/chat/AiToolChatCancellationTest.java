package com.aiosnova.ai.chat;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class AiToolChatCancellationTest {

    @Test
    void newRequestIsNotCancelled() {
        var cancellation = new AiToolChatCancellation();

        assertFalse(cancellation.isCancelled());
        assertDoesNotThrow(cancellation::check);
    }

    @Test
    void cancellationIsIdempotentAndCheckRejects() {
        var cancellation = new AiToolChatCancellation();

        cancellation.cancel();
        cancellation.cancel();

        assertTrue(cancellation.isCancelled());

        var error = assertThrows(
                ResponseStatusException.class,
                cancellation::check);

        assertEquals(499, error.getStatusCode().value());
        assertEquals(
                "Tool chat request cancelled.",
                error.getReason());
    }

    @Test
    void cancellingOneRequestDoesNotCancelAnother() {
        var first = new AiToolChatCancellation();
        var second = new AiToolChatCancellation();

        first.cancel();

        assertTrue(first.isCancelled());
        assertFalse(second.isCancelled());

        assertThrows(
                ResponseStatusException.class,
                first::check);

        assertDoesNotThrow(second::check);
    }
}