package com.aiosnova.auth;

import com.aiosnova.audit.AuditLogService;
import com.aiosnova.auth.TacRepository.Challenge;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class TacServiceTest {
    private static class FakeTacRepository extends TacRepository {
        Challenge challenge;
        int consumeCalls;
        int failureCalls;

        FakeTacRepository() {
            super(null);
        }

        @Override
        public Challenge latest(String userId) {
            return challenge;
        }

        @Override
        public void failure(String id) {
            failureCalls++;
        }

        @Override 
        public void consume(String id){
            consumeCalls++;
        }
    }

    private static class FakeAuditLogService extends AuditLogService {
        int failureCalls;
        LoginFailureReason lastReason;

        FakeAuditLogService() {
            super(null);
        }

        @Override
        public void recordLoginFailure(String merchandId, String targetUserId, LoginFailureReason reason) {
            failureCalls++;
            lastReason = reason;
        }
    }

    private static class FakeAccounts extends AuthRepository {
        FakeAccounts() {
            super(null, null);
        }

        @Override
        public User user(String email, boolean lock) {
            return new User("test-user", email, "Test User", "active");
        }
    }

    private static class FakeInvitationService extends InvitationService {
        FakeInvitationService() {
            super(null, null, null, null, null, null, null, "http://localhost", "merchant");
        }

        @Override
        public boolean canRequestOtp(String email) {
            return true;
        }
    }

    @Test
    void missingChallengeRecordsExpiredFailure() {
        var repository = new FakeTacRepository();
        var auditLog = new FakeAuditLogService();

        var service = new TacService(
                null,
                repository,
                new FakeAccounts(),
                null,
                new FakeInvitationService(),
                60,
                auditLog,
                "merchant");

        var result = service.verify("test@example.com", "000000");
        assertEquals(TacService.VerifyResult.EXPIRED, result);

        assertEquals(1, auditLog.failureCalls);

        assertEquals(
                AuditLogService.LoginFailureReason.OTP_EXPIRED,
                auditLog.lastReason);

        assertEquals(0, repository.failureCalls);
    }

    @Test
    void expiredChallengeRecordsExpiredFailure() {
        var repository = new FakeTacRepository();
        repository.challenge = new Challenge(
                "test-challenge",
                "unused-hash",
                Instant.now().minusSeconds(600),
                Instant.now().minusSeconds(300),
                false,
                0,
                5);
        var auditLog = new FakeAuditLogService();

        var service = new TacService(
                null,
                repository,
                new FakeAccounts(),
                null,
                new FakeInvitationService(),
                60,
                auditLog,
                "merchant");

        var result = service.verify("test@example.com", "000000");
        assertEquals(TacService.VerifyResult.EXPIRED, result);

        assertEquals(1, auditLog.failureCalls);

        assertEquals(
                AuditLogService.LoginFailureReason.OTP_EXPIRED,
                auditLog.lastReason);

        assertEquals(0, repository.failureCalls);
    }

    @Test
    void exceededAttemptsRecordsFailure() {
        var repository = new FakeTacRepository();
        repository.challenge = new Challenge(
                "test-challenge",
                "unused-hash",
                Instant.now().minusSeconds(60),
                Instant.now().plusSeconds(300),
                false,
                5,
                5);
        var auditLog = new FakeAuditLogService();

        var service = new TacService(
                null,
                repository,
                new FakeAccounts(),
                null,
                new FakeInvitationService(),
                60,
                auditLog,
                "merchant");

        var result = service.verify("test@example.com", "000000");
        assertEquals(TacService.VerifyResult.ATTEMPTS_EXCEEDED, result);
        assertEquals(1, auditLog.failureCalls);

        assertEquals(
                AuditLogService.LoginFailureReason.OTP_ATTEMPTS_EXCEEDED,
                auditLog.lastReason);

        assertEquals(0, repository.failureCalls);
    }

    @Test
    void invalidOtpRecordsFailure() {
        var repository = new FakeTacRepository();
        var secrets = new AuthSecretService(java.util.Base64.getEncoder().encodeToString(new byte[32]));
        repository.challenge = new Challenge(
                "test-challenge",
                secrets.otpHash("test-challenge", "123456"),
                Instant.now().minusSeconds(60),
                Instant.now().plusSeconds(300),
                false,
                0,
                5);
        var auditLog = new FakeAuditLogService();

        var service = new TacService(
                null,
                repository,
                new FakeAccounts(),
                secrets,
                new FakeInvitationService(),
                60,
                auditLog,
                "merchant");

        var result = service.verify("test@example.com", "000000");
        assertEquals(TacService.VerifyResult.INVALID, result);
        assertEquals(1, auditLog.failureCalls);

        assertEquals(
                AuditLogService.LoginFailureReason.INVALID_OTP,
                auditLog.lastReason);

        assertEquals(1, repository.failureCalls);
    }

    @Test
    void invalidOtpReachingLimitRecordsExceededFailure() {
        var repository = new FakeTacRepository();
        var secrets = new AuthSecretService(java.util.Base64.getEncoder().encodeToString(new byte[32]));
        repository.challenge = new Challenge(
                "test-challenge",
                secrets.otpHash("test-challenge", "123456"),
                Instant.now().minusSeconds(60),
                Instant.now().plusSeconds(300),
                false,
                4,
                5);
        var auditLog = new FakeAuditLogService();

        var service = new TacService(
                null,
                repository,
                new FakeAccounts(),
                secrets,
                new FakeInvitationService(),
                60,
                auditLog,
                "merchant");

        var result = service.verify("test@example.com", "000000");
        assertEquals(TacService.VerifyResult.ATTEMPTS_EXCEEDED, result);
        assertEquals(1, auditLog.failureCalls);

        assertEquals(
                AuditLogService.LoginFailureReason.OTP_ATTEMPTS_EXCEEDED,
                auditLog.lastReason);

        assertEquals(1, repository.failureCalls);
    }

    @Test
    void validOtpDoesNotRecordFailure() {
        var repository = new FakeTacRepository();
        var secrets = new AuthSecretService(java.util.Base64.getEncoder().encodeToString(new byte[32]));
        repository.challenge = new Challenge(
                "test-challenge",
                secrets.otpHash("test-challenge", "123456"),
                Instant.now().minusSeconds(60),
                Instant.now().plusSeconds(300),
                false,
                0,
                5);
        var auditLog = new FakeAuditLogService();

        var service = new TacService(
                null,
                repository,
                new FakeAccounts(),
                secrets,
                new FakeInvitationService(),
                60,
                auditLog,
                "merchant");

        var result = service.verify("test@example.com", "123456");
        assertEquals(TacService.VerifyResult.VERIFIED, result);
        assertEquals(1, repository.consumeCalls);
        assertEquals(0, repository.failureCalls);
        assertEquals(0, auditLog.failureCalls);
        assertNull(auditLog.lastReason);
    }

}
