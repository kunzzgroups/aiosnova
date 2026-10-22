package com.aiosnova.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Temporary, explicitly configured credential for checking a deployed test site. */
@Service
public class DeployedTestLoginService {
    private final AuthRepository repository;
    private final SessionService sessions;
    private final boolean enabled;
    private final String email;
    private final String codeHash;
    private final Instant expiresAt;
    private final String merchantId;

    public DeployedTestLoginService(AuthRepository repository, SessionService sessions,
            @Value("${app.test-login.enabled:false}") boolean enabled,
            @Value("${app.test-login.email:}") String email,
            @Value("${app.test-login.code-sha256:}") String codeHash,
            @Value("${app.test-login.expires-at:}") String expiresAt,
            @Value("${app.local-merchant-id}") String merchantId) {
        this.repository = repository;
        this.sessions = sessions;
        this.enabled = enabled;
        this.email = email.trim().toLowerCase(Locale.ROOT);
        this.codeHash = codeHash;
        this.merchantId = merchantId;
        if (enabled && (this.email.isBlank() || !codeHash.matches("[0-9a-f]{64}") || expiresAt.isBlank())) {
            throw new IllegalArgumentException("Test login requires email, lowercase SHA-256 hash and expiry.");
        }
        this.expiresAt = enabled ? Instant.parse(expiresAt) : Instant.EPOCH;
    }

    @Transactional
    public ResponseEntity<SessionService.Login> tryLogin(String recipient, String code, HttpServletRequest request) {
        if (!matches(recipient, code, Instant.now())) return null;
        var user = repository.user(email, true);
        if (user == null) return null;
        var actor = repository.actor(merchantId, user.id());
        if (actor == null || !actor.owner() || !"active".equals(actor.status())) return null;
        var response = sessions.issue(user.id(), request);
        repository.audit(merchantId, user.id(), "identity.session.deployed_test_login", "user", user.id(), Map.of());
        return response;
    }

    boolean matches(String recipient, String code, Instant now) {
        if (!enabled || !now.isBefore(expiresAt) || recipient == null || code == null
                || !email.equals(recipient.trim().toLowerCase(Locale.ROOT)) || !code.matches("[0-9]{6}")) return false;
        try {
            byte[] actual = MessageDigest.getInstance("SHA-256").digest(code.getBytes(StandardCharsets.UTF_8));
            return MessageDigest.isEqual(HexFormat.of().parseHex(codeHash), actual);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
