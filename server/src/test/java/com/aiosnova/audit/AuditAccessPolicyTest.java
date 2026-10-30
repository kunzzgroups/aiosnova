package com.aiosnova.audit;

import com.aiosnova.auth.AuthRepository;
import com.aiosnova.auth.SessionService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class AuditAccessPolicyTest {

    private static final String MERCHANT_ID = "merchant-id";
    private static final String USER_ID = "user-id";
    private static final String COMPANY_ID =
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    @Test
    void unauthenticatedRequestIsRejected() {
        var policy = new AuditAccessPolicy(null, null);

        assertStatus(
                HttpStatus.UNAUTHORIZED,
                () -> policy.resolve(null, "merchant", null));
    }

    @Test
    void missingDatabaseActorIsRejected() {
        var fixture = new Fixture(false);
        fixture.auth.currentActor = null;

        assertStatus(
                HttpStatus.UNAUTHORIZED,
                () -> fixture.policy.resolve(
                        actor(false), "company", COMPANY_ID));

        assertEquals(0, fixture.jdbc.calls);
    }

    @Test
    void disabledDatabaseActorIsRejected() {
        var fixture = new Fixture(true);
        fixture.auth.currentActor = new SessionService.Actor(
                USER_ID, MERCHANT_ID, "disabled",
                true, false, false);

        assertStatus(
                HttpStatus.UNAUTHORIZED,
                () -> fixture.policy.resolve(
                        actor(true), "merchant", null));

        assertEquals(0, fixture.jdbc.calls);
    }

    @Test
    void ownerCanReadEntireMerchant() {
        var fixture = new Fixture(true);

        var scope = fixture.policy.resolve(
                actor(true), "merchant", null);

        assertEquals(MERCHANT_ID, scope.merchantId());
        assertNull(scope.companyId());
        assertTrue(scope.merchantWide());
        assertEquals(0, fixture.jdbc.calls);
        assertEquals(0, fixture.auth.permissionCalls);
    }

    @Test
    void employeeCannotReadEntireMerchantEvenWithCompanyGrant() {
        var fixture = new Fixture(false);
        fixture.auth.auditReadGranted = true;

        assertStatus(
                HttpStatus.FORBIDDEN,
                () -> fixture.policy.resolve(
                        actor(false), "merchant", null));

        assertEquals(0, fixture.jdbc.calls);
        assertEquals(0, fixture.auth.permissionCalls);
    }

    @Test
    void staleOwnerFlagDoesNotGrantMerchantAccess() {
        var fixture = new Fixture(false);

        assertStatus(
                HttpStatus.FORBIDDEN,
                () -> fixture.policy.resolve(
                        actor(true), "merchant", null));

        assertEquals(0, fixture.jdbc.calls);
    }

    @Test
    void invalidScopeIsRejected() {
        var fixture = new Fixture(true);

        for (String scope : new String[]{"", "all", "MERCHANT", "unknown"}) {
            assertStatus(
                    HttpStatus.BAD_REQUEST,
                    () -> fixture.policy.resolve(
                            actor(true), scope, null));
        }

        assertEquals(0, fixture.jdbc.calls);
    }

    @Test
    void merchantScopeMustNotIncludeCompanyId() {
        var fixture = new Fixture(true);

        assertStatus(
                HttpStatus.BAD_REQUEST,
                () -> fixture.policy.resolve(
                        actor(true), "merchant", COMPANY_ID));

        assertStatus(
                HttpStatus.BAD_REQUEST,
                () -> fixture.policy.resolve(
                        actor(true), "merchant", ""));

        assertEquals(0, fixture.jdbc.calls);
    }

    @Test
    void companyScopeRequiresCompanyId() {
        var fixture = new Fixture(false);

        assertStatus(
                HttpStatus.BAD_REQUEST,
                () -> fixture.policy.resolve(
                        actor(false), "company", null));

        assertStatus(
                HttpStatus.BAD_REQUEST,
                () -> fixture.policy.resolve(
                        actor(false), "company", "   "));

        assertEquals(0, fixture.jdbc.calls);
    }

    @Test
    void invalidCompanyUuidIsRejected() {
        var fixture = new Fixture(true);

        for (String companyId : new String[]{
                "not-a-uuid",
                "1-1-1-1-1",
                COMPANY_ID + " ",
                COMPANY_ID + "' OR 1=1"
        }) {
            assertStatus(
                    HttpStatus.BAD_REQUEST,
                    () -> fixture.policy.resolve(
                            actor(true), "company", companyId));
        }

        assertEquals(0, fixture.jdbc.calls);
    }

    @Test
    void ownerCanReadCompanyInMerchantWithoutEmployeeGrant() {
        var fixture = new Fixture(true);
        fixture.jdbc.companyExists = true;

        var scope = fixture.policy.resolve(
                actor(true), "company", COMPANY_ID);

        assertCompanyScope(scope);
        assertEquals(1, fixture.jdbc.calls);
        assertEquals(0, fixture.auth.permissionCalls);
    }

    @Test
    void ownerCannotReadCompanyOutsideMerchant() {
        var fixture = new Fixture(true);
        fixture.jdbc.companyExists = false;

        assertStatus(
                HttpStatus.FORBIDDEN,
                () -> fixture.policy.resolve(
                        actor(true), "company", COMPANY_ID));

        assertEquals(1, fixture.jdbc.calls);
        assertEquals(0, fixture.auth.permissionCalls);
    }

    @Test
    void employeeCannotReadUnavailableCompanyEvenWithGrant() {
        var fixture = new Fixture(false);
        fixture.jdbc.companyExists = false;
        fixture.auth.auditReadGranted = true;

        assertStatus(
                HttpStatus.FORBIDDEN,
                () -> fixture.policy.resolve(
                        actor(false), "company", COMPANY_ID));

        assertEquals(1, fixture.jdbc.calls);
        assertEquals(0, fixture.auth.permissionCalls);
    }

    @Test
    void employeeWithoutActiveMembershipIsRejectedEvenWithGrant() {
        var fixture = new Fixture(false);
        fixture.jdbc.activeMember = false;
        fixture.auth.auditReadGranted = true;

        assertStatus(
                HttpStatus.FORBIDDEN,
                () -> fixture.policy.resolve(
                        actor(false), "company", COMPANY_ID));

        assertEquals(2, fixture.jdbc.calls);
        assertEquals(0, fixture.auth.permissionCalls);
    }

    @Test
    void employeeWithoutAuditReadGrantIsRejected() {
        var fixture = new Fixture(false);
        fixture.auth.auditReadGranted = false;

        assertStatus(
                HttpStatus.FORBIDDEN,
                () -> fixture.policy.resolve(
                        actor(false), "company", COMPANY_ID));

        assertEquals(2, fixture.jdbc.calls);
        assertEquals(1, fixture.auth.permissionCalls);
    }

    @Test
    void authorizedEmployeeCanReadCompany() {
        var fixture = new Fixture(false);
        fixture.auth.auditReadGranted = true;

        var scope = fixture.policy.resolve(
                actor(false), "company", COMPANY_ID);

        assertCompanyScope(scope);
        assertEquals(2, fixture.jdbc.calls);
        assertEquals(1, fixture.auth.permissionCalls);
    }

    @Test
    void omittedScopeDefaultsToCompany() {
        var fixture = new Fixture(false);
        fixture.auth.auditReadGranted = true;

        var scope = fixture.policy.resolve(
                actor(false), null, COMPANY_ID);

        assertCompanyScope(scope);
        assertEquals(2, fixture.jdbc.calls);
        assertEquals(1, fixture.auth.permissionCalls);
    }

    @Test
    void uppercaseCompanyUuidIsNormalized() {
        var fixture = new Fixture(true);

        var scope = fixture.policy.resolve(
                actor(true),
                "company",
                COMPANY_ID.toUpperCase(java.util.Locale.ROOT));

        assertCompanyScope(scope);
        assertEquals(1, fixture.jdbc.calls);
    }

    private static SessionService.Actor actor(boolean owner) {
        return new SessionService.Actor(
                USER_ID,
                MERCHANT_ID,
                "active",
                owner,
                false,
                false);
    }

    private static void assertCompanyScope(
            AuditAccessPolicy.Scope scope) {

        assertEquals(MERCHANT_ID, scope.merchantId());
        assertEquals(COMPANY_ID, scope.companyId());
        assertFalse(scope.merchantWide());
    }

    private static void assertStatus(
            HttpStatus expected,
            org.junit.jupiter.api.function.Executable action) {

        var error = assertThrows(
                ResponseStatusException.class,
                action);

        assertEquals(expected, error.getStatusCode());
    }

    private static class Fixture {
        final FakeAuthRepository auth = new FakeAuthRepository();
        final FakeJdbcTemplate jdbc;
        final AuditAccessPolicy policy;

        Fixture(boolean owner) {
            auth.currentActor = actor(owner);
            jdbc = new FakeJdbcTemplate(owner);
            policy = new AuditAccessPolicy(auth, jdbc);
        }
    }

    private static class FakeAuthRepository extends AuthRepository {
        SessionService.Actor currentActor;
        boolean auditReadGranted;
        int permissionCalls;

        FakeAuthRepository() {
            super(null, null);
        }

        @Override
        public SessionService.Actor actor(
                String merchantId,
                String userId) {

            assertEquals(MERCHANT_ID, merchantId);
            assertEquals(USER_ID, userId);
            return currentActor;
        }

        @Override
        public boolean hasCompanyPermission(
                String merchantId,
                String companyId,
                String userId,
                String permission) {

            permissionCalls++;

            assertEquals(MERCHANT_ID, merchantId);
            assertEquals(COMPANY_ID, companyId);
            assertEquals(USER_ID, userId);
            assertEquals("audit.read", permission);

            return auditReadGranted;
        }
    }

    private static class FakeJdbcTemplate extends JdbcTemplate {
        final boolean owner;
        boolean companyExists = true;
        boolean activeMember = true;
        int calls;

        FakeJdbcTemplate(boolean owner) {
            this.owner = owner;
        }

        @Override
        public <T> T queryForObject(
                String sql,
                Class<T> requiredType,
                Object... args) {

            calls++;

            String normalized = sql.replaceAll("\\s+", " ").trim();

            assertEquals(Boolean.class, requiredType);
            assertTrue(normalized.contains("merchant_id = ?"));
            assertEquals(MERCHANT_ID, args[0]);
            assertEquals(COMPANY_ID, args[1]);

            if (normalized.contains("FROM companies")) {
                assertEquals(2, args.length);
                assertTrue(normalized.contains("id = ?"));

                if (owner) {
                    // Owner 查询历史公司不要求 active。
                    assertFalse(
                            normalized.contains("status = 'active'"));
                } else {
                    assertTrue(
                            normalized.contains("status = 'active'"));
                }

                return requiredType.cast(companyExists);
            }

            if (normalized.contains("FROM company_memberships")) {
                assertEquals(3, args.length);
                assertEquals(USER_ID, args[2]);

                assertTrue(normalized.contains("company_id = ?"));
                assertTrue(normalized.contains("user_id = ?"));
                assertTrue(normalized.contains("status = 'active'"));
                assertTrue(normalized.contains(
                        "joined_at <= UTC_TIMESTAMP(6)"));
                assertTrue(normalized.contains(
                        "ended_at IS NULL OR ended_at > UTC_TIMESTAMP(6)"));

                return requiredType.cast(activeMember);
            }

            throw new AssertionError(
                    "Unexpected SQL in permission test: " + sql);
        }
    }
}