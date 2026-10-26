package com.aiosnova.ai;

import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;

/** Internal administrative operation only. Deliberately has no HTTP or startup caller. */
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "ai.migration.preflight-enabled", havingValue = "true")
@Service
public class AiSnapshotImportService {
    private final AiSnapshotValidationService validation;
    private final AiMigrationPreflightService preflight;
    private final AiSnapshotImportRepository repository;
    public AiSnapshotImportService(AiSnapshotValidationService validation, AiMigrationPreflightService preflight,
            AiSnapshotImportRepository repository) {
        this.validation = validation; this.preflight = preflight; this.repository = repository;
    }
    /** Must come from trusted administrative configuration, never from the backup/browser. */
    public record ImportScope(String merchantId, Set<String> companyIds) {
        public ImportScope { companyIds = Set.copyOf(companyIds); }
    }
    public record ImportResult(Map<String, Integer> counts) {}

    @Transactional(rollbackFor = Exception.class)
    public ImportResult importSnapshot(JsonNode input, ImportScope scope) {
        JsonNode root = input == null ? null : input.deepCopy();
        var checked = validation.validate(root);
        if (!checked.passed()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Snapshot validation failed: " + checked.errors().getFirst());
        JsonNode data = root.path("data");
        verifyScope(data, scope);
        // Re-check conflicts and model availability inside the write transaction.
        var available = preflight.check(preflightRequest(data));
        if (!available.passed()) throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Snapshot preflight failed: " + available.errors().getFirst());
        var baseCompanies = new HashMap<String, String>();
        data.path("bases").forEach(base -> baseCompanies.put(s(base, "id"), s(base, "companyId")));
        var overridden = new HashSet<String>();
        data.path("documentOverrides").forEach(row -> overridden.add(s(row, "documentId")));
        var documentCompanies = new HashMap<String, String>();
        try {
            for (var base : data.path("bases")) repository.insertBase(base);
            for (var agent : data.path("agents")) repository.insertAgent(agent);
            for (var document : data.path("documents")) {
                String company = baseCompanies.get(s(document, "baseId"));
                documentCompanies.put(s(document, "id"), company);
                repository.insertDocument(document, company, overridden.contains(s(document, "id")));
            }
            for (var skill : data.path("skills")) repository.insertSkill(skill, baseCompanies.get(s(skill, "baseId")));
            for (var source : data.path("dataSources")) repository.insertDataSource(source, baseCompanies.get(s(source, "baseId")));
            for (var template : data.path("templates")) {
                repository.insertTemplate(template);
                for (var recipient : template.path("allowedCompanyIds"))
                    repository.insertTemplateVisibility(s(template, "ownerCompanyId"), s(template, "id"), recipient.asString());
            }
            for (var agent : data.path("agents")) for (var base : agent.path("knowledgeBaseIds"))
                repository.insertBaseBinding(s(agent, "companyId"), s(agent, "id"), base.asString());
            for (var override : data.path("documentOverrides")) for (var agent : override.path("agentIds"))
                repository.insertDocumentOverride(documentCompanies.get(s(override, "documentId")), s(override, "documentId"), agent.asString());
        } catch (DuplicateKeyException conflict) {
            // Also covers races AFTER preflight. Never turn a conflict into an overwrite.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An import ID already exists. The whole import was cancelled.", conflict);
        }
        return new ImportResult(checked.counts());
    }

    private static String s(JsonNode row, String key) { return row.path(key).asString(); }
    private void verifyScope(JsonNode data, ImportScope scope) {
        if (scope == null || scope.merchantId() == null || scope.companyIds().isEmpty()) denied();
        for (String table : List.of("agents", "bases")) for (var row : data.path(table)) {
            if (!scope.merchantId().equals(s(row, "merchantId")) || !scope.companyIds().contains(s(row, "companyId"))) denied();
        }
        for (var template : data.path("templates")) {
            if (!scope.companyIds().contains(s(template, "ownerCompanyId"))) denied();
            for (var recipient : template.path("allowedCompanyIds")) if (!scope.companyIds().contains(recipient.asString())) denied();
        }
    }
    private static void denied() { throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Snapshot exceeds the trusted administrative import scope."); }

    static AiMigrationPreflightService.Request preflightRequest(JsonNode data) {
        var bases = new HashMap<String, String>();
        data.path("bases").forEach(row -> bases.put(s(row, "id"), s(row, "companyId")));
        var agents = new ArrayList<AiMigrationPreflightService.Target>();
        var baseTargets = new ArrayList<AiMigrationPreflightService.Target>();
        var docs = new ArrayList<AiMigrationPreflightService.Target>();
        var skills = new ArrayList<AiMigrationPreflightService.Target>();
        var sources = new ArrayList<AiMigrationPreflightService.Target>();
        var templates = new ArrayList<AiMigrationPreflightService.Target>();
        var models = new ArrayList<AiMigrationPreflightService.ModelTarget>();
        data.path("bases").forEach(row -> baseTargets.add(new AiMigrationPreflightService.Target(s(row, "id"), s(row, "companyId"))));
        for (var row : data.path("agents")) {
            agents.add(new AiMigrationPreflightService.Target(s(row, "id"), s(row, "companyId")));
            if (row.path("model").has("binding")) models.add(new AiMigrationPreflightService.ModelTarget(s(row, "id"), s(row, "companyId"),
                    s(row.path("model").path("binding"), "providerId"), s(row.path("model").path("binding"), "modelConfigId")));
        }
        data.path("documents").forEach(row -> docs.add(new AiMigrationPreflightService.Target(s(row, "id"), bases.get(s(row, "baseId")))));
        data.path("skills").forEach(row -> skills.add(new AiMigrationPreflightService.Target(s(row, "id"), bases.get(s(row, "baseId")))));
        data.path("dataSources").forEach(row -> sources.add(new AiMigrationPreflightService.Target(s(row, "id"), bases.get(s(row, "baseId")))));
        data.path("templates").forEach(row -> templates.add(new AiMigrationPreflightService.Target(s(row, "id"), s(row, "ownerCompanyId"))));
        return new AiMigrationPreflightService.Request(agents, baseTargets, docs, models, skills, sources, templates);
    }
}
