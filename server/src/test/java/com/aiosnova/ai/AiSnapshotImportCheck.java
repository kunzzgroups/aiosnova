package com.aiosnova.ai;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.dao.DuplicateKeyException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;

/** Real Spring transaction interception, simulated SQL storage; never connects to MySQL. */
public class AiSnapshotImportCheck {
    record Write(String table, List<Object> values) {}
    static class MemoryJdbc extends JdbcTemplate {
        @Override public void afterPropertiesSet() { /* Deliberately has no real DataSource. */ }
        final List<Write> writes = new ArrayList<>();
        boolean failAtBinding;
        int attempted;
        @Override public int update(String sql, Object... args) {
            if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new AssertionError("Missing transaction proxy");
            if (!sql.stripLeading().startsWith("INSERT INTO ")) throw new AssertionError("Only INSERT is allowed");
            String table = sql.stripLeading().substring("INSERT INTO ".length()).split("[\\s(]", 2)[0];
            attempted++;
            if (failAtBinding && table.equals("ai_agent_knowledge_bases")) throw new DuplicateKeyException("Injected late binding conflict");
            writes.add(new Write(table, Arrays.asList(args.clone())));
            return 1;
        }
        long count(String table) { return writes.stream().filter(row -> row.table().equals(table)).count(); }
    }
    static class MemoryTransactions extends AbstractPlatformTransactionManager {
        final MemoryJdbc jdbc;
        int commits, rollbacks;
        MemoryTransactions(MemoryJdbc jdbc) { this.jdbc = jdbc; }
        @Override protected Object doGetTransaction() { return new ArrayList<>(jdbc.writes); }
        @Override protected void doBegin(Object transaction, TransactionDefinition definition) {}
        @Override protected void doCommit(DefaultTransactionStatus status) { commits++; }
        @Override @SuppressWarnings("unchecked") protected void doRollback(DefaultTransactionStatus status) {
            jdbc.writes.clear(); jdbc.writes.addAll((List<Write>) status.getTransaction()); rollbacks++;
        }
    }
    static class Preflight extends AiMigrationPreflightService {
        boolean conflict;
        Preflight() { super(null); }
        @Override public Report check(Request request) {
            if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new AssertionError("Preflight outside transaction");
            return new Report(!conflict, conflict ? List.of("Existing ID") : List.of(), List.of(), 0, 0);
        }
    }
    @Configuration @EnableTransactionManagement(proxyTargetClass = true)
    static class ConfigurationForCheck {
        @Bean MemoryJdbc jdbc() { return new MemoryJdbc(); }
        @Bean MemoryTransactions transactionManager(MemoryJdbc jdbc) { return new MemoryTransactions(jdbc); }
        final Preflight preflight = new Preflight();
        @Bean AiSnapshotImportService importer(MemoryJdbc jdbc) {
            return new AiSnapshotImportService(new AiSnapshotValidationService(), preflight, new AiSnapshotImportRepository(jdbc));
        }
    }
    static AiSnapshotImportService.ImportScope scope(JsonNode data) {
        var companies = new HashSet<String>();
        for (var base : data.path("bases")) companies.add(base.path("companyId").asString());
        for (var agent : data.path("agents")) companies.add(agent.path("companyId").asString());
        for (var template : data.path("templates")) {
            companies.add(template.path("ownerCompanyId").asString());
            template.path("allowedCompanyIds").forEach(id -> companies.add(id.asString()));
        }
        return new AiSnapshotImportService.ImportScope(data.path("bases").get(0).path("merchantId").asString(), companies);
    }
    public static void main(String[] args) throws Exception {
        var json = new ObjectMapper();
        JsonNode root = json.readTree(Files.readString(Path.of("target/ai-snapshot-validation-fixture.json")));
        var data = root.path("data");
        // One explicitly empty override and one nonempty override exercise both storage paths.
        var docs = data.path("documents");
        String base = docs.get(1).path("baseId").asString();
        String owner = "";
        for (var row : data.path("bases")) if (row.path("id").asString().equals(base)) owner = row.path("companyId").asString();
        String agent = "";
        for (var row : data.path("agents")) if (row.path("companyId").asString().equals(owner) && row.path("status").asString().equals("active")) { agent = row.path("id").asString(); break; }
        var empty = json.createObjectNode(); empty.put("documentId", docs.get(0).path("id").asString()); empty.set("agentIds", json.createArrayNode());
        var custom = json.createObjectNode(); custom.put("documentId", docs.get(1).path("id").asString()); custom.set("agentIds", json.createArrayNode().add(agent));
        ((ArrayNode) data.path("documentOverrides")).add(empty).add(custom);
        var authorized = scope(data);
        String before = root.toString();
        try (var context = new AnnotationConfigApplicationContext(ConfigurationForCheck.class)) {
            var service = context.getBean(AiSnapshotImportService.class);
            var jdbc = context.getBean(MemoryJdbc.class);
            var transactions = context.getBean(MemoryTransactions.class);
            var config = context.getBean(ConfigurationForCheck.class);
            var saved = service.importSnapshot(root, authorized);
            for (var entry : Map.of("agents", "ai_agents", "bases", "ai_knowledge_bases", "documents", "ai_knowledge_documents",
                    "skills", "ai_knowledge_skills", "dataSources", "ai_knowledge_data_sources", "templates", "ai_knowledge_templates").entrySet())
            {
                check(jdbc.count(entry.getValue()) == data.path(entry.getKey()).size(), "Missing imported rows: " + entry.getKey());
                var expectedIds = new HashSet<String>();
                data.path(entry.getKey()).forEach(row -> expectedIds.add(row.path("id").asString()));
                var savedIds = new HashSet<Object>();
                jdbc.writes.stream().filter(row -> row.table().equals(entry.getValue())).forEach(row -> savedIds.add(row.values().getFirst()));
                check(savedIds.equals(expectedIds), "Original IDs changed: " + entry.getKey());
            }
            check(jdbc.count("ai_agent_knowledge_bases") == saved.counts().get("baseBindings"), "Base links lost");
            check(jdbc.count("ai_agent_document_overrides") == 1, "Document links lost");
            check(jdbc.writes.stream().filter(row -> row.table().equals("ai_knowledge_documents") && row.values().getLast().equals("override")).count() == 2, "Empty override became inheritance");
            check(before.equals(root.toString()), "Input mutated");
            check(transactions.commits == 1, "Commit not executed");
            var committed = List.copyOf(jdbc.writes);
            jdbc.failAtBinding = true;
            expectStatus(() -> service.importSnapshot(root, authorized), 409);
            check(jdbc.writes.equals(committed), "Late failure did not restore all prior table state");
            check(transactions.rollbacks == 1, "Rollback not invoked");
            jdbc.failAtBinding = false;
            int attempts = jdbc.attempted;
            config.preflight.conflict = true;
            expectStatus(() -> service.importSnapshot(root, authorized), 409);
            check(jdbc.attempted == attempts, "Conflict allowed writes");
            config.preflight.conflict = false;
            expectStatus(() -> service.importSnapshot(root, new AiSnapshotImportService.ImportScope("wrong-merchant", authorized.companyIds())), 403);
            check(jdbc.attempted == attempts, "Unauthorized scope allowed writes");
            expectStatus(() -> service.importSnapshot(json.createObjectNode(), authorized), 400);
            check(jdbc.attempted == attempts && jdbc.writes.equals(committed), "Invalid snapshot allowed writes");
            System.out.println("PASS: Spring transaction commit/rollback with simulated SQL, all entity/link mappings, empty overrides, conflict/scope/validation rejection and no input mutation. No MySQL connection.");
        }
    }
    static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    static void expectStatus(Runnable call, int expected) {
        try { call.run(); throw new AssertionError("Expected failure " + expected); }
        catch (ResponseStatusException error) { check(error.getStatusCode().value() == expected, "Wrong status"); }
    }
}
