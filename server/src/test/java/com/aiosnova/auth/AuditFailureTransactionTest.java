package com.aiosnova.auth;

import com.aiosnova.audit.AuditLogService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

import javax.sql.DataSource;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(
        named = "AUDIT_DB_TEST",
        matches = "true")
class AuditFailureTransactionTest {

    @Test
    void failureAuditSurvivesOuterRollbackWithUserLocked() {
        var dataSource = new DriverManagerDataSource();
        dataSource.setUrl(required("AUDIT_TEST_DB_URL"));
        dataSource.setUsername(required("AUDIT_TEST_DB_USER"));
        dataSource.setPassword(required("AUDIT_TEST_DB_PASSWORD"));

        var jdbc = new RecordingJdbcTemplate(dataSource);
        var repository = new AuthRepository(jdbc, new ObjectMapper());

        var transactionManager =
                new DataSourceTransactionManager(dataSource);

        // 创建真实事务代理，让 @Transactional 生效。
        var interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(transactionManager);
        interceptor.setTransactionAttributeSource(
                new AnnotationTransactionAttributeSource());
        interceptor.afterPropertiesSet();

        var factory = new ProxyFactory(
                new AuditLogService(repository));
        factory.setProxyTargetClass(true);
        factory.addAdvice(interceptor);

        var auditLog = (AuditLogService) factory.getProxy();

        String merchantId = required("AUDIT_TEST_MERCHANT_ID");
        String userId = required("AUDIT_TEST_ACTOR_ID");

        // 确认使用的是该 Merchant 下已有的测试账号。
        assertNotNull(repository.actor(merchantId, userId));

        String versionSql = "SELECT version FROM users WHERE id = ?";
        Long before = jdbc.queryForObject(
                versionSql, Long.class, userId);

        var outerTransaction =
                new TransactionTemplate(transactionManager);
        outerTransaction.setTimeout(15);

        try {
            outerTransaction.executeWithoutResult(status -> {
                // 模拟 OTP 验证流程持有用户行锁。
                repository.lockUser(userId);

                assertEquals(1, jdbc.update("""
                        UPDATE users
                        SET version = version + 1
                        WHERE id = ?
                        """, userId));

                auditLog.recordLoginFailure(
                        merchantId,
                        userId,
                        AuditLogService.LoginFailureReason.INVALID_OTP);

                // 只回滚外层事务。
                status.setRollbackOnly();
            });

            // 外层修改没有保存。
            assertEquals(before, jdbc.queryForObject(
                    versionSql, Long.class, userId));

            assertNotNull(jdbc.auditId);

            // 独立事务的失败日志仍然存在，操作人为空。
            assertEquals(1L, jdbc.queryForObject("""
                    SELECT COUNT(*)
                    FROM audit_logs
                    WHERE id = ?
                      AND merchant_id = ?
                      AND scope_kind = 'merchant'
                      AND company_id IS NULL
                      AND actor_user_id IS NULL
                      AND action = 'identity.session.login.failed'
                      AND resource_type = 'user'
                      AND resource_id = ?
                      AND result = 'failure'
                      AND JSON_UNQUOTE(
                          JSON_EXTRACT(changes, '$.reason')
                      ) = 'INVALID_OTP'
                    """,
                    Long.class,
                    jdbc.auditId,
                    merchantId,
                    userId));
        } finally {
            // 仅清理本次测试实际插入的那条记录。
            if (jdbc.auditId != null) {
                jdbc.update("""
                        DELETE FROM audit_logs
                        WHERE id = ?
                          AND merchant_id = ?
                          AND resource_id = ?
                          AND action = 'identity.session.login.failed'
                        """,
                        jdbc.auditId,
                        merchantId,
                        userId);
            }
        }
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "Missing environment variable: " + name);
        }
        return value;
    }

    private static class RecordingJdbcTemplate extends JdbcTemplate {
        String auditId;

        RecordingJdbcTemplate(DataSource dataSource) {
            super(dataSource);
        }

        @Override
        public int update(String sql, Object... args) {
            int updated = super.update(sql, args);

            if (sql.stripLeading().startsWith("INSERT INTO audit_logs")) {
                auditId = (String) args[0];
            }

            return updated;
        }
    }
}