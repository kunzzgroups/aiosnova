package com.aiosnova.ai.tool;

import java.lang.reflect.Proxy;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import static org.junit.jupiter.api.Assertions.*;

class AiToolRepositoryTest {

    private static final class CapturingJdbc extends JdbcTemplate {

        String sql;
        List<Object> parameters;
        List<Map<String, Object>> rows = List.of();

        @Override
        public <T> List<T> query(
                String sql,
                RowMapper<T> mapper,
                Object... args) {

            this.sql = sql.replaceAll("\\s+", " ")
                    .trim().toLowerCase(Locale.ROOT);
            this.parameters = List.of(args);

            assertTrue(this.sql.startsWith("select "));
            assertFalse(this.sql.contains(";"));
            assertFalse(this.sql.contains("for update"));

            var result = new ArrayList<T>();

            try {
                for (int i = 0; i < rows.size(); i++) {
                    result.add(mapper.mapRow(resultSet(rows.get(i)), i));
                }
            } catch (SQLException error) {
                throw new AssertionError(error);
            }

            return result;
        }
    }

    private static ResultSet resultSet(Map<String, Object> row) {
        return (ResultSet) Proxy.newProxyInstance(
                AiToolRepositoryTest.class.getClassLoader(),
                new Class<?>[]{ResultSet.class},
                (proxy, method, args) -> {
                    String name = method.getName();

                    if (!List.of(
                            "getString", "getInt",
                            "getBoolean", "getLong").contains(name)) {
                        throw new AssertionError(
                                "Unexpected ResultSet method: " + name);
                    }

                    String column = (String) args[0];

                    if (!row.containsKey(column)) {
                        throw new AssertionError(
                                "Unexpected column: " + column);
                    }

                    Object value = row.get(column);

                    return switch (name) {
                        case "getString" -> (String) value;
                        case "getInt" -> ((Number) value).intValue();
                        case "getBoolean" -> (Boolean) value;
                        case "getLong" -> ((Number) value).longValue();
                        default -> throw new AssertionError(name);
                    };
                });
    }

    private final CapturingJdbc jdbc = new CapturingJdbc();
    private final AiToolRepository repository =
            new AiToolRepository(jdbc);

    @Test
    void agentQueryUsesCompanyMerchantAndAgent() {
        jdbc.rows = List.of(Map.of(
                "company_id", "company-test",
                "merchant_id", "merchant-test",
                "id", "agent-test",
                "status", "active"));

        var agent = repository.findAgent(
                "company-test", "merchant-test", "agent-test")
                .orElseThrow();

        assertEquals(
                List.of("company-test", "merchant-test", "agent-test"),
                jdbc.parameters);

        assertTrue(jdbc.sql.contains("where company_id = ?"));
        assertTrue(jdbc.sql.contains("and merchant_id = ?"));
        assertTrue(jdbc.sql.contains("and id = ?"));

        assertEquals("company-test", agent.companyId());
        assertEquals("merchant-test", agent.merchantId());
        assertEquals("agent-test", agent.agentId());
        assertEquals("active", agent.status());
    }

    @Test
    void bindingQueryKeepsBothJoinsInCompanyScope() {
        jdbc.rows = List.of(Map.of("action", "calc.run"));

        assertEquals(
                List.of("calc.run"),
                repository.findBoundActions(
                        "company-test", "merchant-test", "agent-test"));

        assertEquals(
                List.of("company-test", "merchant-test", "agent-test"),
                jdbc.parameters);

        assertTrue(jdbc.sql.contains("a.company_id = b.company_id"));
        assertTrue(jdbc.sql.contains("a.id = b.agent_id"));
        assertTrue(jdbc.sql.contains("t.company_id = b.company_id"));
        assertTrue(jdbc.sql.contains("t.id = b.tool_id"));
        assertTrue(jdbc.sql.contains("where b.company_id = ?"));
        assertTrue(jdbc.sql.contains("and a.merchant_id = ?"));
        assertTrue(jdbc.sql.contains("and b.agent_id = ?"));
    }

    @Test
    void toolQueryMapsConfigurationAndChecksMerchantScope() {
        jdbc.rows = List.of(Map.ofEntries(
                Map.entry("id", "tool-test"),
                Map.entry("company_id", "company-test"),
                Map.entry("name", "Calculator"),
                Map.entry("description", "Test calculator"),
                Map.entry("module", "Utility"),
                Map.entry("action", "calc.run"),
                Map.entry("executor_type", "calculator"),
                Map.entry("risk", "low"),
                Map.entry("status", "active"),
                Map.entry("timeout_seconds", 30),
                Map.entry("requires_confirmation", false),
                Map.entry("configuration", "{}"),
                Map.entry("version", 7L)));

        var tool = repository.findTools(
                "company-test", "merchant-test").getFirst();

        assertEquals(
                List.of("company-test", "merchant-test"),
                jdbc.parameters);

        assertTrue(jdbc.sql.contains("where t.company_id = ?"));
        assertTrue(jdbc.sql.contains("and exists"));
        assertTrue(jdbc.sql.contains("a.company_id = t.company_id"));
        assertTrue(jdbc.sql.contains("and a.merchant_id = ?"));

        assertEquals("tool-test", tool.id());
        assertEquals("company-test", tool.companyId());
        assertEquals("Calculator", tool.name());
        assertEquals("Test calculator", tool.description());
        assertEquals("Utility", tool.module());
        assertEquals("calc.run", tool.action());
        assertEquals("calculator", tool.executorType());
        assertEquals("low", tool.risk());
        assertEquals("active", tool.status());
        assertEquals(30, tool.timeoutSeconds());
        assertFalse(tool.requiresConfirmation());
        assertEquals("{}", tool.configuration());
        assertEquals(7L, tool.version());
    }

    @Test
    void emptyQueriesDoNotInventAgentsOrBindings() {
        assertTrue(repository.findAgent(
                "company-test", "merchant-test", "agent-test").isEmpty());

        assertTrue(repository.findBoundActions(
                "company-test", "merchant-test", "agent-test").isEmpty());

        assertTrue(repository.findTools(
                "company-test", "merchant-test").isEmpty());
    }
}
