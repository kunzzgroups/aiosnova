package com.aiosnova.ai.migration;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import javax.sql.DataSource;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.node.ArrayNode;

/** Manual opt-in MySQL test. Seed fixture only, random IDs; every scenario rolls back. */
public class AiSnapshotMySqlRollbackCheck {
    static class FaultRepository extends AiSnapshotImportRepository {
        boolean failAtBinding;
        boolean reachedFailure;
        FaultRepository(JdbcTemplate jdbc) { super(jdbc); }
        @Override public void insertBaseBinding(String company, String agent, String base) {
            super.insertBaseBinding(company, agent, base);
            if (failAtBinding) {
                reachedFailure = true;
                // Real MySQL duplicate PRIMARY KEY, after all six entity types were inserted.
                super.insertBaseBinding(company, agent, base);
            }
        }
    }
    @Configuration @EnableTransactionManagement(proxyTargetClass = true)
    static class ConfigurationForCheck {
        @Bean DataSource dataSource() {
            String password = System.getenv("AI_DB_PASSWORD");
            if (password == null || password.isBlank()) throw new IllegalStateException("Set AI_DB_PASSWORD first.");
            return new DriverManagerDataSource("jdbc:mysql://127.0.0.1:3307/aiosnova_ai_local?characterEncoding=UTF-8", "ai_app", password);
        }
        @Bean JdbcTemplate jdbc(DataSource dataSource) { return new JdbcTemplate(dataSource); }
        @Bean DataSourceTransactionManager transactionManager(DataSource dataSource) { return new DataSourceTransactionManager(dataSource); }
        @Bean AiSnapshotValidationService validation() { return new AiSnapshotValidationService(); }
        @Bean AiMigrationPreflightService preflight(JdbcTemplate jdbc) { return new AiMigrationPreflightService(jdbc); }
        @Bean FaultRepository repository(JdbcTemplate jdbc) { return new FaultRepository(jdbc); }
        @Bean AiSnapshotImportService importer(AiSnapshotValidationService validation, AiMigrationPreflightService preflight, FaultRepository repository) {
            return new AiSnapshotImportService(validation, preflight, repository);
        }
    }
    public static void main(String[] args) throws Exception {
        if (!"true".equals(System.getenv("AI_RUN_SNAPSHOT_ROLLBACK_CHECK")))
            throw new IllegalStateException("Set AI_RUN_SNAPSHOT_ROLLBACK_CHECK=true to opt in. This test temporarily writes and always rolls back.");
        var json = new ObjectMapper();
        JsonNode root = json.readTree(Files.readString(Path.of("target/ai-snapshot-validation-fixture.json")));
        var data = root.path("data");
        String prefix = "tx-" + UUID.randomUUID() + "-";
        var remap = new HashMap<String, String>();
        for (String table : ENTITY_TABLES.keySet()) for (var row : data.path(table)) {
            String old = row.path("id").asString(); remap.put(old, prefix + old);
            ((ObjectNode) row).put("id", prefix + old);
        }
        for (String table : List.of("documents", "skills", "dataSources")) for (var row : data.path(table))
            ((ObjectNode) row).put("baseId", remap.get(row.path("baseId").asString()));
        for (var row : data.path("agents")) {
            var ids = (ArrayNode) row.path("knowledgeBaseIds");
            for (int i = 0; i < ids.size(); i++) ids.set(i, json.getNodeFactory().stringNode(remap.get(ids.get(i).asString())));
        }
        // The generated seed fixture has no overrides; add an explicit empty one.
        var empty = json.createObjectNode(); empty.put("documentId", data.path("documents").get(0).path("id").asString());
        empty.set("agentIds", json.createArrayNode()); ((ArrayNode) data.path("documentOverrides")).add(empty);
        var scope = AiSnapshotImportCheck.scope(data);
        try (var context = new AnnotationConfigApplicationContext(ConfigurationForCheck.class)) {
            var service = context.getBean(AiSnapshotImportService.class);
            var jdbc = context.getBean(JdbcTemplate.class);
            var repository = context.getBean(FaultRepository.class);
            var transaction = new TransactionTemplate(context.getBean(DataSourceTransactionManager.class));
            assertAbsent(jdbc, data);
            transaction.executeWithoutResult(status -> {
                // Set before calling the importer: this scenario can never commit.
                status.setRollbackOnly();
                var saved = service.importSnapshot(root, scope);
                for (var entry : ENTITY_TABLES.entrySet())
                    check(count(jdbc, entry.getValue(), "id", ids(data.path(entry.getKey()))) == data.path(entry.getKey()).size(), "Missing SQL entity rows");
                check(count(jdbc, "ai_agent_knowledge_bases", "agent_id", ids(data.path("agents"))) == saved.counts().get("baseBindings"), "Base links missing");
                String assignment = jdbc.queryForObject("SELECT assignment_mode FROM ai_knowledge_documents WHERE id = ?", String.class,
                        data.path("documents").get(0).path("id").asString());
                check("override".equals(assignment), "Explicit empty override lost");
            });
            assertAbsent(jdbc, data);
            System.out.println("PASS: all SQL mappings/links worked; success scenario was intentionally rolled back.");
            repository.failAtBinding = true;
            try {
                transaction.executeWithoutResult(status -> {
                    status.setRollbackOnly();
                    service.importSnapshot(root, scope);
                });
                throw new AssertionError("Expected duplicate-key failure");
            } catch (ResponseStatusException expected) {
                check(expected.getStatusCode().value() == 409 && repository.reachedFailure, "Expected late MySQL binding conflict");
            }
            assertAbsent(jdbc, data);
            System.out.println("PASS: late MySQL binding failure rolled back every entity/link; no test rows persisted.");
        }
    }
    private static final Map<String, String> ENTITY_TABLES = Map.of("agents", "ai_agents", "bases", "ai_knowledge_bases",
            "documents", "ai_knowledge_documents", "skills", "ai_knowledge_skills", "dataSources", "ai_knowledge_data_sources", "templates", "ai_knowledge_templates");
    private static List<String> ids(JsonNode array) {
        var ids = new ArrayList<String>(); array.forEach(row -> ids.add(row.path("id").asString())); return ids;
    }
    private static int count(JdbcTemplate jdbc, String table, String column, List<String> ids) {
        if (ids.isEmpty()) return 0;
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE " + column + " IN ("
                + String.join(",", Collections.nCopies(ids.size(), "?")) + ")", Integer.class, ids.toArray());
    }
    private static void assertAbsent(JdbcTemplate jdbc, JsonNode data) {
        for (var entry : ENTITY_TABLES.entrySet()) check(count(jdbc, entry.getValue(), "id", ids(data.path(entry.getKey()))) == 0, "Test entity persisted");
        check(count(jdbc, "ai_agent_knowledge_bases", "agent_id", ids(data.path("agents"))) == 0, "Test base binding persisted");
        check(count(jdbc, "ai_agent_document_overrides", "document_id", ids(data.path("documents"))) == 0, "Test document binding persisted");
        check(count(jdbc, "ai_knowledge_template_visibility", "template_id", ids(data.path("templates"))) == 0, "Test template visibility persisted");
    }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
}
