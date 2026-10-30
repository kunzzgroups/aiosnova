package com.aiosnova.ai.mcp;

import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;
import java.util.Base64;
import com.aiosnova.ai.provider.AiApiKeyCrypto;
import org.springframework.aop.support.AopUtils;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class AiMcpManagementConfigurationTest {

    private static final String LOCAL_URL = "jdbc:mysql://127.0.0.1:3307/aiosnova_ai_local";

    static final class MetadataJdbc extends JdbcTemplate {

        private final String url;
        int callbacks;
        int writes;

        MetadataJdbc(String url) {
            this.url = url;
        }

        @Override
        public void afterPropertiesSet() {
            // 模拟 JDBC，无 DataSource，不建立真实连接。
        }

        @Override
        public <T> T execute(ConnectionCallback<T> action) {
            callbacks++;

            var metadata = (DatabaseMetaData) Proxy.newProxyInstance(
                    getClass().getClassLoader(),
                    new Class<?>[] { DatabaseMetaData.class },
                    (proxy, method, args) -> {
                        if ("getURL".equals(method.getName())) {
                            return url;
                        }

                        throw new AssertionError(
                                "Unexpected metadata operation: "
                                        + method.getName());
                    });

            var connection = (Connection) Proxy.newProxyInstance(
                    getClass().getClassLoader(),
                    new Class<?>[] { Connection.class },
                    (proxy, method, args) -> {
                        if ("getMetaData".equals(method.getName())) {
                            return metadata;
                        }

                        throw new AssertionError(
                                "Unexpected JDBC operation: "
                                        + method.getName());
                    });

            try {
                return action.doInConnection(connection);
            } catch (SQLException error) {
                throw new AssertionError(error);
            }
        }

        @Override
        public int update(String sql, Object... args) {
            assertTrue(sql.stripLeading().startsWith(
                    "INSERT INTO ai_mcp_servers"));

            writes++;
            return 1;
        }
    }

    private AnnotationConfigApplicationContext context(
            String enabled,
            String address,
            String merchant,
            MetadataJdbc jdbc) {

        return context(enabled, address, merchant, jdbc, true);
    }

    private AnnotationConfigApplicationContext context(
            String enabled,
            String address,
            String merchant,
            MetadataJdbc jdbc,
            boolean includeCrypto) {

        var context = new AnnotationConfigApplicationContext();

        context.getEnvironment().setActiveProfiles("ai-standalone");

        Map<String, Object> properties = new HashMap<>();

        if (enabled != null) {
            properties.put("ai.mcp.management.enabled", enabled);
        }

        properties.put("server.address", address);

        if (merchant != null) {
            properties.put("ai.agents.merchant-id", merchant);
        }

        context.getEnvironment().getPropertySources().addFirst(
                new MapPropertySource("mcp-management-test", properties));

        if (jdbc != null) {
            context.registerBean(JdbcTemplate.class, () -> jdbc);
        }

        if (includeCrypto) {
            context.registerBean(
                    AiApiKeyCrypto.class,
                    () -> new AiApiKeyCrypto(
                            Base64.getEncoder().encodeToString(new byte[32])));
        }

        context.registerBean("mcpTestTransactions", PlatformTransactionManager.class,
                CountingTransactions::new);
        context.register(AiMcpManagementConfiguration.class);

        return context;
    }

    private void assertNoMcpBeans(
            AnnotationConfigApplicationContext context) {
        assertTrue(context.getBeansOfType(AiMcpVerificationService.class).isEmpty());
        assertTrue(context.getBeansOfType(AiMcpDiscoverySyncService.class).isEmpty());
        assertTrue(context.getBeansOfType(AiMcpCatalogSyncService.class).isEmpty());
        assertTrue(context.getBeansOfType(AiMcpWriteService.class).isEmpty());

        assertTrue(context.getBeansOfType(
                AiMcpRepository.class).isEmpty());

        assertTrue(context.getBeansOfType(
                AiMcpReadService.class).isEmpty());

        assertTrue(context.getBeansOfType(
                AiMcpManagementController.class).isEmpty());
    }

    private void expectFailure(
            AnnotationConfigApplicationContext context,
            String expectedMessage) {

        Throwable error = assertThrows(
                RuntimeException.class,
                context::refresh);

        while (error.getCause() != null) {
            error = error.getCause();
        }

        assertNotNull(error.getMessage());
        assertTrue(
                error.getMessage().contains(expectedMessage),
                error.toString());
    }

    private static final class CountingTransactions
            extends AbstractPlatformTransactionManager {

        int commits;
        int rollbacks;

        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(
                Object transaction,
                TransactionDefinition definition) {
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            commits++;
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            rollbacks++;
        }
    }

    private void writableCompanies(
            AnnotationConfigApplicationContext context,
            String companies) {

        context.getEnvironment().getPropertySources().addFirst(
                new MapPropertySource(
                        "mcp-write-scope-test",
                        Map.<String, Object>of(
                                "ai.mcp.management.writable-companies",
                                companies)));
    }

    private AiMcpWriteService.SaveRequest createRequest(String company) {
        return new AiMcpWriteService.SaveRequest(
                company,
                "Configuration test MCP",
                "Simulated configuration test",
                "http://127.0.0.1:9090/mcp",
                "none",
                null,
                30);
    }

    private void expectForbidden(Runnable action) {
        var error = assertThrows(
                ResponseStatusException.class,
                action::run);

        assertEquals(403, error.getStatusCode().value());
    }

    @Test
    void configuredCompaniesAreTrimmedAndAppliedToWrites() {
        var jdbc = new MetadataJdbc(LOCAL_URL);
        var transactions = new CountingTransactions();

        try (var context = context(
                "true", "127.0.0.1", "merchant-test", jdbc)) {

            writableCompanies(
                    context,
                    " company-j1, company-j2,company-j1, ");

            context.removeBeanDefinition("mcpTestTransactions");
            context.registerBean(
                    PlatformTransactionManager.class,
                    () -> transactions);

            context.refresh();

            var writes = context.getBean(AiMcpWriteService.class);

            writes.create(createRequest("company-j1"));
            writes.create(createRequest("company-j2"));

            expectForbidden(
                    () -> writes.create(createRequest("company-other")));

            assertEquals(2, jdbc.writes);
            assertEquals(2, transactions.commits);
            assertEquals(1, transactions.rollbacks);
        }
    }

    @Test
    void absentOrBlankCompanyListDeniesAllWrites() {
        // null 表示不设置属性，使用配置类中的默认空字符串。
        String[] values = { null, "", " , , " };

        for (String companies : values) {
            var jdbc = new MetadataJdbc(LOCAL_URL);
            var transactions = new CountingTransactions();

            try (var context = context(
                    "true", "127.0.0.1", "merchant-test", jdbc)) {

                if (companies != null) {
                    writableCompanies(context, companies);
                }

                context.removeBeanDefinition("mcpTestTransactions");
                context.registerBean(
                        PlatformTransactionManager.class,
                        () -> transactions);

                context.refresh();

                expectForbidden(() -> context.getBean(AiMcpWriteService.class)
                        .create(createRequest("company-j1")));

                assertEquals(0, jdbc.writes);
                assertEquals(0, transactions.commits);
                assertEquals(1, transactions.rollbacks);
            }
        }
    }

    @Test
    void invalidCompanyInConfiguredListPreventsStartup() {
        var jdbc = new MetadataJdbc(LOCAL_URL);

        try (var context = context(
                "true", "127.0.0.1", "merchant-test", jdbc)) {

            writableCompanies(context, "company-j1,bad/company");

            expectFailure(context, "company scope");

            assertEquals(0, jdbc.writes);
        }
    }

    @Test
    void missingCryptoDependencyPreventsStartup() {
        var jdbc = new MetadataJdbc(LOCAL_URL);

        try (var context = context(
                "true", "127.0.0.1", "merchant-test", jdbc, false)) {

            expectFailure(context, "AiApiKeyCrypto");

            assertEquals(0, jdbc.writes);
        }
    }

    @Test
    void missingTransactionManagerPreventsStartup() {
        var jdbc = new MetadataJdbc(LOCAL_URL);

        try (var context = context(
                "true", "127.0.0.1", "merchant-test", jdbc)) {

            context.removeBeanDefinition("mcpTestTransactions");
            expectFailure(context, "PlatformTransactionManager");

            assertEquals(0, jdbc.writes);
        }
    }

    @Test
    void disabledByDefaultWithoutJdbc() {
        try (var context = context(
                null, "127.0.0.1", "merchant-test", null)) {

            context.refresh();

            assertNoMcpBeans(context);
            assertTrue(context.getBeansOfType(
                    JdbcTemplate.class).isEmpty());
        }
    }

    @Test
    void explicitFalseDoesNotInspectJdbc() {
        var jdbc = new MetadataJdbc(LOCAL_URL);

        try (var context = context(
                "false", "127.0.0.1", "merchant-test", jdbc)) {

            context.refresh();

            assertNoMcpBeans(context);
            assertEquals(0, jdbc.callbacks);
        }
    }

    @Test
    void enabledLocalConfigurationRegistersExpectedBeans() {
        var jdbc = new MetadataJdbc(
                LOCAL_URL + "?connectionTimeZone=UTC");

        try (var context = context(
                "true", "127.0.0.1", "merchant-test", jdbc)) {

            context.refresh();
            assertTrue(AopUtils.isAopProxy(context.getBean(AiMcpWriteService.class)));
            assertNotNull(context.getBean(AiMcpVerificationService.class));
            assertNotNull(context.getBean(AiMcpDiscoverySyncService.class));
            assertTrue(AopUtils.isAopProxy(context.getBean(AiMcpCatalogSyncService.class)));

            assertEquals(1, context.getBeansOfType(
                    AiMcpRepository.class).size());

            assertEquals(1, context.getBeansOfType(
                    AiMcpReadService.class).size());

            assertEquals(1, context.getBeansOfType(
                    AiMcpManagementController.class).size());

            assertEquals(1, jdbc.callbacks);
        }
    }

    @Test
    void nonLocalAddressFailsBeforeJdbcInspection() {
        var jdbc = new MetadataJdbc(LOCAL_URL);

        try (var context = context(
                "true", "0.0.0.0", "merchant-test", jdbc)) {

            expectFailure(context, "server.address=127.0.0.1");

            assertEquals(0, jdbc.callbacks);
        }
    }

    @Test
    void rejectsOtherDatabaseTargets() {
        String[] invalidUrls = {
                "jdbc:mysql://127.0.0.1:13306/aiosnova",
                "jdbc:mysql://db.example:3307/aiosnova_ai_local",
                LOCAL_URL + "_other",
                null
        };

        for (String url : invalidUrls) {
            var jdbc = new MetadataJdbc(url);

            try (var context = context(
                    "true", "127.0.0.1", "merchant-test", jdbc)) {

                expectFailure(context, "local AI database");

                assertEquals(1, jdbc.callbacks);
            }
        }
    }

    @Test
    void missingJdbcDependencyPreventsStartup() {
        try (var context = context(
                "true", "127.0.0.1", "merchant-test", null)) {

            expectFailure(context, "JdbcTemplate");
        }
    }

    @Test
    void missingOrInvalidMerchantPreventsStartup() {
        String[] invalidMerchants = {
                null,
                "",
                " ",
                "merchant/invalid",
                "a".repeat(65)
        };

        for (String merchant : invalidMerchants) {
            var jdbc = new MetadataJdbc(LOCAL_URL);

            try (var context = context(
                    "true", "127.0.0.1", merchant, jdbc)) {

                expectFailure(context, "Merchant ID");
            }
        }
    }

    @Test
    void otherProfileDoesNotRegisterMcpBeans() {
        var jdbc = new MetadataJdbc(LOCAL_URL);

        try (var context = context(
                "true", "127.0.0.1", "merchant-test", jdbc)) {

            context.getEnvironment().setActiveProfiles("test");
            context.refresh();

            assertNoMcpBeans(context);
            assertEquals(0, jdbc.callbacks);
        }
    }
}
