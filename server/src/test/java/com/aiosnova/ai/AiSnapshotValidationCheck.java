package com.aiosnova.ai;

import java.nio.file.Files;
import java.nio.file.Path;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.node.ArrayNode;

/** No database, API calls, imports or user backup access. Uses a generated seed fixture. */
public class AiSnapshotValidationCheck {
    public static void main(String[] args) throws Exception {
        var json = new ObjectMapper();
        String fixture = Files.readString(Path.of("target/ai-snapshot-validation-fixture.json"));
        var validation = new AiSnapshotValidationService();
        JsonNode good = json.readTree(fixture);
        var report = validation.validate(good);
        if (!report.passed()) throw new AssertionError(report.errors());
        if (!validation.validate(good).equals(report)) throw new AssertionError("Validation must not mutate input");
        var empty = json.readTree(fixture);
        var overrides = (ArrayNode) empty.path("data").path("documentOverrides");
        var override = json.createObjectNode();
        override.put("documentId", empty.path("data").path("documents").get(0).path("id").asString());
        override.set("agentIds", json.createArrayNode()); overrides.add(override);
        var emptyReport = validation.validate(empty);
        if (!emptyReport.passed() || emptyReport.counts().get("emptyDocumentOverrides") != 1
                || emptyReport.counts().get("inheritedDocuments") != report.counts().get("documents") - 1)
            throw new AssertionError("Empty override lost: " + emptyReport.errors());
        var brokenDate = json.readTree(fixture);
        ((ObjectNode) brokenDate.path("data").path("agents").get(0)).put("createdAt", "invalid");
        fails(validation.validate(brokenDate), "timestamp");
        var badConfig = json.readTree(fixture);
        ((ObjectNode) badConfig.path("data").path("dataSources").get(0)).set("config", json.readTree("{\"table\":42}"));
        fails(validation.validate(badConfig), "Configuration values");
        var cross = json.readTree(fixture);
        ((ObjectNode) cross.path("data").path("agents").get(0)).put("companyId", "another-company");
        fails(validation.validate(cross), "Cross-company");
        var badTemplate = json.readTree(fixture);
        ((ObjectNode) badTemplate.path("data").path("templates").get(0)).put("kind", "skill");
        fails(validation.validate(badTemplate), "mismatched content");
        var missing = json.readTree(fixture);
        ((ObjectNode) missing.path("data").path("skills").get(0)).put("baseId", "missing-base");
        fails(validation.validate(missing), "does not exist");
        fails(validation.validate(json.readTree("null")), "envelope");
        System.out.println("PASS: complete seed backup, empty overrides, timestamps, source config, ownership, template kinds, missing bases and no mutation.");
    }
    private static void fails(AiSnapshotValidationService.Report report, String message) {
        if (report.passed() || report.errors().stream().noneMatch(error -> error.contains(message))) throw new AssertionError(report.errors());
    }
}
