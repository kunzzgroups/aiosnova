package com.aiosnova.auth;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SessionService {
    private final AuthRepository repository;
    private final AuthSecretService secrets;
    private final String merchantId;
    private final SecureRandom random = new SecureRandom();

    public SessionService(AuthRepository repository, AuthSecretService secrets,
                          @Value("${app.local-merchant-id}") String merchantId) {
        this.repository = repository;
        this.secrets = secrets;
        this.merchantId = merchantId;
    }

    @Transactional
    public ResponseEntity<Login> issue(String userId, HttpServletRequest request) {
        String token = token("backend_");
        String csrf = token("");
        Actor actor = repository.actor(merchantId, userId);
        if (actor == null || !"active".equals(actor.status())) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        repository.createSession(UUID.randomUUID().toString(), merchantId, userId,
                secrets.tokenHash(token), secrets.tokenHash(csrf), Instant.now());
        return ResponseEntity.ok()
                .header("Set-Cookie", cookie("nova_session", token, true, request, 28800),
                        cookie("aios_csrf", csrf, false, request, 28800))
                .header("Cache-Control", "no-store").body(login(token, actor));
    }

    public Actor authenticate(HttpServletRequest request) {
        String auth = request.getHeader("Authorization");
        if (auth == null || !auth.startsWith("Bearer backend_")) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        Actor actor = repository.sessionActor(secrets.tokenHash(auth.substring(7)), null);
        if (actor == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return actor;
    }

    public ResponseEntity<Login> refresh(HttpServletRequest request) {
        String token = sessionCookie(request);
        Actor actor = cookieActor(request, token);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(login(token, actor));
    }

    @Transactional
    public ResponseEntity<AuthController.MessageResponse> logout(HttpServletRequest request) {
        String token = sessionCookie(request);
        cookieActor(request, token);
        repository.revokeSession(secrets.tokenHash(token));
        return ResponseEntity.ok().header("Set-Cookie", cookie("nova_session", "", true, request, 0),
                cookie("aios_csrf", "", false, request, 0)).body(new AuthController.MessageResponse("Signed out."));
    }

    private Actor cookieActor(HttpServletRequest request, String token) {
        String csrf = request.getHeader("X-CSRF-Token");
        if (csrf == null || csrf.isBlank()) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        Actor actor = repository.sessionActor(secrets.tokenHash(token), secrets.tokenHash(csrf));
        if (actor == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return actor;
    }

    private String sessionCookie(HttpServletRequest request) {
        if (request.getCookies() != null) for (var cookie : request.getCookies()) {
            if ("nova_session".equals(cookie.getName())) return cookie.getValue();
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
    }

    private Login login(String token, Actor actor) {
        AuthRepository.User user = repository.userById(actor.id());
        return new Login(token, new PublicUser(user.id(), user.email(), user.fullName(),
                repository.hasMfa(user.id()), user.fullName() != null && !user.fullName().isBlank(),
                actor.owner(), actor.manageUsers()));
    }

    private String token(String prefix) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return prefix + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String cookie(String name, String value, boolean httpOnly, HttpServletRequest request, long seconds) {
        return ResponseCookie.from(name, value).path("/").httpOnly(httpOnly).secure(request.isSecure())
                .sameSite("Lax").maxAge(seconds).build().toString();
    }

    public record Actor(String id, String merchantId, String status, boolean owner, boolean manageUsers, boolean canInvite) { }
    public record PublicUser(String id, String email, String name, boolean mfaEnabled,
                             boolean profileComplete, boolean isOwner, boolean canManageUsers) { }
    public record Login(String accessToken, PublicUser user) { }
}
