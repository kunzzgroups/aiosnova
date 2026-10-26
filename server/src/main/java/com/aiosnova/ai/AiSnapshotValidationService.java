package com.aiosnova.ai;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/** Full snapshot inspection without repositories, SQL, external calls or mutations. */
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "ai.migration.preflight-enabled", havingValue = "true")
@Service
public class AiSnapshotValidationService {
    public record Report(boolean passed, List<String> errors, List<String> warnings, Map<String, Integer> counts) {}
    public Report validate(JsonNode snapshot) { return new Inspection().run(snapshot); }

    private static class Inspection {
        final List<String> errors = new ArrayList<>();
        final List<String> warnings = new ArrayList<>();
        final Map<String, Integer> counts = new LinkedHashMap<>();
        final Map<String, Map<String, JsonNode>> tables = new HashMap<>();
        void error(String path, String message) { if (errors.size() < 200) errors.add(path + ": " + message); }
        String text(JsonNode row, String field) { return row.path(field).asString(""); }
        void string(JsonNode row, String field, String path, int limit, boolean blank) {
            JsonNode value = row.path(field);
            if (!value.isString() || (!blank && value.asString().isBlank())
                    || value.asString().codePointCount(0, value.asString().length()) > limit)
                error(path + "." + field, "Invalid text or field length.");
        }
        void description(JsonNode row, String path) {
            string(row, "description", path, 65535, true);
            if (text(row, "description").getBytes(StandardCharsets.UTF_8).length > 65535)
                error(path, "Description exceeds MySQL TEXT byte limit.");
        }
        boolean id(String value, int max) { return value.matches("[A-Za-z0-9_-]{1," + max + "}"); }
        void idField(JsonNode row, String field, String path, int max) {
            if (!row.path(field).isString() || !id(text(row, field), max)) error(path + "." + field, "Invalid ID.");
        }
        void enumeration(JsonNode row, String field, String path, String... allowed) {
            if (!Arrays.asList(allowed).contains(text(row, field))) error(path + "." + field, "Invalid value.");
        }
        void timestamp(JsonNode row, String field, String path, boolean nullable) {
            JsonNode value = row.path(field);
            if (nullable && value.isNull()) return;
            try {
                if (!value.isString()) throw new IllegalArgumentException();
                Instant instant = Instant.parse(value.asString());
                if (instant.isBefore(Instant.parse("1000-01-01T00:00:00Z")) || instant.isAfter(Instant.parse("9999-12-31T23:59:59Z"))) throw new IllegalArgumentException();
            } catch (RuntimeException invalid) { error(path + "." + field, "Expected an ISO UTC timestamp within MySQL range."); }
        }
        void integer(JsonNode row, String field, String path, long minimum, long maximum) {
            JsonNode value = row.path(field);
            if (!value.isIntegralNumber() || !value.canConvertToLong() || value.asLong() < minimum || value.asLong() > maximum)
                error(path + "." + field, "Invalid integer or storage range.");
        }
        void mode(JsonNode row, String path) {
            if (row.has("mode")) enumeration(row, "mode", path, "active", "paused", "testing");
        }
        List<String> ids(JsonNode node, String path, int max) {
            var result = new ArrayList<String>(); var seen = new HashSet<String>();
            if (!node.isArray() || node.size() > 2000) { error(path, "Expected at most 2000 IDs."); return result; }
            for (var value : node) {
                String key = value.isString() ? value.asString() : "";
                if (!id(key, max) || !seen.add(key)) error(path, "Invalid or duplicate linked ID.");
                result.add(key);
            }
            return result;
        }
        void object(JsonNode row, String field, String path, boolean optional, boolean stringValues) {
            if (optional && (!row.has(field) || row.path(field).isNull())) return;
            JsonNode node = row.path(field);
            if (!node.isObject()) { error(path + "." + field, "Expected an object."); return; }
            if (stringValues) for (var value : node) if (!value.isString()) error(path + "." + field, "Configuration values must be strings.");
        }
        void skill(JsonNode row, String path, boolean live) {
            string(row, "name", path, 255, false); description(row, path);
            object(row, "inputSchema", path, true, false);
            if (live) { enumeration(row, "status", path, "draft", "ready", "failed"); mode(row, path); timestamp(row, "updatedAt", path, false); }
        }
        void source(JsonNode row, String path, boolean live) {
            string(row, "name", path, 255, false); enumeration(row, "kind", path, "table", "api", "database");
            object(row, "config", path, false, true);
            if (live) { enumeration(row, "status", path, "connected", "disconnected", "error"); mode(row, path); timestamp(row, "lastSyncedAt", path, true); }
        }
        JsonNode baseFor(JsonNode child, String path, String expectedKind) {
            idField(child, "baseId", path, 128);
            JsonNode base = tables.get("bases").get(text(child, "baseId"));
            if (base == null) error(path, "Parent knowledge base does not exist.");
            else if (!expectedKind.equals(text(base, "kind"))) error(path, "Content kind does not match its knowledge base.");
            return base;
        }
        void sameOwner(JsonNode agent, JsonNode base, String path) {
            if (!text(agent, "companyId").equals(text(base, "companyId")) || !text(agent, "merchantId").equals(text(base, "merchantId"))) error(path, "Cross-company or cross-merchant Agent binding.");
            if (!"active".equals(text(agent, "status"))) error(path, "Inactive Agent cannot have bindings.");
        }
        Report run(JsonNode root) {
            if (root == null || !root.isObject() || !"aiosnova-ai-mock-snapshot".equals(text(root, "format"))
                    || !root.path("schemaVersion").isIntegralNumber() || root.path("schemaVersion").asInt() != 1
                    || !"all-mock-companies".equals(text(root, "scope")) || !root.path("data").isObject()) {
                error("snapshot", "Unsupported snapshot envelope."); return finish();
            }
            timestamp(root, "exportedAt", "snapshot", false);
            JsonNode data = root.path("data");
            for (String table : List.of("agents", "bases", "documents", "skills", "dataSources", "templates")) {
                var indexed = new LinkedHashMap<String, JsonNode>(); tables.put(table, indexed);
                JsonNode rows = data.path(table);
                if (!rows.isArray() || rows.size() > 2000) { error(table, "Expected at most 2000 records."); continue; }
                counts.put(table, rows.size());
                for (int i = 0; i < rows.size(); i++) {
                    var row = rows.get(i); String path = table + "[" + i + "]";
                    if (!row.isObject()) { error(path, "Expected an object."); continue; }
                    idField(row, "id", path, 128);
                    String key = text(row, "id");
                    if (indexed.putIfAbsent(key, row) != null) error(path, "Duplicate ID.");
                }
            }
            for (var entry : tables.get("bases").entrySet()) {
                String path = entry.getKey(); var row = entry.getValue();
                idField(row, "companyId", path, 64); idField(row, "merchantId", path, 64);
                string(row, "name", path, 255, false); description(row, path); string(row, "category", path, 100, false);
                enumeration(row, "kind", path, "document", "skill", "data");
                timestamp(row, "createdAt", path, false); timestamp(row, "updatedAt", path, false);
                if (row.has("allowedCompanyIds")) {
                    var allowed = ids(row.path("allowedCompanyIds"), path + ".allowedCompanyIds", 64);
                    if (allowed.stream().anyMatch(company -> !company.equals(text(row, "companyId")))) error(path, "Direct Knowledge sharing is disabled; distribute through templates.");
                }
            }
            int baseBindings = 0;
            for (var entry : tables.get("agents").entrySet()) {
                String path = entry.getKey(); var row = entry.getValue();
                idField(row, "companyId", path, 64); idField(row, "merchantId", path, 64);
                string(row, "name", path, 255, false); description(row, path); string(row, "category", path, 100, false);
                enumeration(row, "status", path, "active", "draft", "disabled"); timestamp(row, "createdAt", path, false);
                var model = row.path("model");
                if (!model.isObject()) error(path, "Missing model configuration.");
                else {
                    double temp = model.path("temperature").asDouble(Double.NaN), topP = model.path("topP").asDouble(Double.NaN);
                    if (!model.path("temperature").isNumber() || !Double.isFinite(temp) || temp < 0 || temp > 2
                            || !model.path("topP").isNumber() || !Double.isFinite(topP) || topP <= 0 || topP > 1) error(path, "Invalid model sampling parameters.");
                    integer(model, "maxTokens", path + ".model", 1, Integer.MAX_VALUE);
                    if (model.has("binding")) {
                        idField(model.path("binding"), "providerId", path, 36); idField(model.path("binding"), "modelConfigId", path, 36);
                    } else if (!"auto".equals(text(model, "provider")) || !"".equals(text(model, "model"))) error(path, "Legacy model configuration requires reselection.");
                }
                var linked = ids(row.path("knowledgeBaseIds"), path + ".knowledgeBaseIds", 128); baseBindings += linked.size();
                if (!linked.isEmpty() && !"active".equals(text(row, "status"))) error(path, "Inactive Agent has knowledge bindings.");
                for (String key : linked) {
                    var base = tables.get("bases").get(key);
                    if (base == null) error(path, "Missing knowledge base " + key + "."); else sameOwner(row, base, path);
                }
            }
            counts.put("baseBindings", baseBindings);
            for (var entry : tables.get("documents").entrySet()) {
                String path = entry.getKey(); var row = entry.getValue(); baseFor(row, path, "document");
                string(row, "title", path, 512, false); enumeration(row, "kind", path, "file", "record");
                enumeration(row, "type", path, "contract", "invoice", "policy", "record");
                enumeration(row, "status", path, "ready", "processing", "failed"); mode(row, path);
                integer(row, "chunkCount", path, 0, 4294967295L); integer(row, "sizeBytes", path, 0, 9007199254740991L);
                timestamp(row, "uploadedAt", path, false); timestamp(row, "lastIndexedAt", path, true);
                if (row.has("mimeType")) string(row, "mimeType", path, 255, true);
                if (row.has("fileUrl")) {
                    string(row, "fileUrl", path, 65535, true);
                    if (text(row, "fileUrl").getBytes(StandardCharsets.UTF_8).length > 65535) error(path, "File URL exceeds MySQL TEXT byte limit.");
                    if (text(row, "fileUrl").startsWith("blob:")) warnings.add(path + ": Temporary blob URL; original file needs durable storage.");
                }
            }
            tables.get("skills").forEach((path, row) -> { baseFor(row, path, "skill"); skill(row, path, true); });
            tables.get("dataSources").forEach((path, row) -> { baseFor(row, path, "data"); source(row, path, true); });
            for (var entry : tables.get("templates").entrySet()) {
                String path = entry.getKey(); var row = entry.getValue();
                idField(row, "ownerCompanyId", path, 64); string(row, "name", path, 255, false);
                description(row, path); string(row, "category", path, 100, false);
                enumeration(row, "kind", path, "document", "skill", "data");
                var recipients = ids(row.path("allowedCompanyIds"), path + ".allowedCompanyIds", 64);
                if (!recipients.contains(text(row, "ownerCompanyId"))) error(path, "Template visibility must include its owner.");
                for (String field : List.of("documents", "skills", "dataSources")) {
                    if (!row.has(field)) continue; var contents = row.path(field);
                    if (!contents.isArray() || contents.size() > 2000) { error(path + "." + field, "Invalid content array."); continue; }
                    String expected = field.equals("documents") ? "document" : field.equals("skills") ? "skill" : "data";
                    if (!contents.isEmpty() && !expected.equals(text(row, "kind"))) error(path, "Template contains mismatched content kinds.");
                    for (int i = 0; i < contents.size(); i++) {
                        var item = contents.get(i); String itemPath = path + "." + field + "[" + i + "]";
                        if (!item.isObject()) { error(itemPath, "Expected a content object."); continue; }
                        if (field.equals("documents")) { string(item, "title", itemPath, 512, false); enumeration(item, "type", itemPath, "policy", "contract", "invoice", "record"); }
                        else if (field.equals("skills")) skill(item, itemPath, false); else source(item, itemPath, false);
                    }
                }
            }
            var overrides = data.path("documentOverrides"); var overridden = new HashSet<String>(); int empty = 0, links = 0;
            if (!overrides.isArray() || overrides.size() > 2000) error("documentOverrides", "Invalid override array.");
            else for (var row : overrides) {
                String key = text(row, "documentId"); idField(row, "documentId", "documentOverrides", 128);
                if (!overridden.add(key)) error(key, "Duplicate override.");
                var doc = tables.get("documents").get(key); var base = doc == null ? null : tables.get("bases").get(text(doc, "baseId"));
                if (doc == null || base == null) error(key, "Missing override document/base.");
                var agentIds = ids(row.path("agentIds"), key + ".agentIds", 128); links += agentIds.size();
                if (row.path("agentIds").isArray() && row.path("agentIds").isEmpty()) empty++;
                for (String agentId : agentIds) {
                    var agent = tables.get("agents").get(agentId);
                    if (agent == null) error(key, "Missing override Agent."); else if (base != null) sameOwner(agent, base, key);
                }
            }
            counts.put("documentOverrides", overrides.isArray() ? overrides.size() : 0);
            counts.put("emptyDocumentOverrides", empty); counts.put("documentBindings", links);
            counts.put("inheritedDocuments", (int) tables.get("documents").keySet().stream().filter(key -> !overridden.contains(key)).count());
            if (root.path("counts").isObject()) counts.forEach((key, count) -> {
                if (root.path("counts").has(key) && (!root.path("counts").path(key).isIntegralNumber() || root.path("counts").path(key).asInt() != count)) warnings.add("counts." + key + ": Saved count differs; inspected counts are used.");
            });
            return finish();
        }
        Report finish() {
            warnings.add("Validation only. No records imported, no files uploaded, no models or data connections called.");
            warnings.add("Company authorization, SQL ID conflicts and live model availability require separate checks and must be repeated during import.");
            warnings.add("Data Source config is non-secret metadata; credential storage and file/vector migration are outside this snapshot validation.");
            if (errors.size() == 200) warnings.add("Only the first 200 errors are shown.");
            return new Report(errors.isEmpty(), List.copyOf(errors), List.copyOf(warnings), Map.copyOf(counts));
        }
    }
}
