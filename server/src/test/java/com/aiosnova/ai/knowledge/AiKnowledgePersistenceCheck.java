package com.aiosnova.ai.knowledge;

import java.time.LocalDateTime;
import java.util.*;
import org.springframework.context.annotation.*;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.*;

/**
 * Exercises the actual Service and Spring transaction proxy, with simulated SQL
 * storage. No MySQL writes.
 */
public class AiKnowledgePersistenceCheck {
    static final ObjectMapper JSON = new ObjectMapper();

    static class Store extends AiKnowledgeRepository {
        Map<String, Map<String, Object>> rows = new LinkedHashMap<>();
        Map<String, List<String>> links = new HashMap<>(), overrides = new HashMap<>(), visibility = new HashMap<>();
        Map<String, StoredFile> files = new HashMap<>();
        Map<String, List<String>> contentFiles = new HashMap<>();
        boolean failVisibility, failFile, failJob;

        Store() {
            super(null);
        }

        void writing() {
            check(TransactionSynchronizationManager.isActualTransactionActive(), "Missing transaction");
        }

        String owner(String entity, Map<String, Object> row) {
            return (String) row.get(entity.equals("templates") ? "owner_company_id" : "company_id");
        }

        @Override
        public List<Map<String, Object>> list(String entity, String company) {
            return rows.entrySet().stream().filter(e -> e.getKey().startsWith(entity + ":"))
                    .map(Map.Entry::getValue).filter(row -> company == null || company.equals(owner(entity, row)))
                    .map(LinkedHashMap<String, Object>::new).map(row -> (Map<String, Object>) row).toList();
        }

        @Override
        public Map<String, Object> find(String entity, String company, String id, boolean lock) {
            var row = rows.get(entity + ":" + id);
            return row == null || company != null && !company.equals(owner(entity, row)) ? null
                    : new LinkedHashMap<>(row);
        }

        @Override
        public void insert(String entity, Map<String, Object> fields) {
            writing();
            var row = new LinkedHashMap<>(fields);
            row.put("version", 0L);
            row.putIfAbsent("created_at", LocalDateTime.now());
            row.putIfAbsent("updated_at", LocalDateTime.now());
            if (rows.putIfAbsent(entity + ":" + row.get("id"), row) != null)
                throw new IllegalStateException("Duplicate ID");
        }

        @Override
        public void update(String entity, String company, String id, Map<String, Object> fields) {
            writing();
            var row = find(entity, company, id, false);
            check(row != null, "Missing update row");
            row.putAll(fields);
            row.put("version", ((Number) row.get("version")).longValue() + 1);
            rows.put(entity + ":" + id, row);
        }

        @Override
        public void delete(String entity, String company, String id) {
            writing();
            if (find(entity, company, id, false) != null)
                rows.remove(entity + ":" + id);
        }

        @Override
        public List<String> baseAgents(String company, String base) {
            return links.getOrDefault(company + ":" + base, List.of());
        }

        @Override
        public void setBaseAgents(String company, String base, List<String> agents) {
            writing();
            links.put(company + ":" + base, List.copyOf(agents));
        }

        @Override
        public void validateAgents(String company, List<String> agents) {
            for (String agent : agents)
                if (!agent.equals(company + "-agent"))
                    throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,
                            "Wrong Agent company");
        }

        @Override
        public List<String> documentAgents(String company, String document) {
            return overrides.getOrDefault(company + ":" + document, List.of());
        }

        @Override
        public void setDocumentAgents(String company, String document, List<String> agents) {
            writing();
            overrides.put(company + ":" + document, List.copyOf(agents));
        }

        @Override
        public List<String> visibility(String company, String template) {
            return visibility.getOrDefault(company + ":" + template, List.of());
        }

        @Override
        public void visibility(String company, String template, List<String> recipients) {
            writing();
            if (failVisibility)
                throw new IllegalStateException("Simulated last visibility INSERT failure");
            visibility.put(company + ":" + template, List.copyOf(recipients));
        }

        @Override
        public StoredFile file(String company, String id) {
            var file = files.get(id);
            return file != null && file.companyId().equals(company) ? file : null;
        }

        @Override
        public void file(StoredFile file, String document, String template) {
            writing();
            if (failFile)
                throw new IllegalStateException("Simulated file INSERT failure");
            files.put(file.id(), file);
        }

        @Override
        public List<String> contentFiles(String entity, String company, String id) {
            return contentFiles.getOrDefault(entity + ":" + company + ":" + id, List.of());
        }

        @Override
        public void contentFile(StoredFile file, String entity, String id) {
            file(file, null, null);
            contentFiles.put(entity + ":" + file.companyId() + ":" + id, List.of(file.id()));
        }
    }

    record Snapshot(Map<String, Map<String, Object>> rows, Map<String, List<String>> links,
            Map<String, List<String>> overrides, Map<String, List<String>> visibility,
            Map<String, AiKnowledgeRepository.StoredFile> files, Map<String, List<String>> contentFiles) {
    }

    static class Transactions extends AbstractPlatformTransactionManager {
        final Store store;

        Transactions(Store store) {
            this.store = store;
        }

        @Override
        protected Object doGetTransaction() {
            var rows = new LinkedHashMap<String, Map<String, Object>>();
            store.rows.forEach((k, v) -> rows.put(k, new LinkedHashMap<>(v)));
            return new Snapshot(rows, new HashMap<>(store.links), new HashMap<>(store.overrides),
                    new HashMap<>(store.visibility), new HashMap<>(store.files), new HashMap<>(store.contentFiles));
        }

        @Override
        protected void doBegin(Object tx, TransactionDefinition definition) {
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            var old = (Snapshot) status.getTransaction();
            store.rows = old.rows();
            store.links = old.links();
            store.overrides = old.overrides();
            store.visibility = old.visibility();
            store.files = old.files();
            store.contentFiles = old.contentFiles();
        }
    }

    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    static class Config {
        @Bean
        Store repository() {
            return new Store();
        }

        @Bean
        Transactions transactionManager(Store store) {
            return new Transactions(store);
        }

        @Bean
        AiKnowledgeService service(Store store) {
            var processing = new AiKnowledgeProcessingRepository(null) {
                @Override
                public String enqueue(String company, String file) {
                    store.writing();
                    if (store.file(company, file) == null) {
                        throw new IllegalArgumentException("File not found in this company.");
                    }
                    String job = UUID.randomUUID().toString();
                    store.insert("processing-jobs", AiKnowledgeService.map(
                            "id", job, "company_id", company,
                            "file_id", file, "status", "queued"));
                    if (store.failJob) {
                        throw new IllegalStateException(
                                "Simulated job registration failure");
                    }
                    return job;
                }
            };
            return new AiKnowledgeService(store, new AiKnowledgeAccess(
                    "merchant-test", "company-j1=admin,company-j2=editor,company-retail=admin,company-wholesale=viewer",
                    "company-j1"), processing);
        }
    }

    static JsonNode body(String value) {
        return JSON.readTree(value);
    }

    static String id(Map<String, Object> value) {
        return (String) value.get("id");
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> items(Map<String, Object> result, String key) {
        return (List<Map<String, Object>>) result.get(key);
    }

    static void check(boolean result, String message) {
        if (!result)
            throw new AssertionError(message);
    }

    static void expect(int status, Runnable action) {
        try {
            action.run();
            throw new AssertionError("Expected HTTP " + status);
        } catch (ResponseStatusException error) {
            check(error.getStatusCode().value() == status, "Wrong HTTP status: " + error);
        }
    }

    public static void main(String[] args) {
        try (var context = new AnnotationConfigApplicationContext(Config.class)) {
            var service = context.getBean(AiKnowledgeService.class);
            var store = context.getBean(Store.class);
            String j1 = "company-j1", j2 = "company-j2", retail = "company-retail";
            var base = service.createBase(j1, body("{\"name\":\"HR knowledge\",\"agentIds\":[\"company-j1-agent\"]}"));
            String baseId = id(base);
            var doc = service.addDocument(j1, baseId, body("{\"title\":\"Policy\",\"agentIds\":[]}"), "policy.txt",
                    "text/plain", "policy bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            var detail = service.detail(j1, baseId);
            var effective = items(detail, "effective").getFirst();
            check(effective.get("source").equals("document") && effective.get("agentIds").equals(List.of()),
                    "Explicit empty override lost");
            service.setDocumentAgents(j1, id(doc), body("{\"agentIds\":null}"));
            check(items(service.detail(j1, baseId), "effective").getFirst().get("agentIds")
                    .equals(List.of(j1 + "-agent")), "Default inheritance lost");
            expect(404, () -> service.detail(j2, baseId));
            expect(403, () -> service.createBase("company-wholesale", body("{\"name\":\"No write\"}")));
            expect(403, () -> service.listBases("unknown-company"));
            expect(400, () -> service.setBaseAgents(j1, baseId, body("{\"agentIds\":[\"company-j2-agent\"]}")));
            expect(409, () -> service.updateBase(j1, baseId, body("{\"name\":\"Stale\",\"version\":999}")));
            var promoted = service.promote(j1,
                    body("{\"baseId\":\"" + baseId + "\",\"allowedCompanyIds\":[\"company-j2\"]}"));
            String template = (String) promoted.get("templateId");
            check(items(service.templates(j2, false), "items").size() == 1, "Recipient cannot see persisted template");
            var templateRow = items(service.templates(j2, false), "items").getFirst();
            check(Boolean.FALSE.equals(templateRow.get("canEdit"))
                    && Boolean.FALSE.equals(templateRow.get("canDelete")), "Recipient can edit owner template");
            expect(403, () -> service.promote(j2, body("{\"baseId\":\"" + baseId + "\"}")));
            expect(403, () -> service.editTemplate(j2, template, body("{\"name\":\"Wrong owner\"}")));
            expect(403, () -> service.adopt(retail, body("{\"templateId\":\"" + template + "\"}")));
            var adoption = service.adopt(j2, body("{\"templateId\":\"" + template + "\"}"));
            String copy = (String) adoption.get("baseId");
            var copyDetail = service.detail(j2, copy);
            var copiedDoc = items(copyDetail, "documents").getFirst();
            check(!copy.equals(baseId) && !copiedDoc.get("id").equals(doc.get("id")), "Adoption reused original IDs");
            check(copyDetail.get("baseAgentIds").equals(List.of()), "Adoption leaked original Agent links");
            String url = (String) copiedDoc.get("fileUrl");
            String file = url.substring(url.lastIndexOf('/') + 1, url.indexOf('?'));
            check(new String(service.file(j2, file).content(), java.nio.charset.StandardCharsets.UTF_8)
                    .equals("policy bytes"), "File copy lost");
            expect(404, () -> service.file(j1, file));
            service.setBaseAgents(j2, copy, body("{\"agentIds\":[\"company-j2-agent\"]}"));
            check(service.detail(j2, copy).get("baseAgentIds").equals(List.of(j2 + "-agent")),
                    "Receiving Agent binding not stored");
            service.updateBase(j1, baseId, body("{\"name\":\"Changed original\"}"));
            check(((Map<?, ?>) service.detail(j2, copy).get("base")).get("name").equals("HR knowledge"),
                    "Adopted copy is not independent");
            var privateBase = service.createBase(retail, body("{\"name\":\"Private\"}"));
            service.promote(retail, body("{\"baseId\":\"" + id(privateBase) + "\"}"));
            check(items(service.templates(j1, true), "items").size() == 1,
                    "Overseer saw another company's private template");
            service.promote(retail,
                    body("{\"baseId\":\"" + id(privateBase) + "\",\"allowedCompanyIds\":[\"company-j2\"]}"));
            check(items(service.templates(j1, true), "items").size() == 2
                    && items(service.templates(j1, false), "items").size() == 1,
                    "Oversight changed adopt authorization");
            String sharedForeign = items(service.templates(j1, true), "items").stream()
                    .filter(r -> retail.equals(r.get("ownerCompanyId"))).findFirst().orElseThrow().get("id").toString();
            expect(403, () -> service.adopt(j1, body("{\"templateId\":\"" + sharedForeign + "\"}")));
            int rows = store.rows.size(), files = store.files.size(), links = store.links.size();
            store.failVisibility = true;
            try {
                service.promote(j1, body("{\"baseId\":\"" + baseId + "\"}"));
                throw new AssertionError("Expected visibility failure");
            } catch (IllegalStateException expected) {
            }
            check(store.rows.size() == rows && store.files.size() == files, "Promote did not roll back template/files");
            store.failVisibility = false;
            store.failFile = true;
            try {
                service.adopt(j2, body("{\"templateId\":\"" + template + "\"}"));
                throw new AssertionError("Expected copy failure");
            } catch (IllegalStateException expected) {
            }
            check(store.rows.size() == rows && store.files.size() == files && store.links.size() == links,
                    "Adopt did not roll back base/documents/bindings");
            store.failFile = false;
            for (String kind : List.of("skill", "data")) {
                var contentBase = service.createBase(j1, body("{\"name\":\"Content\",\"kind\":\"" + kind + "\"}"));
                String contentId = id(contentBase);
                String entity = kind.equals("skill") ? "skills" : "data-sources";
                var content = service.addContentWithFile(entity, j1, contentId,
                        body(kind.equals("skill") ? "{\"name\":\"Lookup\",\"inputSchema\":{\"id\":\"string\"}}"
                                : "{\"name\":\"API\",\"kind\":\"api\",\"config\":{\"url\":\"https://example.test\"}}"),
                        "spec.txt", "text/plain", "spec bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8));
                service.contentMode(entity, j1, id(content), body("{\"mode\":\"paused\"}"));
                var snap = service.promote(j1,
                        body("{\"baseId\":\"" + contentId + "\",\"allowedCompanyIds\":[\"company-j2\"]}"));
                var used = service.adopt(j2, body("{\"templateId\":\"" + snap.get("templateId") + "\"}"));
                var contents = items(service.detail(j2, (String) used.get("baseId")),
                        kind.equals("skill") ? "skills" : "dataSources");
                check(contents.size() == 1 && contents.getFirst().get("mode").equals("paused"),
                        "Content metadata/mode lost");
                String attachment = store.contentFiles(entity, j2, id(contents.getFirst())).getFirst();
                check(new String(service.file(j2, attachment).content(), java.nio.charset.StandardCharsets.UTF_8)
                        .equals("spec bytes"), "Skill/Data Source attachment copy lost");
            }
            System.out.println(
                    "PASS: stored Knowledge/Templates, empty overrides, company roles, recipient-only use, private template exclusion, independent copies/files, receiving Agent binding, stale versions and Spring Promote/Adopt rollback. Simulated SQL; no MySQL calls.");
        }
    }
}
