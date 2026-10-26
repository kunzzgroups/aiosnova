package com.aiosnova.ai;

import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Normal Agent CRUD. Does not read, seed or fall back to Mock data. */
@Service
public class AiAgentWriteService {
    private final AiAgentRepository repository;
    private final AiAgentService reads;
    private final JdbcTemplate jdbc;
    private final String merchantId;
    public AiAgentWriteService(AiAgentRepository repository, AiAgentService reads, JdbcTemplate jdbc,
            @Value("${ai.agents.merchant-id:}") String merchantId) {
        this.repository = repository; this.reads = reads; this.jdbc = jdbc; this.merchantId = merchantId;
    }
    public record CreateRequest(String companyId, String name, String description, String category,
            String status, AiAgentService.ModelConfig model, List<String> knowledgeBaseIds) {}
    public record UpdateRequest(String companyId, Long version, String name, String description, String category,
            String status, AiAgentService.ModelConfig model, List<String> knowledgeBaseIds) {}
    public record KnowledgeBaseOption(String id, String companyId, String name, int documentCount) {}

    @Transactional(rollbackFor = Exception.class)
    public AiAgentService.AgentItem create(CreateRequest request) {
        if (request == null) bad("Agent request is required.");
        requireMerchant();
        String company = id(request.companyId(), 64, "company ID");
        String status = request.status() == null ? "active" : request.status();
        validateStatus(status);
        var model = request.model() == null ? new AiAgentService.ModelConfig(null, "auto", "", 0.3, 1, 2048) : request.model();
        validateModel(company, model);
        var ids = validateKnowledge(company, status, request.knowledgeBaseIds() == null ? List.of() : request.knowledgeBaseIds());
        var agent = new AiAgentRepository.NewAgent(UUID.randomUUID().toString(), company, merchantId,
                text(request.name(), 255, "Agent name"), description(request.description()),
                request.category() == null ? "General" : text(request.category(), 100, "category"), status,
                model.binding() == null ? null : model.binding().providerId(), model.binding() == null ? null : model.binding().modelConfigId(),
                model.temperature(), model.topP(), model.maxTokens());
        return reads.saveNew(agent, ids).agent();
    }

    @Transactional(rollbackFor = Exception.class)
    public AiAgentService.AgentItem update(String agentId, UpdateRequest request) {
        if (request == null) bad("Agent request is required.");
        String company = id(request.companyId(), 64, "company ID");
        String agent = id(agentId, 128, "Agent ID");
        long version = version(request.version());
        var existing = locked(company, agent);
        if (existing.version() != version) conflict();
        String status = request.status() == null ? existing.status() : request.status(); validateStatus(status);
        var model = request.model() == null ? new AiAgentService.ModelConfig(
                existing.modelConfigId() == null ? null : new AiAgentService.ModelBinding(existing.providerId(), existing.modelConfigId()),
                "auto", "", existing.temperature(), existing.topP(), existing.maxTokens()) : request.model();
        // An unchanged unavailable binding may be retained when only changing metadata/status.
        if (request.model() != null) validateModel(company, model);
        List<String> knowledge = null;
        if (!"active".equals(status)) {
            if (request.knowledgeBaseIds() != null && !request.knowledgeBaseIds().isEmpty()) bad("Only active agents can have knowledge bindings.");
            knowledge = List.of();
        } else if (request.knowledgeBaseIds() != null) knowledge = validateKnowledge(company, status, request.knowledgeBaseIds());
        var updated = new AiAgentRepository.NewAgent(agent, company, existing.merchantId(),
                request.name() == null ? existing.name() : text(request.name(), 255, "Agent name"),
                request.description() == null ? existing.description() : description(request.description()),
                request.category() == null ? existing.category() : text(request.category(), 100, "category"), status,
                model.binding() == null ? null : model.binding().providerId(), model.binding() == null ? null : model.binding().modelConfigId(),
                model.temperature(), model.topP(), model.maxTokens());
        if (repository.updateConfiguration(updated, version) != 1) conflict();
        if (knowledge != null) {
            repository.clearKnowledgeBaseBindings(company, agent);
            repository.insertKnowledgeBaseBindings(company, agent, knowledge);
        }
        if (!"active".equals(status)) repository.clearDocumentOverrides(company, agent);
        return reads.get(company, agent).agent();
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(String companyId, String agentId, Long expectedVersion) {
        String company = id(companyId, 64, "company ID"), agent = id(agentId, 128, "Agent ID");
        long version = version(expectedVersion);
        var existing = locked(company, agent);
        if (existing.version() != version || repository.delete(company, agent, version) != 1) conflict();
        // Foreign keys remove binding rows; document override markers remain intact.
    }

    @Transactional(readOnly = true)
    public List<KnowledgeBaseOption> knowledgeBases(String companyId) {
        requireMerchant(); String company = id(companyId, 64, "company ID");
        return jdbc.query("""
                SELECT b.id, b.company_id, b.name,
                    (SELECT COUNT(*) FROM ai_knowledge_documents d WHERE d.company_id=b.company_id AND d.knowledge_base_id=b.id) AS document_count
                FROM ai_knowledge_bases b WHERE b.company_id = ? AND b.merchant_id = ? ORDER BY b.name, b.id
                """, (row, n) -> new KnowledgeBaseOption(row.getString("id"), row.getString("company_id"), row.getString("name"), row.getInt("document_count")), company, merchantId);
    }

    private AiAgentRepository.AgentSummary locked(String company, String agent) {
        requireMerchant();
        var row = repository.findForUpdate(company, agent).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Agent not found in this company."));
        if (!merchantId.equals(row.merchantId())) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Agent not found in this company.");
        return row;
    }
    private List<String> validateKnowledge(String company, String status, List<String> values) {
        if (values.size() > 1000) bad("Too many knowledge base bindings.");
        if (!"active".equals(status) && !values.isEmpty()) bad("Only active agents can have knowledge bindings.");
        var ids = new ArrayList<String>(); var seen = new HashSet<String>();
        for (String value : values) {
            String base = id(value, 128, "knowledge base ID");
            if (!seen.add(base)) bad("Duplicate knowledge base ID.");
            Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM ai_knowledge_bases WHERE company_id = ? AND merchant_id = ? AND id = ?", Integer.class, company, merchantId, base);
            if (count == null || count != 1) bad("Knowledge base is not saved in this company's database. Mock knowledge cannot be assigned to a stored Agent.");
            ids.add(base);
        }
        return List.copyOf(ids);
    }
    private void validateModel(String company, AiAgentService.ModelConfig model) {
        if (!Double.isFinite(model.temperature()) || model.temperature() < 0 || model.temperature() > 2
                || !Double.isFinite(model.topP()) || model.topP() <= 0 || model.topP() > 1 || model.maxTokens() <= 0) bad("Invalid Agent model parameters.");
        if (model.binding() == null) {
            if (!"auto".equals(model.provider()) || model.model() != null && !model.model().isEmpty()) bad("Select Auto or an exact stored model configuration.");
            return;
        }
        String provider = id(model.binding().providerId(), 36, "Provider ID"), config = id(model.binding().modelConfigId(), 36, "model configuration ID");
        var rows = jdbc.queryForList("""
                SELECT m.status, m.capability_chat, m.capability_vision, m.capability_tool_calling,
                    m.capabilities_checked_at, m.capability_error, p.enabled, p.api_key_ciphertext IS NOT NULL AS has_key
                FROM ai_models m JOIN ai_providers p ON p.company_id=m.company_id AND p.id=m.provider_id
                WHERE m.company_id = ? AND m.provider_id = ? AND m.id = ?
                """, company, provider, config);
        if (rows.isEmpty()) bad("Model configuration does not belong to this company and Provider.");
        var row = rows.getFirst();
        if (!"enabled".equals(row.get("status")) || !truth(row.get("enabled")) || !truth(row.get("has_key"))
                || !truth(row.get("capability_chat")) || row.get("capability_vision") == null || row.get("capability_tool_calling") == null
                || row.get("capabilities_checked_at") == null || row.get("capability_error") instanceof String message && !message.isBlank())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Select an enabled chat model with known capabilities and an enabled Provider with a saved API key.");
    }
    private static boolean truth(Object value) { return Boolean.TRUE.equals(value) || value instanceof Number number && number.intValue() == 1; }
    private void requireMerchant() { if (merchantId == null || !merchantId.matches("[A-Za-z0-9_-]{1,64}")) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Agent merchant scope is not configured."); }
    private static String text(String value, int max, String label) { String text = value == null ? "" : value.trim(); if (text.isEmpty() || text.length() > max) bad("Invalid " + label + "."); return text; }
    private static String id(String value, int max, String label) { String id = text(value, max, label); if (!id.matches("[A-Za-z0-9_-]+")) bad("Invalid " + label + "."); return id; }
    private static String description(String value) { String result = value == null ? "" : value; if (result.getBytes(StandardCharsets.UTF_8).length > 65535) bad("Agent description is too long."); return result; }
    private static long version(Long version) { if (version == null || version < 0) bad("A valid Agent version is required. Reload and try again."); return version; }
    private static void validateStatus(String status) { if (!List.of("active", "draft", "disabled").contains(status)) bad("Invalid Agent status."); }
    private static void bad(String message) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static void conflict() { throw new ResponseStatusException(HttpStatus.CONFLICT, "This Agent changed. Reload it before saving again."); }
}
