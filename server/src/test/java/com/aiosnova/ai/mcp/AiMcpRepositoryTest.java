package com.aiosnova.ai.mcp;

import java.lang.reflect.Proxy;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import static org.junit.jupiter.api.Assertions.*;

class AiMcpRepositoryTest {

    private static final String SERVER_ID =
            "11111111-1111-4111-8111-111111111111";

    private static final class CapturingJdbc extends JdbcTemplate {

        String sql;
        List<Object> parameters;
        int calls;
        List<Map<String, Object>> rows = List.of();

        @Override
        public <T> List<T> query(
                String sql,
                RowMapper<T> mapper,
                Object... args) {

            calls++;
            this.sql = sql.replaceAll("\\s+", " ")
                    .trim().toLowerCase(Locale.ROOT);
            this.parameters = List.of(args);

            assertTrue(this.sql.startsWith("select "));
            assertFalse(this.sql.contains("secret_ciphertext"));
            assertFalse(this.sql.contains("select *"));
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
                AiMcpRepositoryTest.class.getClassLoader(),
                new Class<?>[]{ResultSet.class},
                (proxy, method, args) -> {
                    String methodName = method.getName();

                    if (!List.of(
                            "getString", "getBoolean", "getInt",
                            "getLong", "getObject").contains(methodName)) {
                        throw new AssertionError(
                                "Unexpected ResultSet method: " + methodName);
                    }

                    String column = (String) args[0];

                    if (!row.containsKey(column)) {
                        throw new AssertionError(
                                "Unexpected column: " + column);
                    }

                    Object value = row.get(column);

                    return switch (methodName) {
                        case "getString" -> (String) value;
                        case "getBoolean" -> (Boolean) value;
                        case "getInt" -> ((Number) value).intValue();
                        case "getLong" -> ((Number) value).longValue();
                        case "getObject" -> {
                            assertEquals(Long.class, args[1]);
                            yield value == null
                                    ? null
                                    : ((Number) value).longValue();
                        }
                        default -> throw new AssertionError(methodName);
                    };
                });
    }

    private static Map<String, Object> serverRow() {
        var row = new HashMap<String, Object>();

        row.put("id", SERVER_ID);
        row.put("company_id", "company-j1");
        row.put("merchant_id", "merchant-acme");
        row.put("name", "Local MCP");
        row.put("description", "Repository test");
        row.put("endpoint_url", "http://127.0.0.1:9090/mcp");
        row.put("transport", "streamable_http");
        row.put("protocol_version", "2025-11-25");
        row.put("auth_type", "none");
        row.put("enabled", true);
        row.put("timeout_seconds", 30);
        row.put("connection_revision", 3L);
        row.put("verification_status", "verified");
        row.put("verification_revision", 3L);
        row.put("version", 7L);

        return row;
    }

    private final CapturingJdbc jdbc = new CapturingJdbc();

    private final AiMcpRepository repository =
            new AiMcpRepository(jdbc);

    @Test
    void mapsServerFieldsAndNullableVerificationRevision() {
        jdbc.rows = List.of(serverRow());

        var actual = repository.findServers(
                "company-j1", "merchant-acme").getFirst();

        assertEquals(new AiMcpRepository.ServerRow(
                SERVER_ID,
                "company-j1",
                "merchant-acme",
                "Local MCP",
                "Repository test",
                "http://127.0.0.1:9090/mcp",
                "streamable_http",
                "2025-11-25",
                "none",
                true,
                30,
                3L,
                "verified",
                3L,
                7L), actual);

        var unverified = serverRow();
        unverified.put("enabled", false);
        unverified.put("verification_status", "not_verified");
        unverified.put("verification_revision", null);
        jdbc.rows = List.of(unverified);

        var detail = repository.findServer(
                "company-j1", "merchant-acme", SERVER_ID)
                .orElseThrow();

        assertFalse(detail.enabled());
        assertEquals("not_verified", detail.verificationStatus());
        assertNull(detail.verificationRevision());
    }

    @Test
    void returnsEmptyListAndMissingDetail() {
        assertTrue(repository.findServers(
                "company-j1", "merchant-acme").isEmpty());

        assertTrue(repository.findServer(
                "company-j1", "merchant-acme", SERVER_ID).isEmpty());
    }

    @Test
    void queriesAlwaysIncludeCompanyAndMerchantScope() {
        repository.findServers("company-j1", "merchant-acme");

        assertTrue(jdbc.sql.contains(
                "where company_id = ? and merchant_id = ?"));
        assertTrue(jdbc.sql.contains("order by name, id"));
        assertEquals(
                List.of("company-j1", "merchant-acme"),
                jdbc.parameters);

        repository.findServer(
                "company-j2", "merchant-other", SERVER_ID);

        assertTrue(jdbc.sql.contains(
                "where company_id = ? and merchant_id = ? and id = ?"));
        assertEquals(
                List.of("company-j2", "merchant-other", SERVER_ID),
                jdbc.parameters);

        // ID 通过参数传入，不能拼接到 SQL。
        assertFalse(jdbc.sql.contains(SERVER_ID));
        assertFalse(jdbc.sql.contains("company-j2"));
        assertFalse(jdbc.sql.contains("merchant-other"));
    }

    @Test
    void rejectsInvalidIdsBeforeQueryingJdbc() {
        String[] invalidIds = {
                null,
                "",
                " ",
                "company/j1",
                "company' OR '1'='1",
                "公司"
        };

        for (String invalid : invalidIds) {
            assertThrows(IllegalArgumentException.class,
                    () -> repository.findServers(
                            invalid, "merchant-acme"));

            assertThrows(IllegalArgumentException.class,
                    () -> repository.findServers(
                            "company-j1", invalid));

            assertThrows(IllegalArgumentException.class,
                    () -> repository.findServer(
                            "company-j1", "merchant-acme", invalid));
        }

        assertThrows(IllegalArgumentException.class,
                () -> repository.findServers(
                        "a".repeat(65), "merchant-acme"));

        assertThrows(IllegalArgumentException.class,
                () -> repository.findServers(
                        "company-j1", "a".repeat(65)));

        assertThrows(IllegalArgumentException.class,
                () -> repository.findServer(
                        "company-j1", "merchant-acme", "a".repeat(37)));

        assertEquals(0, jdbc.calls);
    }
}