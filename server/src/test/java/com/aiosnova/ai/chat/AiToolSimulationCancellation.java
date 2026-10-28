package com.aiosnova.ai.chat;

import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.http.HttpStatusCode;
import org.springframework.web.server.ResponseStatusException;

final class AiToolSimulationCancellation {

    private final AtomicBoolean cancelled = new AtomicBoolean();

    void cancel() {
        cancelled.set(true);
    }

    boolean isCancelled() {
        return cancelled.get();
    }

    void check() {
        if (cancelled.get()) {
            throw new ResponseStatusException(
                    HttpStatusCode.valueOf(499),
                    "Simulation request cancelled.");
        }
    }

    // Test-only delay that cooperatively observes cancellation.
    void pause(long milliseconds) {
        if (milliseconds < 0 || milliseconds > 30_000) {
            throw new IllegalArgumentException(
                    "Simulation delay must be between 0 and 30000 ms.");
        }

        check();

        long deadline = System.nanoTime()
                + milliseconds * 1_000_000L;

        while (System.nanoTime() < deadline) {
            check();

            try {
                Thread.sleep(25);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                cancel();
                check();
            }
        }

        check();
    }
}
