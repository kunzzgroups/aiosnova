package com.aiosnova.ai.mcp;

import java.lang.reflect.Proxy;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import static org.junit.jupiter.api.Assertions.*;

class AiMcpCatalogRepositoryTest {

    private static final String COMPANY = "company-j1";
    private static final String MERCHANT = "merchant-acme";

    private static final String SERVER = "11111111-1111-4111-8111-111111111111";

    private static final String TOOL = "22222222-2222-4222-8222-222222222222";

    private static final String SCHEMA = "{\"type\":\"object\"}";

    private static final class CapturingJdbc extends JdbcTemplate {

        String sql;
        List<Object> parameters;
        int calls;
        int affectedRows = 1;

        List<Map<String, Object>> rows = List.of();

        private void capture(String sql, Object... args) {
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
            assertFalse(this.sql.contains(TOOL));

            // 目录同步不应删除或修改 Agent 绑定。
            assertFalse(this.sql.contains("ai_agent_mcp_tools"));
            assertFalse(this.sql.startsWith("delete "));
        }

        @Override
        public int update(String sql, Object... args) {
            capture(sql, args);
            return affectedRows;
        }

        @Override
        public <T> List<T> query(
                String sql,
                RowMapper<T> mapper,
                Object... args) {

            capture(sql, args);

            var result = new ArrayList<T>();

            try {
                for (int index = 0; index < rows.size(); index++) {
                    result.add(mapper.mapRow(
                            resultSet(rows.get(index)), index));
                }
            } catch (SQLException error) {
                throw new AssertionError(error);
            }

            return result;
        }
    }

    private static ResultSet resultSet(Map<String, Object> row) {
        return (ResultSet) Proxy.newProxyInstance(
                AiMcpCatalogRepositoryTest.class.getClassLoader(),
                new Class<?>[] { ResultSet.class },
                (proxy, method, args) -> {
                    String column = (String) args[0];

                    if (!row.containsKey(column)) {
                        throw new AssertionError(
                                "Unexpected column: " + column);
                    }

                    Object value = row.get(column);

                    return switch (method.getName()) {
                        case "getString" -> (String) value;
                        case "getBoolean" -> (Boolean) value;
                        case "getLong" -> ((Number) value).longValue();
                        default -> throw new AssertionError(
                                "Unexpected ResultSet method: "
                                        + method.getName());
                    };
                });
    }

    private final CapturingJdbc jdbc = new CapturingJdbc();

    private final AiMcpRepository repository = new AiMcpRepository(jdbc);

    private AiMcpRepository.CatalogToolWrite tool() {
        return new AiMcpRepository.CatalogToolWrite(
                TOOL,
                "calculator.add",
                "Add two numbers",
                SCHEMA,
                3L);
    }

    private void assertJoinedScope() {
        assertTrue(jdbc.sql.contains(
                "join ai_mcp_servers s "
                        + "on s.company_id = t.company_id "
                        + "and s.id = t.server_id"));

        assertTrue(jdbc.sql.contains(
                "where t.company_id = ? "
                        + "and s.merchant_id = ? "
                        + "and t.server_id = ?"));
    }

    @Test
    void mapsCatalogFieldsAndReturnsEmptyList() {
        jdbc.rows = List.of(Map.<String, Object>ofEntries(
                Map.entry("id", TOOL),
                Map.entry("company_id", COMPANY),
                Map.entry("server_id", SERVER),
                Map.entry("remote_name", "calculator.add"),
                Map.entry("description", "Add two numbers"),
                Map.entry("input_schema", SCHEMA),
                Map.entry("enabled", true),
                Map.entry("available", false),
                Map.entry("discovered_connection_revision", 3L),
                Map.entry("version", 8L)));

        var rows = repository.findCatalogForUpdate(
                COMPANY, MERCHANT, SERVER);

        assertEquals(
                List.of(new AiMcpRepository.CatalogToolRow(
                        TOOL,
                        COMPANY,
                        SERVER,
                        "calculator.add",
                        "Add two numbers",
                        SCHEMA,
                        true,
                        false,
                        3L,
                        8L)),
                rows);

        assertJoinedScope();

        assertTrue(jdbc.sql.endsWith(
                "order by t.id for update"));

        assertEquals(
                List.of(COMPANY, MERCHANT, SERVER),
                jdbc.parameters);

        jdbc.rows = List.of();

        assertTrue(repository.findCatalogForUpdate(
                COMPANY, MERCHANT, SERVER).isEmpty());
    }

    @Test
    void insertDefaultsToDisabledAndChecksServerConnectionRevision() {
        assertEquals(1, repository.insertCatalogTool(
                COMPANY, MERCHANT, SERVER, tool()));

        assertTrue(jdbc.sql.startsWith(
                "insert into ai_mcp_tools ("));

        assertTrue(jdbc.sql.contains(
                "input_schema, enabled, available, "
                        + "discovered_connection_revision, "
                        + "discovered_at, version"));

        assertTrue(jdbc.sql.contains(
                "select ?, s.company_id, s.id, ?, ?, ?, "
                        + "0, 1, ?, utc_timestamp(6), 0"));

        assertTrue(jdbc.sql.endsWith(
                "where s.company_id = ? "
                        + "and s.merchant_id = ? "
                        + "and s.id = ? "
                        + "and s.connection_revision = ?"));

        assertEquals(
                List.of(
                        TOOL,
                        "calculator.add",
                        "Add two numbers",
                        SCHEMA,
                        3L,
                        COMPANY,
                        MERCHANT,
                        SERVER,
                        3L),
                jdbc.parameters);
    }

    @Test
    void updatePreservesIdentityAndConditionallyDisablesTool() {
        for (boolean disable : new boolean[] { false, true }) {
            assertEquals(1, repository.updateCatalogTool(
                    COMPANY, MERCHANT, SERVER, 8L, tool(), disable));

            assertJoinedScope();

            assertTrue(jdbc.sql.contains(
                    "set t.description = ?, t.input_schema = ?"));

            assertTrue(jdbc.sql.contains(
                    "t.enabled = case when ? then 0 else t.enabled end"));

            assertTrue(jdbc.sql.contains("t.available = 1"));
            assertTrue(jdbc.sql.contains(
                    "t.discovered_connection_revision = ?"));
            assertTrue(jdbc.sql.contains(
                    "t.discovered_at = utc_timestamp(6)"));
            assertTrue(jdbc.sql.contains(
                    "t.version = t.version + 1"));

            assertTrue(jdbc.sql.endsWith(
                    "and t.id = ? "
                            + "and t.remote_name = ? "
                            + "and t.version = ? "
                            + "and s.connection_revision = ?"));

            // 更新已有记录，不改 ID 或远程名称。
            String setClause = jdbc.sql.substring(
                    jdbc.sql.indexOf(" set "),
                    jdbc.sql.indexOf(" where "));

            assertFalse(setClause.contains("t.id ="));
            assertFalse(setClause.contains("t.remote_name ="));

            assertEquals(
                    List.of(
                            "Add two numbers",
                            SCHEMA,
                            disable,
                            3L,
                            COMPANY,
                            MERCHANT,
                            SERVER,
                            TOOL,
                            "calculator.add",
                            8L,
                            3L),
                    jdbc.parameters);
        }
    }

    @Test
    void missingToolIsMarkedUnavailableAndDisabledWithoutDeleting() {
        assertEquals(1, repository.markCatalogToolUnavailable(
                COMPANY, MERCHANT, SERVER, TOOL, 8L));

        assertJoinedScope();

        assertTrue(jdbc.sql.contains(
                "set t.available = 0, "
                        + "t.enabled = 0, "
                        + "t.version = t.version + 1"));

        assertTrue(jdbc.sql.endsWith(
                "and t.id = ? and t.version = ?"));

        assertEquals(
                List.of(COMPANY, MERCHANT, SERVER, TOOL, 8L),
                jdbc.parameters);
    }

    @Test
    void completionRequiresCurrentVersionRevisionAndVerification() {
        assertEquals(1, repository.completeCatalogDiscovery(
                COMPANY, MERCHANT, SERVER, 12L, 3L));

        assertTrue(jdbc.sql.startsWith(
                "update ai_mcp_servers set "
                        + "discovery_checked_at = utc_timestamp(6)"));

        assertTrue(jdbc.sql.contains("discovery_error_code = null"));
        assertTrue(jdbc.sql.contains("discovery_error_message = null"));
        assertTrue(jdbc.sql.contains("version = version + 1"));

        assertTrue(jdbc.sql.endsWith(
                "where company_id = ? "
                        + "and merchant_id = ? "
                        + "and id = ? "
                        + "and version = ? "
                        + "and connection_revision = ? "
                        + "and verification_status = 'verified' "
                        + "and verification_revision = connection_revision"));

        assertEquals(
                List.of(COMPANY, MERCHANT, SERVER, 12L, 3L),
                jdbc.parameters);
    }

    @Test
    void zeroAffectedRowsAreReturnedForServiceToReject() {
        jdbc.affectedRows = 0;

        assertEquals(0, repository.insertCatalogTool(
                COMPANY, MERCHANT, SERVER, tool()));

        assertEquals(0, repository.updateCatalogTool(
                COMPANY, MERCHANT, SERVER, 8L, tool(), false));

        assertEquals(0, repository.markCatalogToolUnavailable(
                COMPANY, MERCHANT, SERVER, TOOL, 8L));

        assertEquals(0, repository.completeCatalogDiscovery(
                COMPANY, MERCHANT, SERVER, 12L, 3L));

        assertEquals(4, jdbc.calls);
    }

    @Test
    void invalidScopeIdsAndVersionsNeverReachJdbc() {
        for (String invalid : new String[] {
                null, "", " ", "bad/id", "bad' OR '1'='1", "公司" }) {

            assertInvalidScope(invalid, MERCHANT, SERVER);
            assertInvalidScope(COMPANY, invalid, SERVER);
            assertInvalidScope(COMPANY, MERCHANT, invalid);
        }

        assertInvalidScope("a".repeat(65), MERCHANT, SERVER);
        assertInvalidScope(COMPANY, "a".repeat(65), SERVER);
        assertInvalidScope(COMPANY, MERCHANT, "a".repeat(37));

        var invalidTool = new AiMcpRepository.CatalogToolWrite(
                "bad/tool", "test", "", SCHEMA, 3L);

        assertThrows(IllegalArgumentException.class,
                () -> repository.insertCatalogTool(
                        COMPANY, MERCHANT, SERVER, invalidTool));

        assertThrows(IllegalArgumentException.class,
                () -> repository.updateCatalogTool(
                        COMPANY, MERCHANT, SERVER, 0L, invalidTool, false));

        var invalidRevision = new AiMcpRepository.CatalogToolWrite(
                TOOL, "test", "", SCHEMA, -1L);

        assertThrows(IllegalArgumentException.class,
                () -> repository.insertCatalogTool(
                        COMPANY, MERCHANT, SERVER, invalidRevision));

        assertThrows(IllegalArgumentException.class,
                () -> repository.updateCatalogTool(
                        COMPANY, MERCHANT, SERVER, 0L, invalidRevision, false));

        assertThrows(IllegalArgumentException.class,
                () -> repository.updateCatalogTool(
                        COMPANY, MERCHANT, SERVER, -1L, tool(), false));

        assertThrows(IllegalArgumentException.class,
                () -> repository.markCatalogToolUnavailable(
                        COMPANY, MERCHANT, SERVER, "bad/tool", 0L));

        assertThrows(IllegalArgumentException.class,
                () -> repository.markCatalogToolUnavailable(
                        COMPANY, MERCHANT, SERVER, TOOL, -1L));

        assertThrows(IllegalArgumentException.class,
                () -> repository.completeCatalogDiscovery(
                        COMPANY, MERCHANT, SERVER, -1L, 3L));

        assertThrows(IllegalArgumentException.class,
                () -> repository.completeCatalogDiscovery(
                        COMPANY, MERCHANT, SERVER, 12L, -1L));

        assertEquals(0, jdbc.calls);
    }

    private void assertInvalidScope(
            String company,
            String merchant,
            String server) {

        assertThrows(IllegalArgumentException.class,
                () -> repository.findCatalogForUpdate(
                        company, merchant, server));

        assertThrows(IllegalArgumentException.class,
                () -> repository.insertCatalogTool(
                        company, merchant, server, tool()));

        assertThrows(IllegalArgumentException.class,
                () -> repository.updateCatalogTool(
                        company, merchant, server, 8L, tool(), false));

        assertThrows(IllegalArgumentException.class,
                () -> repository.markCatalogToolUnavailable(
                        company, merchant, server, TOOL, 8L));

        assertThrows(IllegalArgumentException.class,
                () -> repository.completeCatalogDiscovery(
                        company, merchant, server, 12L, 3L));
    }

    @Test
    void readOnlyCatalogUsesScopeWithoutRowLock() {
        var result = repository.findCatalog(
                COMPANY, MERCHANT, SERVER);

        assertTrue(result.isEmpty());

        assertTrue(jdbc.sql.startsWith("select "));
        assertJoinedScope();

        assertTrue(jdbc.sql.endsWith(
                "order by t.remote_name, t.id"));

        assertFalse(jdbc.sql.contains("for update"));

        assertEquals(
                List.of(COMPANY, MERCHANT, SERVER),
                jdbc.parameters);
    }
}