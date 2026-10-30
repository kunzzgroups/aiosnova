package com.aiosnova.ai.mcp;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.*;

class AiMcpVerificationRepositoryTest {

    private static final String COMPANY = "company-j1";
    private static final String MERCHANT = "merchant-acme";
    private static final String SERVER = "server-test";

    private static final class CapturingJdbc extends JdbcTemplate {

        String sql;
        List<Object> parameters;
        int calls;
        int affectedRows = 1;

        @Override
        public int update(String sql, Object... args) {
            calls++;

            this.sql = sql.replaceAll("\\s+", " ")
                    .trim()
                    .toLowerCase(Locale.ROOT);

            parameters = Arrays.asList(args.clone());

            assertEquals(
                    (long) args.length,
                    sql.chars().filter(character -> character == '?').count());

            assertFalse(this.sql.contains(COMPANY));
            assertFalse(this.sql.contains(MERCHANT));
            assertFalse(this.sql.contains(SERVER));
            assertFalse(this.sql.contains("secret_ciphertext"));
            assertFalse(this.sql.contains("ai_mcp_tools"));
            assertFalse(this.sql.contains("ai_agent_mcp_tools"));

            return affectedRows;
        }
    }

    private final CapturingJdbc jdbc = new CapturingJdbc();

    private final AiMcpRepository repository =
            new AiMcpRepository(jdbc);

    private void assertScopedVersionConditions() {
        assertTrue(jdbc.sql.contains(
                "where company_id = ? "
                        + "and merchant_id = ? "
                        + "and id = ? "
                        + "and version = ? "
                        + "and connection_revision = ?"));

        assertTrue(jdbc.sql.contains("version = version + 1"));
    }

    private void assertPendingConditions() {
        assertTrue(jdbc.sql.endsWith(
                "and verification_status = 'not_verified' "
                        + "and verification_revision is null "
                        + "and verification_checked_at is null"));
    }

    @Test
    void registrationClearsOldVerificationAndChecksBothVersions() {
        assertEquals(1, repository.beginVerification(
                COMPANY, MERCHANT, SERVER, 4L, 2L));

        assertScopedVersionConditions();

        assertTrue(jdbc.sql.contains(
                "verification_status = 'not_verified'"));
        assertTrue(jdbc.sql.contains("verification_revision = null"));
        assertTrue(jdbc.sql.contains("verification_checked_at = null"));
        assertTrue(jdbc.sql.contains("verification_error_code = null"));
        assertTrue(jdbc.sql.contains("verification_error_message = null"));

        assertEquals(
                List.of(COMPANY, MERCHANT, SERVER, 4L, 2L),
                jdbc.parameters);
    }

    @Test
    void successStoresRevisionAndClearsErrors() {
        assertEquals(1, repository.completeVerification(
                COMPANY, MERCHANT, SERVER, 5L, 2L, true));

        assertScopedVersionConditions();
        assertPendingConditions();

        assertTrue(jdbc.sql.contains(
                "verification_checked_at = utc_timestamp(6)"));

        assertEquals(
                Arrays.asList(
                        "verified",
                        2L,
                        null,
                        null,
                        COMPANY,
                        MERCHANT,
                        SERVER,
                        5L,
                        2L),
                jdbc.parameters);
    }

    @Test
    void failureStoresOnlyFixedSafeError() {
        assertEquals(1, repository.completeVerification(
                COMPANY, MERCHANT, SERVER, 5L, 2L, false));

        assertScopedVersionConditions();
        assertPendingConditions();

        assertEquals(
                List.of(
                        "failed",
                        2L,
                        "mcp_verification_failed",
                        "MCP initialization failed.",
                        COMPANY,
                        MERCHANT,
                        SERVER,
                        5L,
                        2L),
                jdbc.parameters);
    }

    @Test
    void staleOrUnmatchedUpdateReturnsZeroForServiceToReject() {
        jdbc.affectedRows = 0;

        assertEquals(0, repository.beginVerification(
                COMPANY, MERCHANT, SERVER, 4L, 2L));

        assertEquals(0, repository.completeVerification(
                COMPANY, MERCHANT, SERVER, 5L, 2L, true));

        assertEquals(2, jdbc.calls);
    }

    @Test
    void invalidScopeAndNegativeVersionsNeverReachJdbc() {
        for (String invalid : new String[]{
                null, "", " ", "bad/id", "公司"}) {

            assertInvalidScope(invalid, MERCHANT, SERVER);
            assertInvalidScope(COMPANY, invalid, SERVER);
            assertInvalidScope(COMPANY, MERCHANT, invalid);
        }

        assertInvalidScope("a".repeat(65), MERCHANT, SERVER);
        assertInvalidScope(COMPANY, "a".repeat(65), SERVER);
        assertInvalidScope(COMPANY, MERCHANT, "a".repeat(37));

        assertThrows(IllegalArgumentException.class,
                () -> repository.beginVerification(
                        COMPANY, MERCHANT, SERVER, -1L, 2L));

        assertThrows(IllegalArgumentException.class,
                () -> repository.beginVerification(
                        COMPANY, MERCHANT, SERVER, 4L, -1L));

        assertThrows(IllegalArgumentException.class,
                () -> repository.completeVerification(
                        COMPANY, MERCHANT, SERVER, -1L, 2L, true));

        assertThrows(IllegalArgumentException.class,
                () -> repository.completeVerification(
                        COMPANY, MERCHANT, SERVER, 5L, -1L, false));

        assertEquals(0, jdbc.calls);
    }

    private void assertInvalidScope(
            String company,
            String merchant,
            String server) {

        assertThrows(IllegalArgumentException.class,
                () -> repository.beginVerification(
                        company, merchant, server, 4L, 2L));

        assertThrows(IllegalArgumentException.class,
                () -> repository.completeVerification(
                        company, merchant, server, 5L, 2L, true));
    }
}
