package com.aiosnova.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@Profile("local & !prod & !production")
@ConditionalOnProperty(name = "app.local-test-login.enabled", havingValue = "true")
public class LocalTestLoginController {
    private final AuthRepository repository;
    private final SessionService sessions;
    private final String email;
    private final String frontendUrl;

    public LocalTestLoginController(AuthRepository repository, SessionService sessions,
            @Value("${app.local-test-login.email}") String email,
            @Value("${app.frontend-url}") String frontendUrl) {
        this.repository = repository;
        this.sessions = sessions;
        this.email = email;
        this.frontendUrl = frontendUrl;
    }

    @PostMapping("/api/auth/local-test-login")
    @Transactional
    public ResponseEntity<SessionService.Login> login(HttpServletRequest request) {
        if (!loopback(request.getRemoteAddr()) || !loopback(request.getServerName())
                || !loopback(URI.create(frontendUrl).getHost()) || !frontendUrl.equals(request.getHeader("Origin"))
                || request.getHeader("Forwarded") != null || request.getHeader("X-Forwarded-For") != null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        var user = repository.user(email, true);
        if (user == null || !"active".equals(user.status())) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        var response = sessions.issue(
                user.id(),
                request,
                SessionService.LoginMethod.LOCAL_TEST);
        return response;
    }

    private boolean loopback(String host) {
        return "localhost".equals(host) || "127.0.0.1".equals(host) || "::1".equals(host)
                || "0:0:0:0:0:0:0:1".equals(host);
    }
}
