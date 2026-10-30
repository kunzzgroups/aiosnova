package com.aiosnova.ai.mcp;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.*;

class AiMcpRepositoryWriteTest {

    private static final String COMPANY = "company-j1";
    private static final String MERCHANT = "merchant-acme";
    private static final String SERVER =
            "11111111-1111-4111-8111-111111111111";

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

            // 参数允许包含 null，不能使用 List.of(args)。
            this.parameters = Arrays.asList(args.clone());

            long placeholders = sql.chars()
                    .filter(character -> character == '?')
                    .count();

            assertEquals((long) args.length, placeholders);

            // 数据必须通过参数传递。
            assertFalse(this.sql.contains(COMPANY));
            assertFalse(this.sql.contains(MERCHANT));
            assertFalse(this.sql.contains(SERVER));
            assertFalse(this.sql.contains("mock-ciphertext"));

            return affectedRows;
        }
    }

    private final CapturingJdbc jdbc = new CapturingJdbc();

    private final AiMcpRepository repository =
            new AiMcpRepository(jdbc);

    private AiMcpRepository.ServerEdit edit(
            boolean connectionChanged,
            boolean replaceSecret,
            String ciphertext) {

        return new AiMcpRepository.ServerEdit(
                "Renamed MCP",
                "Edited description",
                "https://mcp.example.test/mcp",
                "api_key",
                ciphertext,
                replaceSecret,
                60,
                connectionChanged);
    }

    private void assertUpdateSql() {
        assertTrue(jdbc.sql.startsWith(
                "update ai_mcp_servers set name = ?"));

        assertTrue(jdbc.sql.contains(
                "secret_ciphertext = case when ? then ? "
                        + "else secret_ciphertext end"));

        assertTrue(jdbc.sql.contains(
                "verification_status = case when ? then 'not_verified' "
                        + "else verification_status end"));

        String[] nullableFields = {
                "verification_revision",
                "verification_checked_at",
                "verification_error_code",
                "verification_error_message",
                "discovery_checked_at",
                "discovery_error_code",
                "discovery_error_message"
        };

        for (String field : nullableFields) {
            assertTrue(
                    jdbc.sql.contains(
                            field + " = case when ? then null else "
                                    + field + " end"),
                    "Missing conditional reset: " + field);
        }

        assertTrue(jdbc.sql.contains(
                "connection_revision = connection_revision + ?"));

        assertTrue(jdbc.sql.contains("version = version + 1"));

        assertTrue(jdbc.sql.endsWith(
                "where company_id = ? and merchant_id = ? "
                        + "and id = ? and version = ?"));

        // 普通编辑不负责启停，也不修改 Tools 或 Agent 绑定。
        assertFalse(jdbc.sql.contains("enabled ="));
        assertFalse(jdbc.sql.contains("ai_mcp_tools"));
        assertFalse(jdbc.sql.contains("ai_agent_mcp_tools"));
    }

    @Test
    void insertUsesScopedParametersAndSafeInitialState() {
        int result = repository.insertServer(
                new AiMcpRepository.NewServer(
                        SERVER,
                        COMPANY,
                        MERCHANT,
                        "Local MCP",
                        "Description",
                        "https://mcp.example.test/mcp",
                        "api_key",
                        "mock-ciphertext",
                        30));

        assertEquals(1, result);

        assertEquals(
                "insert into ai_mcp_servers ( "
                        + "id, company_id, merchant_id, name, description, "
                        + "endpoint_url, transport, protocol_version, "
                        + "auth_type, secret_ciphertext, enabled, "
                        + "timeout_seconds, connection_revision, "
                        + "verification_status, version "
                        + ") values ( "
                        + "?, ?, ?, ?, ?, ?, "
                        + "'streamable_http', '2025-11-25', "
                        + "?, ?, 0, ?, 0, 'not_verified', 0 )",
                jdbc.sql);

        assertEquals(
                List.of(
                        SERVER,
                        COMPANY,
                        MERCHANT,
                        "Local MCP",
                        "Description",
                        "https://mcp.example.test/mcp",
                        "api_key",
                        "mock-ciphertext",
                        30),
                jdbc.parameters);

        assertEquals(1, jdbc.calls);
    }

    @Test
    void connectionChangeResetsVerificationAndDiscoveryFields() {
        int result = repository.updateServer(
                COMPANY,
                MERCHANT,
                SERVER,
                7L,
                edit(true, true, "mock-ciphertext"));

        assertEquals(1, result);

        assertUpdateSql();

        assertEquals(
                List.of(
                        "Renamed MCP",
                        "Edited description",
                        "https://mcp.example.test/mcp",
                        "api_key",
                        true,
                        "mock-ciphertext",
                        60,
                        true, true, true, true,
                        true, true, true, true,
                        1,
                        COMPANY,
                        MERCHANT,
                        SERVER,
                        7L),
                jdbc.parameters);
    }

    @Test
    void metadataEditPreservesSecretVerificationAndDiscovery() {
        repository.updateServer(
                COMPANY,
                MERCHANT,
                SERVER,
                8L,
                edit(false, false, null));

        assertUpdateSql();

        assertEquals(
                Arrays.asList(
                        "Renamed MCP",
                        "Edited description",
                        "https://mcp.example.test/mcp",
                        "api_key",
                        false,
                        null,
                        60,
                        false, false, false, false,
                        false, false, false, false,
                        0,
                        COMPANY,
                        MERCHANT,
                        SERVER,
                        8L),
                jdbc.parameters);
    }

    @Test
    void switchingToNoneClearsSecretAndReturnsConditionalUpdateCount() {
        jdbc.affectedRows = 0;

        int result = repository.updateServer(
                COMPANY,
                MERCHANT,
                SERVER,
                9L,
                new AiMcpRepository.ServerEdit(
                        "No auth MCP",
                        "Description",
                        "https://mcp.example.test/mcp",
                        "none",
                        null,
                        true,
                        30,
                        true));

        assertUpdateSql();

        assertEquals("none", jdbc.parameters.get(3));
        assertEquals(true, jdbc.parameters.get(4));
        assertNull(jdbc.parameters.get(5));

        assertEquals(
                List.of(COMPANY, MERCHANT, SERVER, 9L),
                jdbc.parameters.subList(16, 20));

        // Repository 返回 0，由 Service 转成 409。
        assertEquals(0, result);
    }

    @Test
    void invalidScopeIdsAndVersionAreRejectedBeforeJdbc() {
        String[] invalidIds = {
                null,
                "",
                " ",
                "bad/id",
                "bad' OR '1'='1",
                "公司"
        };

        var input = edit(false, false, null);

        for (String invalid : invalidIds) {
            assertThrows(IllegalArgumentException.class,
                    () -> repository.updateServer(
                            invalid, MERCHANT, SERVER, 0L, input));

            assertThrows(IllegalArgumentException.class,
                    () -> repository.updateServer(
                            COMPANY, invalid, SERVER, 0L, input));

            assertThrows(IllegalArgumentException.class,
                    () -> repository.updateServer(
                            COMPANY, MERCHANT, invalid, 0L, input));

            assertThrows(IllegalArgumentException.class,
                    () -> repository.insertServer(
                            new AiMcpRepository.NewServer(
                                    SERVER, invalid, MERCHANT,
                                    "MCP", "", "https://example.test/mcp",
                                    "none", null, 30)));

            assertThrows(IllegalArgumentException.class,
                    () -> repository.insertServer(
                            new AiMcpRepository.NewServer(
                                    SERVER, COMPANY, invalid,
                                    "MCP", "", "https://example.test/mcp",
                                    "none", null, 30)));

            assertThrows(IllegalArgumentException.class,
                    () -> repository.insertServer(
                            new AiMcpRepository.NewServer(
                                    invalid, COMPANY, MERCHANT,
                                    "MCP", "", "https://example.test/mcp",
                                    "none", null, 30)));
        }

        assertThrows(IllegalArgumentException.class,
                () -> repository.updateServer(
                        "a".repeat(65), MERCHANT, SERVER, 0L, input));

        assertThrows(IllegalArgumentException.class,
                () -> repository.updateServer(
                        COMPANY, "a".repeat(65), SERVER, 0L, input));

        assertThrows(IllegalArgumentException.class,
                () -> repository.updateServer(
                        COMPANY, MERCHANT, "a".repeat(37), 0L, input));

        assertThrows(IllegalArgumentException.class,
                () -> repository.updateServer(
                        COMPANY, MERCHANT, SERVER, -1L, input));

        assertEquals(0, jdbc.calls);
    }
}