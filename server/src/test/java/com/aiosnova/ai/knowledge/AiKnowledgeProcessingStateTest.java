package com.aiosnova.ai.knowledge;

import java.util.Locale;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.*;

class AiKnowledgeProcessingStateTest {

    static final String COMPANY = "company-j1";
    static final String JOB =
            "22222222-2222-4222-8222-222222222222";

    static class StateJdbc extends JdbcTemplate {

        String status = "queued";
        String token;
        String errorCode;
        int attempts;
        int maxAttempts = 3;

        // 模拟数据库时间，单位为秒。
        long now = 100;
        long availableAt = 100;
        Long leaseUntil;

        @Override
        public int update(String sql, Object... args) {
            String normalized = sql.replaceAll("\\s+", " ")
                    .trim().toLowerCase(Locale.ROOT);

            assertTrue(normalized.startsWith(
                    "update ai_knowledge_processing_jobs"));
            assertTrue(normalized.contains("company_id = ?"));
            assertTrue(normalized.contains("id = ?"));

            if (normalized.contains("error_code = 'attempts_exhausted'")) {
                return exhaust(normalized, args);
            }
            if (normalized.contains("attempt_count = attempt_count + 1")) {
                return claim(normalized, args);
            }

            return finish(normalized, args);
        }

        private int exhaust(String sql, Object[] args) {
            assertEquals(1, args.length);
            assertTrue(sql.contains("where company_id = ?"));
            assertTrue(sql.contains("attempt_count >= max_attempts"));
            assertTrue(sql.contains("status = 'running'"));
            assertTrue(sql.contains("lease_expires_at <= utc_timestamp(6)"));
            assertTrue(sql.contains("status = 'queued'"));
            assertTrue(sql.contains("available_at <= utc_timestamp(6)"));
            assertTrue(sql.contains("claim_token = null"));
            assertTrue(sql.contains("lease_expires_at = null"));
            assertTrue(sql.contains("finished_at = utc_timestamp(6)"));
            assertTrue(sql.contains("status = 'failed'"));
            boolean expired = status.equals("running") && leaseUntil != null && leaseUntil <= now;
            boolean due = status.equals("queued") && availableAt <= now;
            if (!COMPANY.equals(args[0]) || attempts < maxAttempts || !(expired || due)) return 0;
            status = "failed";
            token = null;
            leaseUntil = null;
            errorCode = "attempts_exhausted";
            return 1;
        }

        private int claim(String sql, Object[] args) {
            assertEquals(4, args.length);
            assertTrue(sql.contains("attempt_count < max_attempts"));
            assertTrue(sql.contains("status = 'queued'"));
            assertTrue(sql.contains(
                    "available_at <= utc_timestamp(6)"));
            assertTrue(sql.contains("status = 'running'"));
            assertTrue(sql.contains(
                    "lease_expires_at <= utc_timestamp(6)"));
            assertTrue(sql.contains(
                    "timestampadd(second, ?, utc_timestamp(6))"));
            assertTrue(sql.contains("error_code = null"));

            if (!COMPANY.equals(args[2]) || !JOB.equals(args[3])) {
                return 0;
            }

            boolean queuedDue =
                    status.equals("queued") && availableAt <= now;
            boolean expired =
                    status.equals("running")
                            && leaseUntil != null
                            && leaseUntil <= now;

            if (attempts >= maxAttempts || !(queuedDue || expired)) {
                return 0;
            }

            token = (String) args[0];
            leaseUntil = now + ((Number) args[1]).longValue();
            status = "running";
            attempts++;
            errorCode = null;
            return 1;
        }

        private int finish(String sql, Object[] args) {
            assertEquals(3, args.length);
            assertTrue(sql.contains("status = 'running'"));
            assertTrue(sql.contains("claim_token = ?"));
            assertTrue(sql.contains(
                    "lease_expires_at > utc_timestamp(6)"));
            assertTrue(sql.contains("claim_token = null"));
            assertTrue(sql.contains("lease_expires_at = null"));
            assertTrue(sql.contains(
                    "finished_at = utc_timestamp(6)"));

            boolean success = sql.contains("status = 'succeeded'");
            if (!success) {
                assertTrue(sql.contains("status = 'failed'"));
                assertTrue(sql.contains(
                        "error_code = 'processing_failed'"));
                assertTrue(sql.contains(
                        "error_message = 'file processing failed.'"));
            } else {
                assertTrue(sql.contains("error_code = null"));
                assertTrue(sql.contains("error_message = null"));
            }

            if (!COMPANY.equals(args[0])
                    || !JOB.equals(args[1])
                    || !status.equals("running")
                    || token == null
                    || !token.equals(args[2])
                    || leaseUntil == null
                    || leaseUntil <= now) {
                return 0;
            }

            status = success ? "succeeded" : "failed";
            errorCode = success ? null : "processing_failed";
            token = null;
            leaseUntil = null;
            return 1;
        }
    }

    @Test
    void queuedTaskCanBeClaimedWhenDue() {
        var jdbc = new StateJdbc();
        var repository = new AiKnowledgeProcessingRepository(jdbc);

        jdbc.availableAt = 101;
        assertTrue(repository.claim(COMPANY, JOB, 30).isEmpty());
        assertEquals(0, jdbc.attempts);

        jdbc.now = 101;
        var claim = repository.claim(COMPANY, JOB, 30).orElseThrow();

        assertEquals(COMPANY, claim.companyId());
        assertEquals(JOB, claim.jobId());
        assertEquals(claim.token(), jdbc.token);
        assertEquals("running", jdbc.status);
        assertEquals(1, jdbc.attempts);
        assertEquals(Long.valueOf(131), jdbc.leaseUntil);

        assertTrue(repository.claim(COMPANY, JOB, 30).isEmpty());
        assertEquals(1, jdbc.attempts);
        assertEquals(claim.token(), jdbc.token);
    }

    @Test
    void validClaimCanSucceedOnlyOnce() {
        var jdbc = new StateJdbc();
        var repository = new AiKnowledgeProcessingRepository(jdbc);
        var claim = repository.claim(COMPANY, JOB, 30).orElseThrow();

        assertTrue(repository.succeed(claim));
        assertEquals("succeeded", jdbc.status);
        assertNull(jdbc.token);
        assertNull(jdbc.leaseUntil);
        assertNull(jdbc.errorCode);

        assertFalse(repository.succeed(claim));
        assertFalse(repository.fail(claim));
        assertTrue(repository.claim(COMPANY, JOB, 30).isEmpty());
    }

    @Test
    void validClaimCanFailOnlyOnce() {
        var jdbc = new StateJdbc();
        var repository = new AiKnowledgeProcessingRepository(jdbc);
        var claim = repository.claim(COMPANY, JOB, 30).orElseThrow();

        assertTrue(repository.fail(claim));
        assertEquals("failed", jdbc.status);
        assertEquals("processing_failed", jdbc.errorCode);
        assertNull(jdbc.token);
        assertNull(jdbc.leaseUntil);

        assertFalse(repository.succeed(claim));
        assertFalse(repository.fail(claim));
        assertTrue(repository.claim(COMPANY, JOB, 30).isEmpty());
    }

    @Test
    void expiredClaimCannotOverwriteReclaimedTaskOrNewResult() {
        var jdbc = new StateJdbc();
        var repository = new AiKnowledgeProcessingRepository(jdbc);
        var oldClaim = repository.claim(COMPANY, JOB, 30)
                .orElseThrow();

        // 刚好到期：旧处理器即使尚未被替换，也不能提交。
        jdbc.now = 130;
        assertFalse(repository.succeed(oldClaim));
        assertFalse(repository.fail(oldClaim));

        var newClaim = repository.claim(COMPANY, JOB, 30)
                .orElseThrow();

        assertNotEquals(oldClaim.token(), newClaim.token());
        assertEquals(2, jdbc.attempts);

        // 新处理器运行中，旧 token 不能修改它。
        assertFalse(repository.succeed(oldClaim));
        assertFalse(repository.fail(oldClaim));
        assertEquals("running", jdbc.status);
        assertEquals(newClaim.token(), jdbc.token);

        assertTrue(repository.succeed(newClaim));

        // 新结果保存后，旧 token 仍不能覆盖。
        assertFalse(repository.fail(oldClaim));
        assertFalse(repository.succeed(oldClaim));
        assertEquals("succeeded", jdbc.status);
        assertNull(jdbc.errorCode);
    }

    @Test
    void exhaustedTaskCannotBeReclaimed() {
        var jdbc = new StateJdbc();
        var repository = new AiKnowledgeProcessingRepository(jdbc);
        jdbc.maxAttempts = 1;

        var claim = repository.claim(COMPANY, JOB, 30).orElseThrow();
        jdbc.now = 130;

        assertTrue(repository.claim(COMPANY, JOB, 30).isEmpty());
        assertEquals(1, jdbc.attempts);
        assertFalse(repository.succeed(claim));
    }

    @Test
    void exhaustedRunningTaskFailsOnlyAfterExpiry() {
        var jdbc = new StateJdbc();
        var repository = new AiKnowledgeProcessingRepository(jdbc);
        jdbc.maxAttempts = 1;
        var claim = repository.claim(COMPANY, JOB, 30).orElseThrow();
        assertEquals(0, repository.failExhausted(COMPANY));
        assertEquals("running", jdbc.status);
        jdbc.now = 130;
        assertEquals(1, repository.failExhausted(COMPANY));
        assertEquals("failed", jdbc.status);
        assertEquals("attempts_exhausted", jdbc.errorCode);
        assertNull(jdbc.token);
        assertNull(jdbc.leaseUntil);
        assertFalse(repository.succeed(claim));
        assertFalse(repository.fail(claim));
        assertEquals("attempts_exhausted", jdbc.errorCode);
        assertEquals(0, repository.failExhausted(COMPANY));
    }

    @Test
    void cleanupPreservesRetryableAndSucceededTasks() {
        var jdbc = new StateJdbc();
        var repository = new AiKnowledgeProcessingRepository(jdbc);
        repository.claim(COMPANY, JOB, 30).orElseThrow();
        jdbc.now = 130;
        assertEquals(0, repository.failExhausted(COMPANY));
        assertEquals("running", jdbc.status);
        var next = repository.claim(COMPANY, JOB, 30).orElseThrow();
        assertTrue(repository.succeed(next));
        jdbc.maxAttempts = jdbc.attempts;
        assertEquals(0, repository.failExhausted(COMPANY));
        assertEquals("succeeded", jdbc.status);
    }

    @Test
    void queuedExhaustionRespectsCompanyAndDueTime() {
        var jdbc = new StateJdbc();
        var repository = new AiKnowledgeProcessingRepository(jdbc);
        jdbc.attempts = jdbc.maxAttempts;
        jdbc.availableAt = 101;
        assertEquals(0, repository.failExhausted(COMPANY));
        jdbc.now = 101;
        assertEquals(0, repository.failExhausted("company-j2"));
        assertEquals("queued", jdbc.status);
        assertEquals(1, repository.failExhausted(COMPANY));
        assertEquals("failed", jdbc.status);
        assertEquals("attempts_exhausted", jdbc.errorCode);
    }

    @Test
    void otherCompanyCannotClaimOrCompleteTask() {
        var jdbc = new StateJdbc();
        var repository = new AiKnowledgeProcessingRepository(jdbc);

        assertTrue(repository.claim("company-j2", JOB, 30).isEmpty());
        assertEquals("queued", jdbc.status);

        var claim = repository.claim(COMPANY, JOB, 30).orElseThrow();
        var forged = new AiKnowledgeProcessingRepository.Claim(
                JOB, "company-j2", claim.token());

        assertFalse(repository.succeed(forged));
        assertFalse(repository.fail(forged));
        assertEquals("running", jdbc.status);
        assertEquals(claim.token(), jdbc.token);
    }
}
