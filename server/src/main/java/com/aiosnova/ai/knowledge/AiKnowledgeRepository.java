package com.aiosnova.ai.knowledge;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AiKnowledgeRepository {
    private final JdbcTemplate jdbc;
    public AiKnowledgeRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    private static final Map<String, String> TABLES = Map.of("bases", "ai_knowledge_bases", "documents", "ai_knowledge_documents",
            "skills", "ai_knowledge_skills", "data-sources", "ai_knowledge_data_sources", "templates", "ai_knowledge_templates");
    private String table(String entity) { String table = TABLES.get(entity); if (table == null) throw new IllegalArgumentException("Unknown entity"); return table; }
    private String companyColumn(String entity) { return entity.equals("templates") ? "owner_company_id" : "company_id"; }
    public List<Map<String, Object>> list(String entity, String company) {
        return company == null ? jdbc.queryForList("SELECT * FROM " + table(entity) + " ORDER BY id")
                : jdbc.queryForList("SELECT * FROM " + table(entity) + " WHERE " + companyColumn(entity) + " = ? ORDER BY id", company);
    }
    public Map<String, Object> find(String entity, String company, String id, boolean lock) {
        var rows = jdbc.queryForList("SELECT * FROM " + table(entity) + " WHERE id = ?"
                + (company == null ? "" : " AND " + companyColumn(entity) + " = ?") + (lock ? " FOR UPDATE" : ""),
                company == null ? new Object[]{id} : new Object[]{id, company});
        return rows.isEmpty() ? null : new LinkedHashMap<>(rows.getFirst());
    }
    // All column maps below are built by Service, never copied from arbitrary request keys.
    public void insert(String entity, Map<String, Object> fields) {
        checkColumns(fields);
        int changed = jdbc.update("INSERT INTO " + table(entity) + " (" + String.join(",", fields.keySet()) + ") VALUES ("
                + String.join(",", Collections.nCopies(fields.size(), "?")) + ")", fields.values().toArray());
        if (changed != 1) throw new IllegalStateException("Unable to save knowledge entity.");
    }
    public void update(String entity, String company, String id, Map<String, Object> fields) {
        checkColumns(fields); var values = new ArrayList<>(fields.values()); values.add(company); values.add(id);
        int changed = jdbc.update("UPDATE " + table(entity) + " SET " + String.join(",", fields.keySet().stream().map(key -> key + " = ?").toList())
                + ", version = version + 1 WHERE " + companyColumn(entity) + " = ? AND id = ?", values.toArray());
        if (changed != 1) throw new IllegalStateException("Knowledge entity changed while saving.");
    }
    private void checkColumns(Map<String, Object> fields) {
        if (fields.isEmpty() || fields.keySet().stream().anyMatch(key -> !key.matches("[a-z_]+") || key.equals("version"))) throw new IllegalArgumentException("Invalid storage columns");
    }
    public void delete(String entity, String company, String id) {
        jdbc.update("DELETE FROM " + table(entity) + " WHERE " + companyColumn(entity) + " = ? AND id = ?", company, id);
    }
    public List<String> baseAgents(String company, String base) {
        return jdbc.queryForList("SELECT l.agent_id FROM ai_agent_knowledge_bases l JOIN ai_agents a ON a.id=l.agent_id AND a.company_id=l.company_id WHERE l.company_id=? AND l.knowledge_base_id=? AND a.status='active' ORDER BY l.agent_id", String.class, company, base);
    }
    public void validateAgents(String company, List<String> agents) {
        for (String agent : agents.stream().sorted().toList()) {
            var rows = jdbc.queryForList("SELECT id FROM ai_agents WHERE company_id=? AND id=? AND status='active' FOR UPDATE", company, agent);
            if (rows.isEmpty()) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Assign only active database Agents from this company.");
        }
    }
    public void setBaseAgents(String company, String base, List<String> agents) {
        var affected = new TreeSet<>(baseAgents(company, base)); affected.addAll(agents);
        jdbc.update("DELETE FROM ai_agent_knowledge_bases WHERE company_id=? AND knowledge_base_id=?", company, base);
        for (String agent : agents) jdbc.update("INSERT INTO ai_agent_knowledge_bases (company_id,agent_id,knowledge_base_id) VALUES (?,?,?)", company, agent, base);
        for (String agent : affected) jdbc.update("UPDATE ai_agents SET version=version+1 WHERE company_id=? AND id=?", company, agent);
    }
    public List<String> documentAgents(String company, String document) {
        return jdbc.queryForList("SELECT o.agent_id FROM ai_agent_document_overrides o JOIN ai_agents a ON a.id=o.agent_id AND a.company_id=o.company_id WHERE o.company_id=? AND o.document_id=? AND a.status='active' ORDER BY o.agent_id", String.class, company, document);
    }
    public void setDocumentAgents(String company, String document, List<String> agents) {
        jdbc.update("DELETE FROM ai_agent_document_overrides WHERE company_id=? AND document_id=?", company, document);
        for (String agent : agents) jdbc.update("INSERT INTO ai_agent_document_overrides (company_id,document_id,agent_id) VALUES (?,?,?)", company, document, agent);
    }
    public List<String> visibility(String owner, String template) {
        return jdbc.queryForList("SELECT allowed_company_id FROM ai_knowledge_template_visibility WHERE owner_company_id=? AND template_id=? ORDER BY allowed_company_id", String.class, owner, template);
    }
    public void visibility(String owner, String template, List<String> recipients) {
        jdbc.update("DELETE FROM ai_knowledge_template_visibility WHERE owner_company_id=? AND template_id=?", owner, template);
        for (String company : recipients) jdbc.update("INSERT INTO ai_knowledge_template_visibility (owner_company_id,template_id,allowed_company_id) VALUES (?,?,?)", owner, template, company);
    }
    public record StoredFile(String id, String companyId, String name, String mimeType, byte[] content) {}
    public StoredFile file(String company, String id) {
        var rows = jdbc.query("SELECT id,company_id,name,mime_type,content FROM ai_knowledge_files WHERE company_id=? AND id=?",
                (row,n) -> new StoredFile(row.getString("id"), row.getString("company_id"), row.getString("name"), row.getString("mime_type"), row.getBytes("content")), company, id);
        return rows.isEmpty() ? null : rows.getFirst();
    }
    public void file(StoredFile file, String document, String template) {
        jdbc.update("INSERT INTO ai_knowledge_files (id,company_id,document_id,template_id,name,mime_type,content) VALUES (?,?,?,?,?,?,?)",
                file.id(), file.companyId(), document, template, file.name(), file.mimeType(), file.content());
    }
    public List<String> contentFiles(String entity, String company, String id) {
        String column = contentFileColumn(entity);
        return jdbc.queryForList("SELECT id FROM ai_knowledge_files WHERE company_id=? AND " + column + "=? ORDER BY id", String.class, company, id);
    }
    public void contentFile(StoredFile file, String entity, String id) {
        String column = contentFileColumn(entity);
        jdbc.update("INSERT INTO ai_knowledge_files (id,company_id," + column + ",name,mime_type,content) VALUES (?,?,?,?,?,?)",
                file.id(),file.companyId(),id,file.name(),file.mimeType(),file.content());
    }
    private String contentFileColumn(String entity) {
        return switch(entity) { case "skills" -> "skill_id"; case "data-sources" -> "data_source_id"; default -> throw new IllegalArgumentException("Invalid attachment parent"); };
    }
}
