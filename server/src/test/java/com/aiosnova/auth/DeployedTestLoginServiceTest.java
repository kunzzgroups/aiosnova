package com.aiosnova.auth;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

class DeployedTestLoginServiceTest {
    private final String expiry = "2026-11-01T00:00:00Z";

    private String hash() throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest("582943".getBytes(StandardCharsets.UTF_8)));
    }

    @Test void credentialsAreScopedAndExpire() throws Exception {
        var service = new DeployedTestLoginService(null, null, true, "owner@example.com", hash(), expiry, "merchant");
        var now = Instant.parse("2026-10-22T00:00:00Z");
        assertTrue(service.matches(" OWNER@example.com ", "582943", now));
        assertFalse(service.matches("other@example.com", "582943", now));
        assertFalse(service.matches("owner@example.com", "000000", now));
        assertFalse(service.matches("owner@example.com", "582943", Instant.parse(expiry)));
        assertFalse(service.matches("owner@example.com", "582943", Instant.parse(expiry).plusSeconds(1)));
    }

    @Test void disabledAndIncompleteConfigurationsFailClosed() {
        var service = new DeployedTestLoginService(null, null, false, "", "", "", "merchant");
        assertFalse(service.matches("owner@example.com", "582943", Instant.now()));
        assertThrows(IllegalArgumentException.class, () -> new DeployedTestLoginService(null, null,
                true, "owner@example.com", "", expiry, "merchant"));
    }

    @Test void onlyActiveDatabaseOwnerGetsSessionAndAudit() throws Exception {
        var repository = new FakeRepository();
        var sessions = new FakeSessions();
        var service = new DeployedTestLoginService(repository, sessions, true, "owner@example.com", hash(),
                "2099-01-01T00:00:00Z", "merchant");
        repository.actor = new SessionService.Actor("user", "merchant", "active", false, true, true);
        assertNull(service.tryLogin("owner@example.com", "582943", null));
        repository.actor = new SessionService.Actor("user", "merchant", "disabled", true, true, true);
        assertNull(service.tryLogin("owner@example.com", "582943", null));
        repository.actor = null;
        assertNull(service.tryLogin("owner@example.com", "582943", null));
        assertEquals(0, sessions.issued);
        repository.actor = new SessionService.Actor("user", "merchant", "active", true, true, true);
        assertNotNull(service.tryLogin("owner@example.com", "582943", null));
        assertEquals(1, sessions.issued);
        assertTrue(repository.audited);
    }

    private static class FakeRepository extends AuthRepository {
        SessionService.Actor actor;
        boolean audited;
        FakeRepository() { super(null, null); }
        @Override public User user(String email, boolean lock) { return new User("user", email, "Owner", "active"); }
        @Override public SessionService.Actor actor(String merchant, String user) {
            assertEquals("merchant", merchant);
            return actor;
        }
        @Override public void audit(String merchant, String actorId, String action, String type, String id, Map<String, Object> data) {
            assertEquals("identity.session.deployed_test_login", action);
            assertTrue(data.isEmpty());
            audited = true;
        }
    }

    private static class FakeSessions extends SessionService {
        int issued;
        FakeSessions() { super(null, null, "merchant", null); }
        @Override public ResponseEntity<Login> issue(String user, HttpServletRequest request) {
            issued++;
            return ResponseEntity.ok().build();
        }
    }
}
