package com.aiosnova.ai.chat;

import java.util.Objects;

import com.aiosnova.auth.AuthRepository;
import com.aiosnova.auth.SessionService;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class AiSessionToolChatAccess implements AiToolChatAccess {

    private final SessionService sessions;
    private final AuthRepository repository;
    private final String merchantId;

    AiSessionToolChatAccess(
            SessionService sessions,
            AuthRepository repository,
            String merchantId) {

        this.sessions = Objects.requireNonNull(sessions);
        this.repository = Objects.requireNonNull(repository);

        if (merchantId == null
                || !merchantId.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new IllegalArgumentException(
                    "A valid configured Merchant is required.");
        }

        this.merchantId = merchantId;
    }

    @Override
    public AiToolChatOwner requireOwner(
            HttpServletRequest request,
            String companyId) {

        // 身份来自现有认证服务，不读取聊天JSON中的用户ID。
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Authentication is required.");
        }
        var actor = sessions.authenticate(request);

        if (actor == null || !"active".equals(actor.status())) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Authentication is required.");
        }

        if (!merchantId.equals(actor.merchantId())) {
            throw denied();
        }

        if (companyId == null
                || !companyId.matches("[A-Za-z0-9_-]{1,64}")) {
            throw denied();
        }

        boolean accessible = repository.accessibleCompanies(actor)
                .stream()
                .anyMatch(company -> companyId.equals(company.id()));

        if (!accessible) {
            throw denied();
        }

        return new AiToolChatOwner(
                actor.merchantId(),
                actor.id());
    }

    private static ResponseStatusException denied() {
        return new ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "This company is unavailable to the current user.");
    }
}
