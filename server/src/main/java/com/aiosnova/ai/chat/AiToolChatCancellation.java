package com.aiosnova.ai.chat;

import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.http.HttpStatusCode;
import org.springframework.web.server.ResponseStatusException;

final class AiToolChatCancellation {

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
                    "Tool chat request cancelled.");
        }
    }
}
