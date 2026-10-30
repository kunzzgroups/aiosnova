package com.aiosnova.auth;

import com.aiosnova.audit.AuditLogService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

class MfaFailureTest {

    @Test
    void expiredTicketRecordsFailure() {
        var fixture = new Fixture(0);
        fixture.repository.challenge = new AuthRepository.Ticket(
                "ticket-id", "test-user", "restricted",
                Instant.now().minusSeconds(60), 0);

        assertFailure(
                fixture,
                HttpStatus.UNAUTHORIZED,
                AuditLogService.LoginFailureReason.MFA_TICKET_EXPIRED,
                0);
    }

    @Test
    void exceededAttemptsRecordsFailure() {
        var fixture = new Fixture(5);

        assertFailure(
                fixture,
                HttpStatus.TOO_MANY_REQUESTS,
                AuditLogService.LoginFailureReason.MFA_ATTEMPTS_EXCEEDED,
                0);
    }

    @Test
    void invalidMfaRecordsFailure() {
        var fixture = new Fixture(0);

        assertFailure(
                fixture,
                HttpStatus.UNAUTHORIZED,
                AuditLogService.LoginFailureReason.INVALID_MFA,
                1);
    }

    @Test
    void invalidMfaReachingLimitRecordsExceededFailure() {
        var fixture = new Fixture(4);

        assertFailure(
                fixture,
                HttpStatus.TOO_MANY_REQUESTS,
                AuditLogService.LoginFailureReason.MFA_ATTEMPTS_EXCEEDED,
                1);
    }

    @Test
    void missingTicketIsRejectedWithoutAudit() {
        var fixture = new Fixture(0);
        fixture.repository.challenge = null;

        var error = assertThrows(
                ResponseStatusException.class,
                () -> fixture.service.verifyLoginMfa(
                        "unknown-ticket", "000000"));

        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
        assertNoFailureSideEffects(fixture);
    }

    @Test
    void usedTicketIsRejectedWithoutAudit() {
        var fixture = new Fixture(0);
        fixture.repository.challenge = new AuthRepository.Ticket(
                "ticket-id",
                "test-user",
                "revoked",
                Instant.now().plusSeconds(300),
                0);

        var error = assertThrows(
                ResponseStatusException.class,
                () -> fixture.service.verifyLoginMfa(
                        "test-ticket", "000000"));

        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
        assertNoFailureSideEffects(fixture);
    }

    @Test
    void validMfaDoesNotRecordFailure() throws Exception {
        var fixture = new Fixture(0);
        fixture.totp.result = 100;

        var account = fixture.service.verifyLoginMfa(
                "test-ticket", "123456");

        assertEquals("test-user", account.userId());
        assertEquals(0, fixture.auditLog.calls);
        assertNull(fixture.auditLog.lastReason);
        assertEquals(0, fixture.repository.failureCalls);
        assertEquals(1, fixture.repository.useMfaCalls);
        assertEquals(100L, fixture.repository.lastUsedCounter);
        assertEquals(1, fixture.repository.consumeCalls);
    }

    private static void assertFailure(
            Fixture fixture,
            HttpStatus expectedStatus,
            AuditLogService.LoginFailureReason expectedReason,
            int expectedAttemptUpdates) {

        var error = assertThrows(
                ResponseStatusException.class,
                () -> fixture.service.verifyLoginMfa(
                        "test-ticket", "000000"));

        assertEquals(expectedStatus, error.getStatusCode());
        assertEquals(1, fixture.auditLog.calls);
        assertEquals(expectedReason, fixture.auditLog.lastReason);
        assertEquals(
                expectedAttemptUpdates,
                fixture.repository.failureCalls);

        assertEquals(0, fixture.repository.consumeCalls);
        assertEquals(0, fixture.repository.useMfaCalls);
    }

    private static void assertNoFailureSideEffects(Fixture fixture) {
        assertEquals(0, fixture.auditLog.calls);
        assertNull(fixture.auditLog.lastReason);
        assertEquals(0, fixture.repository.failureCalls);
        assertEquals(0, fixture.repository.consumeCalls);
        assertEquals(0, fixture.repository.useMfaCalls);
    }

    private static class Fixture {
        final FakeRepository repository = new FakeRepository();
        final FakeAuditLogService auditLog = new FakeAuditLogService();
        final FakeTotpService totp = new FakeTotpService();
        final InvitationService service;

        Fixture(int attempts) {
            var secrets = new AuthSecretService(
                    Base64.getEncoder().encodeToString(new byte[32]));

            repository.challenge = new AuthRepository.Ticket(
                    "ticket-id",
                    "test-user",
                    "restricted",
                    Instant.now().plusSeconds(300),
                    attempts);

            repository.mfa = new AuthRepository.Mfa(
                    "mfa-id",
                    secrets.encrypt("test-user", new byte[20]),
                    "test-key",
                    0,
                    -1);

            service = new InvitationService(
                    null,
                    totp,
                    repository,
                    secrets,
                    null,
                    null,
                    auditLog,
                    "http://localhost",
                    "merchant") {

                @Override
                public boolean canRequestOtp(String email) {
                    return true;
                }

                @Override
                public Account account(String email) {
                    return new Account(
                            "test-user",
                            email,
                            "Test User",
                            true,
                            true);
                }
            };
        }
    }

    private static class FakeRepository extends AuthRepository {
        Ticket challenge;
        Mfa mfa;
        int failureCalls;
        int consumeCalls;
        int useMfaCalls;
        long lastUsedCounter = -1;

        FakeRepository() {
            super(null, null);
        }

        @Override
        public Ticket ticket(String hash, boolean lock) {
            return challenge;
        }

        @Override
        public void lockUser(String id) {
            assertEquals("test-user", id);
        }

        @Override
        public User userById(String id) {
            assertEquals("test-user", id);
            return new User(
                    id, "test@example.com", "Test User", "active");
        }

        @Override
        public Mfa credential(String userId) {
            assertEquals("test-user", userId);
            return mfa;
        }

        @Override
        public void ticketFailure(String id) {
            assertEquals("ticket-id", id);
            failureCalls++;
        }

        @Override
        public void consumeTicket(String id) {
            assertEquals("ticket-id", id);
            consumeCalls++;
        }

        @Override
        public void useMfa(String id, long counter) {
            assertEquals("mfa-id", id);
            useMfaCalls++;
            lastUsedCounter = counter;
        }
    }

    private static class FakeTotpService extends TotpService {
        long result = -1;

        @Override
        public long verify(
                byte[] secret,
                String code,
                long lastCounter) {

            assertEquals(-1L, lastCounter);
            return result;
        }
    }

    private static class FakeAuditLogService extends AuditLogService {
        int calls;
        LoginFailureReason lastReason;

        FakeAuditLogService() {
            super(null);
        }

        @Override
        public void recordLoginFailure(
                String merchantId,
                String targetUserId,
                LoginFailureReason reason) {

            assertEquals("merchant", merchantId);
            assertEquals("test-user", targetUserId);
            calls++;
            lastReason = reason;
        }
    }
}