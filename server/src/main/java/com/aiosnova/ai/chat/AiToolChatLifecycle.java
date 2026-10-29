package com.aiosnova.ai.chat;

import java.util.Objects;

import com.aiosnova.ai.tool.AiToolAuthorizationService;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class AiToolChatLifecycle {

    private final AiChatService service;
    private final AiToolAuthorizationService authorization;
    private final AiToolChatRequests requests;

    AiToolChatLifecycle(
            AiChatService service,
            AiToolAuthorizationService authorization,
            AiToolChatRequests requests) {

        this.service = Objects.requireNonNull(service);
        this.authorization = Objects.requireNonNull(authorization);
        this.requests = Objects.requireNonNull(requests);
    }

    AiChatService.ChatReply chat(
            AiChatMessagesRequest request,
            String agentId,
            String requestId) {

        if (request == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Chat request is required.");
        }

        // 未通过公司和Agent工具授权，不占用请求ID。
        authorization.authorize(request.companyId(), agentId);

        var registration = requests.register(
                request.companyId(),
                agentId,
                requestId);

        try {
            return service.chatMessagesWithAuthorizedTools(
                    request,
                    agentId,
                    authorization,
                    registration.cancellation());
        } finally {
            requests.complete(registration);
        }
    }

    AiChatService.ChatReply chat(
            AiToolChatOwner owner,
            AiChatMessagesRequest request,
            String agentId,
            String requestId) {

        Objects.requireNonNull(
                owner, "Authenticated request owner is required.");

        if (request == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Chat request is required.");
        }

        authorization.authorize(request.companyId(), agentId);

        var registration = requests.register(
                owner,
                request.companyId(),
                agentId,
                requestId);

        try {
            return service.chatMessagesWithAuthorizedTools(
                    request,
                    agentId,
                    authorization,
                    registration.cancellation());
        } finally {
            requests.complete(registration);
        }
    }

    boolean cancel(
            AiToolChatOwner owner,
            String companyId,
            String agentId,
            String requestId) {

        Objects.requireNonNull(
                owner, "Authenticated request owner is required.");

        return requests.cancel(
                owner,
                companyId,
                agentId,
                requestId);
    }
}
