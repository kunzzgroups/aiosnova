package com.aiosnova.ai;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AiAgentRepository {

    private final JdbcTemplate jdbc;

    public record NewAgent(String id, String companyId, String merchantId,
            String name, String description, String category, String status,
            String providerId, String modelConfigId, double temperature,
            double topP, int maxTokens) {}

    // Called by the transactional Service; a binding failure must escape to roll back.
    public void insert(NewAgent agent) {
        int affected = jdbc.update("""
                INSERT INTO ai_agents (id, company_id, merchant_id, name, description,
                    category, status, provider_id, model_config_id,
                    temperature, top_p, max_tokens)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, agent.id(), agent.companyId(), agent.merchantId(), agent.name(),
                agent.description(), agent.category(), agent.status(), agent.providerId(),
                agent.modelConfigId(), agent.temperature(), agent.topP(), agent.maxTokens());
        if (affected != 1) throw new IllegalStateException("Unable to save the Agent.");
    }

    public void insertKnowledgeBaseBindings(String companyId, String agentId, List<String> ids) {
        for (String id : ids) {
            int affected = jdbc.update("""
                    INSERT INTO ai_agent_knowledge_bases (company_id, agent_id, knowledge_base_id)
                    VALUES (?, ?, ?)
                    """, companyId, agentId, id);
            if (affected != 1) throw new IllegalStateException("Unable to save the knowledge base binding.");
        }
    }

    public AiAgentRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<AgentSummary> findForUpdate(String companyId, String agentId) {
        return jdbc.query(SELECT_AGENT + " WHERE company_id = ? AND id = ? FOR UPDATE",
                this::mapAgent, companyId, agentId).stream().findFirst();
    }

    public int updateConfiguration(NewAgent agent, long version) {
        return jdbc.update("""
                UPDATE ai_agents SET name = ?, description = ?, category = ?, status = ?,
                    provider_id = ?, model_config_id = ?, temperature = ?, top_p = ?, max_tokens = ?,
                    version = version + 1
                WHERE company_id = ? AND id = ? AND version = ?
                """, agent.name(), agent.description(), agent.category(), agent.status(), agent.providerId(),
                agent.modelConfigId(), agent.temperature(), agent.topP(), agent.maxTokens(), agent.companyId(), agent.id(), version);
    }

    public void clearKnowledgeBaseBindings(String companyId, String agentId) {
        jdbc.update("DELETE FROM ai_agent_knowledge_bases WHERE company_id = ? AND agent_id = ?", companyId, agentId);
    }

    public void clearDocumentOverrides(String companyId, String agentId) {
        // Keep document assignment_mode='override' even if its last Agent is removed.
        jdbc.update("DELETE FROM ai_agent_document_overrides WHERE company_id = ? AND agent_id = ?", companyId, agentId);
    }

    public int delete(String companyId, String agentId, long version) {
        return jdbc.update("DELETE FROM ai_agents WHERE company_id = ? AND id = ? AND version = ?", companyId, agentId, version);
    }

    public record AgentSummary(
            String id,
            String companyId,
            String merchantId,
            String name,
            String description,
            String category,
            String status,
            String providerId,
            String modelConfigId,
            double temperature,
            double topP,
            int maxTokens,
            long version,
            LocalDateTime createdAt,
            LocalDateTime updatedAt) {
    }

    public record KnowledgeBaseBinding(
            String agentId,
            String knowledgeBaseId) {
    }

    private static final String SELECT_AGENT = """
            SELECT id, company_id, merchant_id,
                   name, description, category, status,
                   provider_id, model_config_id,
                   temperature, top_p, max_tokens, version,
                   created_at, updated_at
            FROM ai_agents
            """;

    public List<AgentSummary> findByCompany(String companyId) {
        return jdbc.query(
                SELECT_AGENT + """
                        WHERE company_id = ?
                        ORDER BY name, id
                        """,
                this::mapAgent,
                companyId);
    }

    public Optional<AgentSummary> findById(
            String companyId,
            String agentId) {

        return jdbc.query(
                SELECT_AGENT + """
                        WHERE company_id = ? AND id = ?
                        """,
                this::mapAgent,
                companyId,
                agentId)
                .stream()
                .findFirst();
    }

    public List<String> findKnowledgeBaseIds(
            String companyId,
            String agentId) {

        return jdbc.query(
                """
                SELECT knowledge_base_id
                FROM ai_agent_knowledge_bases
                WHERE company_id = ? AND agent_id = ?
                ORDER BY knowledge_base_id
                """,
                (result, rowNumber) ->
                        result.getString("knowledge_base_id"),
                companyId,
                agentId);
    }

    public List<KnowledgeBaseBinding> findBindingsByCompany(
            String companyId) {

        return jdbc.query(
                """
                SELECT agent_id, knowledge_base_id
                FROM ai_agent_knowledge_bases
                WHERE company_id = ?
                ORDER BY agent_id, knowledge_base_id
                """,
                (result, rowNumber) -> new KnowledgeBaseBinding(
                        result.getString("agent_id"),
                        result.getString("knowledge_base_id")),
                companyId);
    }

    private AgentSummary mapAgent(
            ResultSet result,
            int rowNumber) throws SQLException {

        return new AgentSummary(
                result.getString("id"),
                result.getString("company_id"),
                result.getString("merchant_id"),
                result.getString("name"),
                result.getString("description"),
                result.getString("category"),
                result.getString("status"),
                result.getString("provider_id"),
                result.getString("model_config_id"),
                result.getDouble("temperature"),
                result.getDouble("top_p"),
                result.getInt("max_tokens"),
                result.getLong("version"),
                result.getObject("created_at", LocalDateTime.class),
                result.getObject("updated_at", LocalDateTime.class));
    }
}
