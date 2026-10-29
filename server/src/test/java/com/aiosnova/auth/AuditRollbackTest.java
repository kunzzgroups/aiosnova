package com.aiosnova.auth;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(
        named = "AUDIT_DB_TEST",
        matches = "true")
class AuditRollbackTest {

    @Test
    void auditFailureRollsBackDepartmentChange() {
        var dataSource = new DriverManagerDataSource();
        dataSource.setUrl(required("AUDIT_TEST_DB_URL"));
        dataSource.setUsername(required("AUDIT_TEST_DB_USER"));
        dataSource.setPassword(required("AUDIT_TEST_DB_PASSWORD"));

        var jdbc = new JdbcTemplate(dataSource);
        var repository = new AuthRepository(jdbc, new ObjectMapper());
        var transaction = new TransactionTemplate(
                new DataSourceTransactionManager(dataSource));

        String merchantId = required("AUDIT_TEST_MERCHANT_ID");
        String companyId = required("AUDIT_TEST_COMPANY_ID");
        String actorId = required("AUDIT_TEST_ACTOR_ID");
        String departmentId = required("AUDIT_TEST_DEPARTMENT_ID");

        String selectName = """
                SELECT name
                FROM organization_departments
                WHERE merchant_id = ? AND company_id = ? AND id = ?
                """;

        String before = jdbc.queryForObject(
                selectName, String.class,
                merchantId, companyId, departmentId);

        String marker = "audit-test-" + UUID.randomUUID();
        String missingCompanyId = UUID.randomUUID().toString();

        assertEquals(0L, jdbc.queryForObject("""
                SELECT COUNT(*) FROM companies WHERE id = ?
                """, Long.class, missingCompanyId));

        assertThrows(DataIntegrityViolationException.class, () ->
                transaction.executeWithoutResult(status -> {
                    assertEquals(1, jdbc.update("""
                            UPDATE organization_departments
                            SET name = ?
                            WHERE merchant_id = ?
                              AND company_id = ?
                              AND id = ?
                            """,
                            marker, merchantId, companyId, departmentId));

                    assertEquals(marker, jdbc.queryForObject(
                            selectName, String.class,
                            merchantId, companyId, departmentId));

                    // 不存在的 Company 触发 audit 外键错误。
                    repository.auditCompany(
                            merchantId,
                            actorId,
                            missingCompanyId,
                            "test.audit.rollback",
                            "department",
                            departmentId,
                            Map.of("testMarker", marker));
                }));

        assertEquals(before, jdbc.queryForObject(
                selectName, String.class,
                merchantId, companyId, departmentId));

        assertEquals(0L, jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM audit_logs
                WHERE merchant_id = ?
                  AND action = 'test.audit.rollback'
                  AND resource_id = ?
                  AND JSON_UNQUOTE(
                      JSON_EXTRACT(changes, '$.testMarker')
                  ) = ?
                """, Long.class, merchantId, departmentId, marker));
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "Missing environment variable: " + name);
        }
        return value;
    }
}