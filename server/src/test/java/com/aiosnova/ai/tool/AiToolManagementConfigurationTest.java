package com.aiosnova.ai.tool;

import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.*;

/** Configuration-only checks: synthetic JDBC metadata, no database connections. */
class AiToolManagementConfigurationTest {

    private static final String LOCAL_URL =
            "jdbc:mysql://127.0.0.1:3307/aiosnova_ai_local";

    private static final class MetadataJdbc extends JdbcTemplate {
        private final String url;
        int callbacks;

        MetadataJdbc(String url) {
            this.url = url;
        }

        @Override
        public void afterPropertiesSet() {
            // This test supplies synthetic metadata and deliberately has no DataSource.
        }

        @Override
        public <T> T execute(ConnectionCallback<T> action) {
            callbacks++;
            var metadata = (DatabaseMetaData) Proxy.newProxyInstance(
                    getClass().getClassLoader(),
                    new Class<?>[]{DatabaseMetaData.class},
                    (proxy, method, args) -> {
                        if (method.getName().equals("getURL")) return url;
                        throw new AssertionError("Unexpected metadata operation: " + method.getName());
                    });

            var connection = (Connection) Proxy.newProxyInstance(
                    getClass().getClassLoader(),
                    new Class<?>[]{Connection.class},
                    (proxy, method, args) -> {
                        if (method.getName().equals("getMetaData")) return metadata;
                        throw new AssertionError("Unexpected JDBC operation: " + method.getName());
                    });

            try {
                return action.doInConnection(connection);
            } catch (SQLException error) {
                throw new AssertionError(error);
            }
        }
    }

    private AnnotationConfigApplicationContext context(
            String enabled, String address, String merchant, MetadataJdbc jdbc) {

        var context = new AnnotationConfigApplicationContext();
        Map<String, Object> properties = new HashMap<>();
        if (enabled != null) properties.put("ai.tools.management.enabled", enabled);
        properties.put("server.address", address);
        properties.put("ai.agents.merchant-id", merchant);
        context.getEnvironment().getPropertySources().addFirst(
                new MapPropertySource("tool-management-test", properties));
        if (jdbc != null) context.registerBean(JdbcTemplate.class, () -> jdbc);
        context.register(AiToolManagementConfiguration.class);
        return context;
    }

    private void assertExcluded(String enabled) {
        try (var context = context(enabled, "127.0.0.1", "merchant-test", null)) {
            context.refresh();
            assertTrue(context.getBeansOfType(AiToolRepository.class).isEmpty());
            assertTrue(context.getBeansOfType(AiToolReadService.class).isEmpty());
            assertTrue(context.getBeansOfType(AiToolWriteService.class).isEmpty());
            assertTrue(context.getBeansOfType(AiToolManagementController.class).isEmpty());
            assertTrue(context.getBeansOfType(JdbcTemplate.class).isEmpty());
        }
    }

    private void expectStartupFailure(
            AnnotationConfigApplicationContext context, String message) {
        Throwable error = assertThrows(RuntimeException.class, context::refresh);
        while (error.getCause() != null) error = error.getCause();
        assertTrue(error.getMessage().contains(message), error.toString());
    }

    @Test
    void disabledByDefaultWithoutDatabaseInitialization() {
        assertExcluded(null);
    }

    @Test
    void explicitFalseExcludesManagementBeans() {
        assertExcluded("false");
    }

    @Test
    void localOptInRegistersControllerServicesAndTransactionProxy() {
        var jdbc = new MetadataJdbc(LOCAL_URL + "?connectionTimeZone=UTC");
        try (var context = context("true", "127.0.0.1", "merchant-test", jdbc)) {
            context.refresh();
            assertNotNull(context.getBean(AiToolRepository.class));
            assertNotNull(context.getBean(AiToolReadService.class));
            assertNotNull(context.getBean(AiToolManagementController.class));
            assertTrue(AopUtils.isAopProxy(context.getBean(AiToolWriteService.class)));
            assertEquals(1, jdbc.callbacks);
        }
    }

    @Test
    void nonLoopbackBindingIsRejectedBeforeJdbcInspection() {
        var jdbc = new MetadataJdbc(LOCAL_URL);
        try (var context = context("true", "0.0.0.0", "merchant-test", jdbc)) {
            expectStartupFailure(context, "server.address=127.0.0.1");
            assertEquals(0, jdbc.callbacks);
        }
    }

    @Test
    void serverTunnelDatabaseIsRejected() {
        var jdbc = new MetadataJdbc("jdbc:mysql://127.0.0.1:13306/aiosnova");
        try (var context = context("true", "127.0.0.1", "merchant-test", jdbc)) {
            expectStartupFailure(context, "local AI database");
            assertEquals(1, jdbc.callbacks);
        }
    }

    @Test
    void databaseNamePrefixCannotBypassTargetCheck() {
        var jdbc = new MetadataJdbc(LOCAL_URL + "_other");
        try (var context = context("true", "127.0.0.1", "merchant-test", jdbc)) {
            expectStartupFailure(context, "local AI database");
        }
    }

    @Test
    void missingMerchantPreventsManagementStartup() {
        var jdbc = new MetadataJdbc(LOCAL_URL);
        try (var context = context("true", "127.0.0.1", "", jdbc)) {
            expectStartupFailure(context, "Merchant ID");
        }
    }
}
