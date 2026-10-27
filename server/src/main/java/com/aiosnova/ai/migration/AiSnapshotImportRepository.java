package com.aiosnova.ai.migration;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;

/** Insert-only storage. Called inside the import Service transaction. No upserts. */
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "ai.migration.preflight-enabled", havingValue = "true")
@Repository
public class AiSnapshotImportRepository {
    private final JdbcTemplate jdbc;
    public AiSnapshotImportRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    private static String s(JsonNode row, String field) { return row.path(field).asString(); }
    private static String nullable(JsonNode row, String field) { return row.hasNonNull(field) ? s(row, field) : null; }
    private static LocalDateTime time(JsonNode row, String field) {
        return row.hasNonNull(field) ? LocalDateTime.ofInstant(Instant.parse(s(row, field)), ZoneOffset.UTC) : null;
    }
    private static String array(JsonNode row, String field) { return row.has(field) ? row.path(field).toString() : "[]"; }
    private void insert(String sql, Object... values) {
        if (jdbc.update(sql, values) != 1) throw new IllegalStateException("Snapshot insert did not save exactly one row.");
    }
    public void insertBase(JsonNode row) {
        insert("""
                INSERT INTO ai_knowledge_bases
                    (id, company_id, merchant_id, name, description, category, kind, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, s(row, "id"), s(row, "companyId"), s(row, "merchantId"), s(row, "name"),
                s(row, "description"), s(row, "category"), s(row, "kind"), time(row, "createdAt"), time(row, "updatedAt"));
    }
    public void insertAgent(JsonNode row) {
        var model = row.path("model"); var binding = model.path("binding");
        insert("""
                INSERT INTO ai_agents (id, company_id, merchant_id, name, description, category, status,
                    provider_id, model_config_id, temperature, top_p, max_tokens, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, s(row, "id"), s(row, "companyId"), s(row, "merchantId"), s(row, "name"),
                s(row, "description"), s(row, "category"), s(row, "status"), nullable(binding, "providerId"),
                nullable(binding, "modelConfigId"), model.path("temperature").asDouble(), model.path("topP").asDouble(),
                model.path("maxTokens").asInt(), time(row, "createdAt"), time(row, "createdAt"));
    }
    public void insertDocument(JsonNode row, String company, boolean override) {
        insert("""
                INSERT INTO ai_knowledge_documents (id, company_id, knowledge_base_id, title, kind, document_type,
                    status, mode, chunk_count, size_bytes, uploaded_at, last_indexed_at, file_url, mime_type, assignment_mode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, s(row, "id"), company, s(row, "baseId"), s(row, "title"), s(row, "kind"), s(row, "type"),
                s(row, "status"), row.path("mode").asString("active"), row.path("chunkCount").asLong(),
                row.path("sizeBytes").asLong(), time(row, "uploadedAt"), time(row, "lastIndexedAt"),
                nullable(row, "fileUrl"), nullable(row, "mimeType"), override ? "override" : "inherit");
    }
    public void insertSkill(JsonNode row, String company) {
        insert("""
                INSERT INTO ai_knowledge_skills (id, company_id, knowledge_base_id, name, description,
                    input_schema, status, mode, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, s(row, "id"), company, s(row, "baseId"), s(row, "name"), s(row, "description"),
                row.hasNonNull("inputSchema") ? row.path("inputSchema").toString() : null,
                s(row, "status"), row.path("mode").asString("active"), time(row, "updatedAt"));
    }
    public void insertDataSource(JsonNode row, String company) {
        insert("""
                INSERT INTO ai_knowledge_data_sources (id, company_id, knowledge_base_id, name, kind,
                    config, status, mode, last_synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, s(row, "id"), company, s(row, "baseId"), s(row, "name"), s(row, "kind"),
                row.path("config").toString(), s(row, "status"), row.path("mode").asString("active"), time(row, "lastSyncedAt"));
    }
    public void insertTemplate(JsonNode row) {
        insert("""
                INSERT INTO ai_knowledge_templates (id, owner_company_id, name, description, category,
                    kind, documents, skills, data_sources) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, s(row, "id"), s(row, "ownerCompanyId"), s(row, "name"), s(row, "description"),
                s(row, "category"), s(row, "kind"), array(row, "documents"), array(row, "skills"), array(row, "dataSources"));
    }
    public void insertTemplateVisibility(String owner, String template, String recipient) {
        insert("INSERT INTO ai_knowledge_template_visibility (owner_company_id, template_id, allowed_company_id) VALUES (?, ?, ?)", owner, template, recipient);
    }
    public void insertBaseBinding(String company, String agent, String base) {
        insert("INSERT INTO ai_agent_knowledge_bases (company_id, agent_id, knowledge_base_id) VALUES (?, ?, ?)", company, agent, base);
    }
    public void insertDocumentOverride(String company, String document, String agent) {
        insert("INSERT INTO ai_agent_document_overrides (company_id, document_id, agent_id) VALUES (?, ?, ?)", company, document, agent);
    }
}
