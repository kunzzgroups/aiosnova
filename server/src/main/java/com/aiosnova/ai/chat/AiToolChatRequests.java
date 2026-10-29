package com.aiosnova.ai.chat;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class AiToolChatRequests {

    record Key(
            AiToolChatOwner owner,
            String companyId,
            String agentId,
            String requestId) {
    }

    record Registration(
            Key key,
            AiToolChatCancellation cancellation) {
    }

    private final Map<Key, AiToolChatCancellation> active = new HashMap<>();

    synchronized Registration register(
            String companyId,
            String agentId,
            String requestId) {

        var key = key(companyId, agentId, requestId);

        if (active.containsKey(key)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Tool chat request ID is already active.");
        }

        var cancellation = new AiToolChatCancellation();
        active.put(key, cancellation);

        return new Registration(key, cancellation);
    }

    synchronized boolean cancel(
            String companyId,
            String agentId,
            String requestId) {

        var cancellation = active.get(
                key(companyId, agentId, requestId));

        if (cancellation == null) {
            return false;
        }

        cancellation.cancel();
        return true;
    }

    synchronized void complete(Registration registration) {
        Objects.requireNonNull(
                registration, "Registration is required.");

        // 同时匹配Key和取消对象，防止旧请求误删新请求。
        active.remove(
                registration.key(),
                registration.cancellation());
    }

    synchronized int activeCount() {
        return active.size();
    }

    private Key key(
            String companyId,
            String agentId,
            String requestId) {

        requireId(companyId, 64);
        requireId(agentId, 128);
        requireId(requestId, 64);

        return new Key(null, companyId, agentId, requestId);
    }

    private void requireId(String value, int limit) {
        if (value == null
                || !value.matches(
                        "[A-Za-z0-9_-]{1," + limit + "}")) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid tool chat request scope or ID.");
        }
    }

    synchronized Registration register(
            AiToolChatOwner owner,
            String companyId,
            String agentId,
            String requestId) {

        var key = key(owner, companyId, agentId, requestId);

        if (active.containsKey(key)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Tool chat request ID is already active.");
        }

        var cancellation = new AiToolChatCancellation();
        active.put(key, cancellation);

        return new Registration(key, cancellation);
    }

    synchronized boolean cancel(
            AiToolChatOwner owner,
            String companyId,
            String agentId,
            String requestId) {

        var cancellation = active.get(
                key(owner, companyId, agentId, requestId));

        if (cancellation == null) {
            return false;
        }

        cancellation.cancel();
        return true;
    }

    private Key key(
            AiToolChatOwner owner,
            String companyId,
            String agentId,
            String requestId) {

        Objects.requireNonNull(
                owner, "Authenticated request owner is required.");

        requireId(companyId, 64);
        requireId(agentId, 128);
        requireId(requestId, 64);

        return new Key(owner, companyId, agentId, requestId);
    }
}