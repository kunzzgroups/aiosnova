package com.aiosnova.ai.model;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Proxy;
import java.sql.ResultSet;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

/** Exercises real repository mapping and SQL arguments without a database. */
class AiModelContextTest {
    private static class Database extends JdbcTemplate {
        final Map<String, Object> row = new HashMap<>();
        String sql;
        Object[] args;

        Database() {
            row.put("id", "config");
            row.put("company_id", "company-j1");
            row.put("provider_id", "provider");
            row.put("model_id", "test/model");
            row.put("name", "Test");
            row.put("model_type", "chat");
            row.put("status", "disabled");
            row.put("description", "");
            row.put("capability_chat", true);
            row.put("capability_vision", false);
            row.put("capability_tool_calling", true);
        }

        @Override
        public <T> List<T> query(String sql, RowMapper<T> mapper, Object... args) {
            assertTrue(sql.contains("catalog_context_window"));
            ResultSet result = (ResultSet) Proxy.newProxyInstance(
                    ResultSet.class.getClassLoader(), new Class<?>[]{ResultSet.class},
                    (proxy, method, values) -> switch (method.getName()) {
                        case "getObject", "getString" -> row.get((String) values[0]);
                        case "getBoolean" -> Boolean.TRUE.equals(row.get((String) values[0]));
                        case "getLong" -> 7L;
                        default -> throw new UnsupportedOperationException(method.getName());
                    });
            try {
                return List.of(mapper.mapRow(result, 0));
            } catch (java.sql.SQLException error) {
                throw new AssertionError(error);
            }
        }

        @Override
        public int update(String sql, Object... args) {
            this.sql = sql;
            this.args = args;
            assertEquals(sql.chars().filter(c -> c == '?').count(), args.length);
            return 1;
        }
    }

    @Test
    void separatesCatalogConfigurationAndEffectiveContext() {
        Database db = new Database();
        AiModelRepository repository = new AiModelRepository(db);
        Integer[][] cases = {
                {null, null, null}, {null, 1000, 1000},
                {128, null, 128}, {128, 1000, 128}, {128, 64, 64}
        };
        for (Integer[] values : cases) {
            db.row.put("context_window", values[0]);
            db.row.put("catalog_context_window", values[1]);
            var model = repository.findByProvider("company-j1", "provider").getFirst();
            assertEquals(values[0], model.configuredContextWindow());
            assertEquals(values[1], model.catalogContextWindow());
            assertEquals(values[2], model.contextWindow());
            assertEquals(values[1], model.capabilities().contextWindow());
            assertEquals(model, repository.findByExternalId("company-j1", "provider", "test/model").orElseThrow());
        }
        db.row.put("capability_chat", null);
        assertNull(repository.findByProvider("company-j1", "provider").getFirst().capabilities());
    }

    @Test
    void catalogWritesNeverOverwriteManualConfiguration() {
        Database db = new Database();
        AiModelRepository repository = new AiModelRepository(db);
        var entry = new OpenRouterModelService.CatalogModel("test/model", "Test", "",
                new ModelCapabilities(true, false, true, 1000), null);
        var now = LocalDateTime.of(2026, 10, 26, 0, 0);
        repository.insertFromCatalog("config", "company-j1", "provider", entry, now);
        assertTrue(db.sql.contains("catalog_context_window"));
        assertFalse(db.sql.matches("(?s).*\\bcontext_window\\b.*"));
        assertEquals(1000, db.args[7]);
        repository.updateCatalogCapabilities("company-j1", "provider", "config", entry, now, 7);
        assertTrue(db.sql.contains("catalog_context_window = ?"));
        assertFalse(db.sql.matches("(?s).*\\bcontext_window\\s*=.*"));
        assertFalse(db.sql.matches("(?s).*\\bstatus\\s*=.*"));
        assertEquals(1000, db.args[0]);
        assertArrayEquals(new Object[]{"company-j1", "provider", "config", "test/model", 7L},
                java.util.Arrays.copyOfRange(db.args, 6, 11));
        repository.updateCatalogCapabilities("company-j1", "provider", "config",
                new OpenRouterModelService.CatalogModel("test/model", "Test", "", null, "Unknown"), now, 7);
        assertNull(db.args[0]);
        assertEquals("Unknown", db.args[5]);
        repository.updateConfiguration("company-j1", "provider", "config", "Test", "chat", false, "", 128, 7);
        assertTrue(db.sql.contains("context_window = ?"));
        assertFalse(db.sql.contains("catalog_context_window"));
        assertEquals(128, db.args[4]);
        repository.insertManual("config", "company-j1", "provider", "test/model", "Test", "chat", "", 128);
        assertFalse(db.sql.contains("catalog_context_window"));
        assertEquals(128, db.args[7]);
    }
}
