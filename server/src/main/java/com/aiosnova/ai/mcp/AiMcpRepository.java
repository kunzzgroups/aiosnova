package com.aiosnova.ai.mcp;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AiMcpRepository {

    // 不包含密钥明文或密文。
    public record ServerRow(
            String id,
            String companyId,
            String merchantId,
            String name,
            String description,
            String endpointUrl,
            String transport,
            String protocolVersion,
            String authType,
            boolean enabled,
            int timeoutSeconds,
            long connectionRevision,
            String verificationStatus,
            Long verificationRevision,
            long version) {
    }

    public record NewServer(
            String id,
            String companyId,
            String merchantId,
            String name,
            String description,
            String endpointUrl,
            String authType,
            String secretCiphertext,
            int timeoutSeconds) {
    }

    public record ServerEdit(
            String name,
            String description,
            String endpointUrl,
            String authType,
            String secretCiphertext,
            boolean replaceSecret,
            int timeoutSeconds,
            boolean connectionChanged) {
    }

    public record CatalogToolRow(
            String id,
            String companyId,
            String serverId,
            String remoteName,
            String description,
            String inputSchema,
            boolean enabled,
            boolean available,
            long discoveredConnectionRevision,
            long version) {
    }

    public record CatalogToolWrite(
            String id,
            String remoteName,
            String description,
            String inputSchema,
            long connectionRevision) {
    }

    public Optional<ServerRow> findServerForUpdate(
            String companyId,
            String merchantId,
            String serverId) {

        requireId(companyId, 64);
        requireId(merchantId, 64);
        requireId(serverId, 36);

        return jdbc.query(
                "SELECT " + SERVER_COLUMNS + """
                        FROM ai_mcp_servers
                        WHERE company_id = ?
                          AND merchant_id = ?
                          AND id = ?
                        FOR UPDATE
                        """,
                AiMcpRepository::mapServer,
                companyId,
                merchantId,
                serverId)
                .stream()
                .findFirst();
    }

    private static final String SERVER_COLUMNS = """
            id, company_id, merchant_id, name, description,
            endpoint_url, transport, protocol_version, auth_type,
            enabled, timeout_seconds, connection_revision,
            verification_status, verification_revision, version
            """;

    private final JdbcTemplate jdbc;

    public AiMcpRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ServerRow> findServers(
            String companyId,
            String merchantId) {

        requireId(companyId, 64);
        requireId(merchantId, 64);

        return jdbc.query(
                "SELECT " + SERVER_COLUMNS + """
                        FROM ai_mcp_servers
                        WHERE company_id = ? AND merchant_id = ?
                        ORDER BY name, id
                        """,
                AiMcpRepository::mapServer,
                companyId,
                merchantId);
    }

    public Optional<ServerRow> findServer(
            String companyId,
            String merchantId,
            String serverId) {

        requireId(companyId, 64);
        requireId(merchantId, 64);
        requireId(serverId, 36);

        return jdbc.query(
                "SELECT " + SERVER_COLUMNS + """
                        FROM ai_mcp_servers
                        WHERE company_id = ? AND merchant_id = ? AND id = ?
                        """,
                AiMcpRepository::mapServer,
                companyId,
                merchantId,
                serverId)
                .stream()
                .findFirst();
    }

    private static ServerRow mapServer(
            ResultSet row,
            int number) throws SQLException {

        return new ServerRow(
                row.getString("id"),
                row.getString("company_id"),
                row.getString("merchant_id"),
                row.getString("name"),
                row.getString("description"),
                row.getString("endpoint_url"),
                row.getString("transport"),
                row.getString("protocol_version"),
                row.getString("auth_type"),
                row.getBoolean("enabled"),
                row.getInt("timeout_seconds"),
                row.getLong("connection_revision"),
                row.getString("verification_status"),
                row.getObject("verification_revision", Long.class),
                row.getLong("version"));
    }

    private static void requireId(String value, int maxLength) {
        if (value == null
                || value.length() > maxLength
                || !value.matches("[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException("Invalid ID.");
        }
    }

    public int insertServer(NewServer server) {
        requireId(server.id(), 36);
        requireId(server.companyId(), 64);
        requireId(server.merchantId(), 64);

        return jdbc.update(
                """
                        INSERT INTO ai_mcp_servers (
                            id,
                            company_id,
                            merchant_id,
                            name,
                            description,
                            endpoint_url,
                            transport,
                            protocol_version,
                            auth_type,
                            secret_ciphertext,
                            enabled,
                            timeout_seconds,
                            connection_revision,
                            verification_status,
                            version
                        )
                        VALUES (
                            ?, ?, ?, ?, ?, ?,
                            'streamable_http',
                            '2025-11-25',
                            ?, ?,
                            0,
                            ?,
                            0,
                            'not_verified',
                            0
                        )
                        """,
                server.id(),
                server.companyId(),
                server.merchantId(),
                server.name(),
                server.description(),
                server.endpointUrl(),
                server.authType(),
                server.secretCiphertext(),
                server.timeoutSeconds());
    }

    public int updateServer(
            String companyId,
            String merchantId,
            String serverId,
            long expectedVersion,
            ServerEdit edit) {

        requireId(companyId, 64);
        requireId(merchantId, 64);
        requireId(serverId, 36);

        if (expectedVersion < 0) {
            throw new IllegalArgumentException("Invalid version.");
        }

        return jdbc.update(
                """
                        UPDATE ai_mcp_servers
                        SET name = ?,
                            description = ?,
                            endpoint_url = ?,
                            auth_type = ?,

                            secret_ciphertext = CASE
                                WHEN ? THEN ?
                                ELSE secret_ciphertext
                            END,

                            timeout_seconds = ?,

                            verification_status = CASE
                                WHEN ? THEN 'not_verified'
                                ELSE verification_status
                            END,

                            verification_revision = CASE
                                WHEN ? THEN NULL
                                ELSE verification_revision
                            END,

                            verification_checked_at = CASE
                                WHEN ? THEN NULL
                                ELSE verification_checked_at
                            END,

                            verification_error_code = CASE
                                WHEN ? THEN NULL
                                ELSE verification_error_code
                            END,

                            verification_error_message = CASE
                                WHEN ? THEN NULL
                                ELSE verification_error_message
                            END,

                            discovery_checked_at = CASE
                                WHEN ? THEN NULL
                                ELSE discovery_checked_at
                            END,

                            discovery_error_code = CASE
                                WHEN ? THEN NULL
                                ELSE discovery_error_code
                            END,

                            discovery_error_message = CASE
                                WHEN ? THEN NULL
                                ELSE discovery_error_message
                            END,

                            connection_revision = connection_revision + ?,
                            version = version + 1

                        WHERE company_id = ?
                          AND merchant_id = ?
                          AND id = ?
                          AND version = ?
                        """,
                edit.name(),
                edit.description(),
                edit.endpointUrl(),
                edit.authType(),

                edit.replaceSecret(),
                edit.secretCiphertext(),

                edit.timeoutSeconds(),

                edit.connectionChanged(),
                edit.connectionChanged(),
                edit.connectionChanged(),
                edit.connectionChanged(),
                edit.connectionChanged(),
                edit.connectionChanged(),
                edit.connectionChanged(),
                edit.connectionChanged(),

                edit.connectionChanged() ? 1 : 0,

                companyId,
                merchantId,
                serverId,
                expectedVersion);
    }

    public List<CatalogToolRow> findCatalogForUpdate(
            String companyId,
            String merchantId,
            String serverId) {

        requireCatalogScope(companyId, merchantId, serverId);

        return jdbc.query(
                """
                        SELECT
                            t.id,
                            t.company_id,
                            t.server_id,
                            t.remote_name,
                            t.description,
                            t.input_schema,
                            t.enabled,
                            t.available,
                            t.discovered_connection_revision,
                            t.version
                        FROM ai_mcp_tools t
                        JOIN ai_mcp_servers s
                          ON s.company_id = t.company_id
                         AND s.id = t.server_id
                        WHERE t.company_id = ?
                          AND s.merchant_id = ?
                          AND t.server_id = ?
                        ORDER BY t.id
                        FOR UPDATE
                        """,
                (row, number) -> new CatalogToolRow(
                        row.getString("id"),
                        row.getString("company_id"),
                        row.getString("server_id"),
                        row.getString("remote_name"),
                        row.getString("description"),
                        row.getString("input_schema"),
                        row.getBoolean("enabled"),
                        row.getBoolean("available"),
                        row.getLong("discovered_connection_revision"),
                        row.getLong("version")),
                companyId,
                merchantId,
                serverId);
    }

    public int insertCatalogTool(
            String companyId,
            String merchantId,
            String serverId,
            CatalogToolWrite tool) {

        requireCatalogScope(companyId, merchantId, serverId);
        requireId(tool.id(), 36);
        requireNonNegative(tool.connectionRevision());

        return jdbc.update(
                """
                        INSERT INTO ai_mcp_tools (
                            id,
                            company_id,
                            server_id,
                            remote_name,
                            description,
                            input_schema,
                            enabled,
                            available,
                            discovered_connection_revision,
                            discovered_at,
                            version
                        )
                        SELECT
                            ?, s.company_id, s.id, ?, ?, ?,
                            0, 1, ?, UTC_TIMESTAMP(6), 0
                        FROM ai_mcp_servers s
                        WHERE s.company_id = ?
                          AND s.merchant_id = ?
                          AND s.id = ?
                          AND s.connection_revision = ?
                        """,
                tool.id(),
                tool.remoteName(),
                tool.description(),
                tool.inputSchema(),
                tool.connectionRevision(),
                companyId,
                merchantId,
                serverId,
                tool.connectionRevision());
    }

    public int updateCatalogTool(
            String companyId,
            String merchantId,
            String serverId,
            long expectedVersion,
            CatalogToolWrite tool,
            boolean disable) {

        requireCatalogScope(companyId, merchantId, serverId);
        requireId(tool.id(), 36);
        requireNonNegative(expectedVersion);
        requireNonNegative(tool.connectionRevision());

        return jdbc.update(
                """
                        UPDATE ai_mcp_tools t
                        JOIN ai_mcp_servers s
                          ON s.company_id = t.company_id
                         AND s.id = t.server_id
                        SET t.description = ?,
                            t.input_schema = ?,
                            t.enabled = CASE
                                WHEN ? THEN 0
                                ELSE t.enabled
                            END,
                            t.available = 1,
                            t.discovered_connection_revision = ?,
                            t.discovered_at = UTC_TIMESTAMP(6),
                            t.version = t.version + 1
                        WHERE t.company_id = ?
                          AND s.merchant_id = ?
                          AND t.server_id = ?
                          AND t.id = ?
                          AND t.remote_name = ?
                          AND t.version = ?
                          AND s.connection_revision = ?
                        """,
                tool.description(),
                tool.inputSchema(),
                disable,
                tool.connectionRevision(),
                companyId,
                merchantId,
                serverId,
                tool.id(),
                tool.remoteName(),
                expectedVersion,
                tool.connectionRevision());
    }

    public int markCatalogToolUnavailable(
            String companyId,
            String merchantId,
            String serverId,
            String toolId,
            long expectedVersion) {

        requireCatalogScope(companyId, merchantId, serverId);
        requireId(toolId, 36);
        requireNonNegative(expectedVersion);

        return jdbc.update(
                """
                        UPDATE ai_mcp_tools t
                        JOIN ai_mcp_servers s
                          ON s.company_id = t.company_id
                         AND s.id = t.server_id
                        SET t.available = 0,
                            t.enabled = 0,
                            t.version = t.version + 1
                        WHERE t.company_id = ?
                          AND s.merchant_id = ?
                          AND t.server_id = ?
                          AND t.id = ?
                          AND t.version = ?
                        """,
                companyId,
                merchantId,
                serverId,
                toolId,
                expectedVersion);
    }

    public int completeCatalogDiscovery(
            String companyId,
            String merchantId,
            String serverId,
            long expectedServerVersion,
            long expectedConnectionRevision) {

        requireCatalogScope(companyId, merchantId, serverId);
        requireNonNegative(expectedServerVersion);
        requireNonNegative(expectedConnectionRevision);

        return jdbc.update(
                """
                        UPDATE ai_mcp_servers
                        SET discovery_checked_at = UTC_TIMESTAMP(6),
                            discovery_error_code = NULL,
                            discovery_error_message = NULL,
                            version = version + 1
                        WHERE company_id = ?
                          AND merchant_id = ?
                          AND id = ?
                          AND version = ?
                          AND connection_revision = ?
                          AND verification_status = 'verified'
                          AND verification_revision = connection_revision
                        """,
                companyId,
                merchantId,
                serverId,
                expectedServerVersion,
                expectedConnectionRevision);
    }

    private static void requireCatalogScope(
            String companyId,
            String merchantId,
            String serverId) {

        requireId(companyId, 64);
        requireId(merchantId, 64);
        requireId(serverId, 36);
    }

    private static void requireNonNegative(long value) {
        if (value < 0) {
            throw new IllegalArgumentException(
                    "Version and revision must not be negative.");
        }
    }

    public int beginVerification(
            String companyId,
            String merchantId,
            String serverId,
            long expectedVersion,
            long expectedConnectionRevision) {

        requireCatalogScope(companyId, merchantId, serverId);
        requireNonNegative(expectedVersion);
        requireNonNegative(expectedConnectionRevision);

        return jdbc.update(
                """
                        UPDATE ai_mcp_servers
                        SET verification_status = 'not_verified',
                            verification_revision = NULL,
                            verification_checked_at = NULL,
                            verification_error_code = NULL,
                            verification_error_message = NULL,
                            version = version + 1
                        WHERE company_id = ?
                          AND merchant_id = ?
                          AND id = ?
                          AND version = ?
                          AND connection_revision = ?
                        """,
                companyId,
                merchantId,
                serverId,
                expectedVersion,
                expectedConnectionRevision);
    }

    public int completeVerification(
            String companyId,
            String merchantId,
            String serverId,
            long registeredVersion,
            long expectedConnectionRevision,
            boolean verified) {

        requireCatalogScope(companyId, merchantId, serverId);
        requireNonNegative(registeredVersion);
        requireNonNegative(expectedConnectionRevision);

        return jdbc.update(
                """
                        UPDATE ai_mcp_servers
                        SET verification_status = ?,
                            verification_revision = ?,
                            verification_checked_at = UTC_TIMESTAMP(6),
                            verification_error_code = ?,
                            verification_error_message = ?,
                            version = version + 1
                        WHERE company_id = ?
                          AND merchant_id = ?
                          AND id = ?
                          AND version = ?
                          AND connection_revision = ?
                          AND verification_status = 'not_verified'
                          AND verification_revision IS NULL
                          AND verification_checked_at IS NULL
                        """,
                verified ? "verified" : "failed",
                expectedConnectionRevision,
                verified ? null : "mcp_verification_failed",
                verified ? null : "MCP initialization failed.",
                companyId,
                merchantId,
                serverId,
                registeredVersion,
                expectedConnectionRevision);
    }

    public List<CatalogToolRow> findCatalog(
            String companyId,
            String merchantId,
            String serverId) {

        requireCatalogScope(companyId, merchantId, serverId);

        return jdbc.query(
                """
                        SELECT
                            t.id,
                            t.company_id,
                            t.server_id,
                            t.remote_name,
                            t.description,
                            t.input_schema,
                            t.enabled,
                            t.available,
                            t.discovered_connection_revision,
                            t.version
                        FROM ai_mcp_tools t
                        JOIN ai_mcp_servers s
                          ON s.company_id = t.company_id
                         AND s.id = t.server_id
                        WHERE t.company_id = ?
                          AND s.merchant_id = ?
                          AND t.server_id = ?
                        ORDER BY t.remote_name, t.id
                        """,
                (row, number) -> new CatalogToolRow(
                        row.getString("id"),
                        row.getString("company_id"),
                        row.getString("server_id"),
                        row.getString("remote_name"),
                        row.getString("description"),
                        row.getString("input_schema"),
                        row.getBoolean("enabled"),
                        row.getBoolean("available"),
                        row.getLong("discovered_connection_revision"),
                        row.getLong("version")),
                companyId,
                merchantId,
                serverId);
    }
}