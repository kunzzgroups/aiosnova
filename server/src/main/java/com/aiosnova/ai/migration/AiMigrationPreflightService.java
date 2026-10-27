package com.aiosnova.ai.migration;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Advisory SELECT-only inspection. Not import authorization or a reservation. */
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "ai.migration.preflight-enabled", havingValue = "true")
@Service
public class AiMigrationPreflightService {
    private final JdbcTemplate jdbc;
    public AiMigrationPreflightService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public record Target(String id, String companyId) {}
    public record ModelTarget(String agentId, String companyId, String providerId, String modelConfigId) {}
    public record Request(List<Target> agents, List<Target> bases, List<Target> documents, List<ModelTarget> models,
            List<Target> skills, List<Target> dataSources, List<Target> templates) {
        public Request(List<Target> agents, List<Target> bases, List<Target> documents, List<ModelTarget> models) {
            this(agents, bases, documents, models, List.of(), List.of(), List.of());
        }
    }
    public record Report(boolean passed, List<String> errors, List<String> warnings,
            int checkedIds, int checkedModelBindings) {}

    @Transactional(readOnly = true)
    public Report check(Request request) {
        if (request == null) bad("Missing preflight request.");
        validateTargets(request.agents()); validateTargets(request.bases()); validateTargets(request.documents());
        validateTargets(request.skills()); validateTargets(request.dataSources()); validateTargets(request.templates());
        if (request.models() == null || request.models().size() > 2000) bad("Invalid model binding list.");
        var agentCompanies = new HashMap<String, String>();
        request.agents().forEach(agent -> agentCompanies.put(agent.id(), agent.companyId()));
        var seen = new HashSet<String>();
        for (var model : request.models()) {
            if (model == null) bad("Invalid model binding.");
            validateId(model.agentId(), 128); validateId(model.companyId(), 64);
            validateId(model.providerId(), 36); validateId(model.modelConfigId(), 36);
            if (!model.companyId().equals(agentCompanies.get(model.agentId())) || !seen.add(model.agentId()))
                bad("Model binding must match one unique Agent and its company.");
        }
        var errors = new ArrayList<String>();
        checkConflicts("ai_agents", request.agents(), errors);
        checkConflicts("ai_knowledge_bases", request.bases(), errors);
        checkConflicts("ai_knowledge_documents", request.documents(), errors);
        checkConflicts("ai_knowledge_skills", request.skills(), errors);
        checkConflicts("ai_knowledge_data_sources", request.dataSources(), errors);
        checkConflicts("ai_knowledge_templates", request.templates(), errors);
        for (var model : request.models()) {
            List<Map<String, Object>> rows = jdbc.queryForList("""
                    SELECT m.status, m.capability_chat, m.capability_vision, m.capability_tool_calling,
                           m.capability_error, m.capabilities_checked_at, p.enabled AS provider_enabled,
                           p.api_key_ciphertext IS NOT NULL AS has_api_key
                    FROM ai_models m JOIN ai_providers p
                      ON p.id = m.provider_id AND p.company_id = m.company_id
                    WHERE m.id = ? AND m.company_id = ? AND m.provider_id = ?
                    """, model.modelConfigId(), model.companyId(), model.providerId());
            String prefix = model.agentId() + ": ";
            if (rows.isEmpty()) { errors.add(prefix + "Model binding does not exist under the specified company and Provider."); continue; }
            var row = rows.getFirst();
            if (!truth(row.get("provider_enabled"))) errors.add(prefix + "Provider is disabled.");
            if (!truth(row.get("has_api_key"))) errors.add(prefix + "Provider has no saved API key.");
            if (!"enabled".equals(row.get("status"))) errors.add(prefix + "Model is not enabled.");
            if (row.get("capability_chat") == null || row.get("capability_vision") == null
                    || row.get("capability_tool_calling") == null || row.get("capabilities_checked_at") == null
                    || row.get("capability_error") instanceof String message && !message.isBlank())
                errors.add(prefix + "Model capabilities are unknown or have an error.");
            else if (!truth(row.get("capability_chat"))) errors.add(prefix + "Model does not support chat.");
        }
        return new Report(errors.isEmpty(), List.copyOf(errors), List.of(
                "Read-only advisory check. No rows were written and no models were called.",
                "Auto Agents have no fixed model binding; the company default is not checked here.",
                "Company authorization, full import validation and database changes after this check must be checked again at import time.",
                "File contents, vector indexes, API key validity and Data Source connection health are not checked."),
                request.agents().size() + request.bases().size() + request.documents().size()
                    + request.skills().size() + request.dataSources().size() + request.templates().size(), request.models().size());
    }

    private void checkConflicts(String table, List<Target> targets, List<String> errors) {
        if (targets.isEmpty()) return;
        // Table names are fixed internal constants; IDs are always bound parameters.
        String placeholders = String.join(",", java.util.Collections.nCopies(targets.size(), "?"));
        var rows = jdbc.queryForList("SELECT id FROM " + table + " WHERE id IN (" + placeholders + ")",
                targets.stream().map(Target::id).toArray());
        for (var row : rows) errors.add(table + ": ID " + row.get("id") + " already exists. Import must not overwrite it.");
    }

    private void validateTargets(List<Target> targets) {
        if (targets == null || targets.size() > 2000) bad("Each ID list must contain at most 2000 entries.");
        var seen = new HashSet<String>();
        for (var target : targets) {
            if (target == null) bad("Invalid ID entry.");
            validateId(target.id(), 128); validateId(target.companyId(), 64);
            if (!seen.add(target.id())) bad("Duplicate ID in preflight request.");
        }
    }
    private void validateId(String value, int max) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{1," + max + "}")) bad("Invalid preflight ID.");
    }
    private static boolean truth(Object value) {
        return Boolean.TRUE.equals(value) || value instanceof Number number && number.intValue() == 1;
    }
    private static void bad(String message) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
}
