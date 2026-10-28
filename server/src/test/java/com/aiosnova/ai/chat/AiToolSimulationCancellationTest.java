package com.aiosnova.ai.chat;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class AiToolSimulationCancellationTest {

    @Test
    void newRequestIsNotCancelled() {
        var cancellation = new AiToolSimulationCancellation();

        assertFalse(cancellation.isCancelled());
        assertDoesNotThrow(cancellation::check);
        assertDoesNotThrow(() -> cancellation.pause(0));
    }

    @Test
    void cancelledRequestRejectsFurtherWork() {
        var cancellation = new AiToolSimulationCancellation();

        cancellation.cancel();

        var error = assertThrows(
                ResponseStatusException.class,
                cancellation::check);

        assertTrue(cancellation.isCancelled());
        assertEquals(499, error.getStatusCode().value());
        assertEquals(
                "Simulation request cancelled.",
                error.getReason());
    }

    @Test
    void cancellationIsIdempotentAndStopsDelay() {
        var cancellation = new AiToolSimulationCancellation();

        cancellation.cancel();
        cancellation.cancel();

        var error = assertThrows(
                ResponseStatusException.class,
                () -> cancellation.pause(30_000));

        assertEquals(499, error.getStatusCode().value());
    }

    @Test
    void cancellationDoesNotAffectAnotherRequest() {
        var first = new AiToolSimulationCancellation();
        var second = new AiToolSimulationCancellation();

        first.cancel();

        assertThrows(
                ResponseStatusException.class,
                first::check);

        assertDoesNotThrow(second::check);
        assertFalse(second.isCancelled());
    }
}
