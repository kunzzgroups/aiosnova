package com.aiosnova.ai.tool;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;

public class AiToolRepository {

    public record AgentScope(
            String companyId,
            String merchantId,
            String agentId,
            String status) {
    }

    public record ToolRow(
            String id,
            String companyId,
            String name,
            String description,
            String module,
            String action,
            String executorType,
            String risk,
            String status,
            int timeoutSeconds,
            boolean requiresConfirmation,
            String configuration,
            long version) {
    }

    private final JdbcTemplate jdbc;

    public AiToolRepository(JdbcTemplate jdbc) {
        if (jdbc == null) {
            throw new IllegalArgumentException(
                    "JdbcTemplate is required.");
        }

        this.jdbc = jdbc;
    }

    public Optional<AgentScope> findAgent(
            String companyId,
            String merchantId,
            String agentId) {

        return jdbc.query(
                """
                        SELECT company_id, merchant_id, id, status
                        FROM ai_agents
                        WHERE company_id = ?
                          AND merchant_id = ?
                          AND id = ?
                        """,
                (rs, row) -> new AgentScope(
                        rs.getString("company_id"),
                        rs.getString("merchant_id"),
                        rs.getString("id"),
                        rs.getString("status")),
                companyId,
                merchantId,
                agentId)
                .stream()
                .findFirst();
    }

    public List<String> findBoundActions(
            String companyId,
            String merchantId,
            String agentId) {

        return jdbc.query(
                """
                        SELECT t.action
                        FROM ai_agent_tools b
                        JOIN ai_agents a
                          ON a.company_id = b.company_id
                         AND a.id = b.agent_id
                        JOIN ai_tools t
                          ON t.company_id = b.company_id
                         AND t.id = b.tool_id
                        WHERE b.company_id = ?
                          AND a.merchant_id = ?
                          AND b.agent_id = ?
                        ORDER BY t.action
                        """,
                (rs, row) -> rs.getString("action"),
                companyId,
                merchantId,
                agentId);
    }

    public List<ToolRow> findTools(
            String companyId,
            String merchantId) {

        return jdbc.query(
                """
                        SELECT t.id, t.company_id, t.name, t.description,
                               t.module, t.action, t.executor_type,
                               t.risk, t.status, t.timeout_seconds,
                               t.requires_confirmation,
                               t.configuration, t.version
                        FROM ai_tools t
                        WHERE t.company_id = ?
                          AND EXISTS (
                              SELECT 1
                              FROM ai_agents a
                              WHERE a.company_id = t.company_id
                                AND a.merchant_id = ?
                          )
                        ORDER BY t.action, t.id
                        """,
                (rs, row) -> new ToolRow(
                        rs.getString("id"),
                        rs.getString("company_id"),
                        rs.getString("name"),
                        rs.getString("description"),
                        rs.getString("module"),
                        rs.getString("action"),
                        rs.getString("executor_type"),
                        rs.getString("risk"),
                        rs.getString("status"),
                        rs.getInt("timeout_seconds"),
                        rs.getBoolean("requires_confirmation"),
                        rs.getString("configuration"),
                        rs.getLong("version")),
                companyId,
                merchantId);
    }

    public record NewTool(
            String id,
            String companyId,
            String name,
            String description,
            String module,
            String action,
            String executorType,
            String risk,
            String status,
            int timeoutSeconds,
            boolean requiresConfirmation,
            String configuration) {
    }

    public boolean companyExistsInMerchant(
            String companyId,
            String merchantId) {

        Integer count = jdbc.queryForObject(
                """
                        SELECT COUNT(*)
                        FROM ai_agents
                        WHERE company_id = ?
                          AND merchant_id = ?
                        """,
                Integer.class,
                companyId,
                merchantId);

        return count != null && count > 0;
    }

    public Optional<AgentScope> findAgentForUpdate(
            String companyId,
            String merchantId,
            String agentId) {

        return jdbc.query(
                """
                        SELECT company_id, merchant_id, id, status
                        FROM ai_agents
                        WHERE company_id = ?
                          AND merchant_id = ?
                          AND id = ?
                        FOR UPDATE
                        """,
                (rs, row) -> new AgentScope(
                        rs.getString("company_id"),
                        rs.getString("merchant_id"),
                        rs.getString("id"),
                        rs.getString("status")),
                companyId,
                merchantId,
                agentId)
                .stream()
                .findFirst();
    }

    public void insert(NewTool tool) {
        int affected = jdbc.update(
                """
                        INSERT INTO ai_tools (
                            id, company_id, name, description, module,
                            action, executor_type, risk, status,
                            timeout_seconds, requires_confirmation, configuration
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                tool.id(),
                tool.companyId(),
                tool.name(),
                tool.description(),
                tool.module(),
                tool.action(),
                tool.executorType(),
                tool.risk(),
                tool.status(),
                tool.timeoutSeconds(),
                tool.requiresConfirmation(),
                tool.configuration());

        if (affected != 1) {
            throw new IllegalStateException("Unable to save tool.");
        }
    }

    public void insertAgentBindings(
            String companyId,
            String toolId,
            List<String> agentIds) {

        for (String agentId : agentIds) {
            int affected = jdbc.update(
                    """
                            INSERT INTO ai_agent_tools (
                                company_id, agent_id, tool_id
                            )
                            VALUES (?, ?, ?)
                            """,
                    companyId,
                    agentId,
                    toolId);

            if (affected != 1) {
                throw new IllegalStateException(
                        "Unable to save Agent tool binding.");
            }
        }
    }

    public record LockedTool(
            String id,
            String action,
            String executorType,
            long version) {
    }

    public Optional<LockedTool> findToolForUpdate(
            String companyId,
            String merchantId,
            String toolId) {

        return jdbc.query(
                """
                        SELECT t.id, t.action, t.executor_type, t.version
                        FROM ai_tools t
                        WHERE t.company_id = ?
                          AND t.id = ?
                          AND EXISTS (
                              SELECT 1
                              FROM ai_agents a
                              WHERE a.company_id = t.company_id
                                AND a.merchant_id = ?
                          )
                        FOR UPDATE
                        """,
                (rs, row) -> new LockedTool(
                        rs.getString("id"),
                        rs.getString("action"),
                        rs.getString("executor_type"),
                        rs.getLong("version")),
                companyId,
                toolId,
                merchantId)
                .stream()
                .findFirst();
    }

    public int updateConfiguration(
            NewTool tool,
            long expectedVersion) {

        return jdbc.update(
                """
                        UPDATE ai_tools
                        SET name = ?, description = ?, module = ?,
                            risk = ?, status = ?, timeout_seconds = ?,
                            requires_confirmation = ?, configuration = ?,
                            version = version + 1
                        WHERE company_id = ?
                          AND id = ?
                          AND version = ?
                        """,
                tool.name(),
                tool.description(),
                tool.module(),
                tool.risk(),
                tool.status(),
                tool.timeoutSeconds(),
                tool.requiresConfirmation(),
                tool.configuration(),
                tool.companyId(),
                tool.id(),
                expectedVersion);
    }

    public int updateStatus(
            String companyId,
            String toolId,
            String status,
            long expectedVersion) {

        return jdbc.update(
                """
                        UPDATE ai_tools
                        SET status = ?, version = version + 1
                        WHERE company_id = ? AND id = ? AND version = ?
                        """,
                status,
                companyId,
                toolId,
                expectedVersion);
    }

    public int advanceVersion(
            String companyId,
            String toolId,
            long expectedVersion) {

        return jdbc.update(
                """
                        UPDATE ai_tools
                        SET version = version + 1
                        WHERE company_id = ? AND id = ? AND version = ?
                        """,
                companyId,
                toolId,
                expectedVersion);
    }

    public void clearAgentBindings(
            String companyId,
            String toolId) {

        jdbc.update(
                """
                        DELETE FROM ai_agent_tools
                        WHERE company_id = ? AND tool_id = ?
                        """,
                companyId,
                toolId);
    }

    public List<String> findBoundAgentIds(
            String companyId,
            String toolId) {

        return jdbc.query(
                """
                        SELECT agent_id
                        FROM ai_agent_tools
                        WHERE company_id = ? AND tool_id = ?
                        ORDER BY agent_id
                        """,
                (rs, row) -> rs.getString("agent_id"),
                companyId,
                toolId);
    }
}