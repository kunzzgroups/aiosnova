package com.aiosnova.ai.knowledge;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import static org.junit.jupiter.api.Assertions.*;

class AiKnowledgeUploadTransactionTest {

    private static final String COMPANY = "company-j1";

    private static String createBase(AiKnowledgeService service) {
        return service.createBase(
                COMPANY,
                AiKnowledgePersistenceCheck.body("""
                        {
                          "name": "Upload test",
                          "agentIds": ["company-j1-agent"]
                        }
                        """))
                .get("id").toString();
    }

    @Test
    void fileUploadCreatesOneQueuedJob() {
        try (var context = new AnnotationConfigApplicationContext(
                AiKnowledgePersistenceCheck.Config.class)) {

            var service = context.getBean(AiKnowledgeService.class);
            var store = context.getBean(
                    AiKnowledgePersistenceCheck.Store.class);
            String baseId = createBase(service);

            var document = service.addDocument(
                    COMPANY,
                    baseId,
                    AiKnowledgePersistenceCheck.body("""
                            {"title":"Policy","agentIds":[]}
                            """),
                    "policy.txt",
                    "text/plain",
                    "Policy text".getBytes(StandardCharsets.UTF_8));

            assertEquals("processing", document.get("status"));
            assertEquals(1, store.files.size());

            var jobs = store.list("processing-jobs", COMPANY);
            assertEquals(1, jobs.size());

            var job = jobs.getFirst();
            assertEquals("queued", job.get("status"));
            assertEquals(COMPANY, job.get("company_id"));
            assertEquals(
                    store.files.keySet().iterator().next(),
                    job.get("file_id"));

            var detail = service.detail(COMPANY, baseId);
            var effective = AiKnowledgePersistenceCheck
                    .items(detail, "effective").getFirst();

            assertEquals("document", effective.get("source"));
            assertEquals(java.util.List.of(), effective.get("agentIds"));
        }
    }

    @Test
    void recordWithoutFileCreatesNoJob() {
        try (var context = new AnnotationConfigApplicationContext(
                AiKnowledgePersistenceCheck.Config.class)) {

            var service = context.getBean(AiKnowledgeService.class);
            var store = context.getBean(
                    AiKnowledgePersistenceCheck.Store.class);
            String baseId = createBase(service);

            var document = service.addDocument(
                    COMPANY,
                    baseId,
                    AiKnowledgePersistenceCheck.body("""
                            {"title":"Manual record"}
                            """),
                    null,
                    null,
                    null);

            assertEquals("ready", document.get("status"));
            assertTrue(store.files.isEmpty());
            assertTrue(store.list("processing-jobs", COMPANY).isEmpty());
        }
    }

    @Test
    void jobFailureRollsBackDocumentFileAndJob() {
        try (var context = new AnnotationConfigApplicationContext(
                AiKnowledgePersistenceCheck.Config.class)) {

            var service = context.getBean(AiKnowledgeService.class);
            var store = context.getBean(
                    AiKnowledgePersistenceCheck.Store.class);
            String baseId = createBase(service);

            var oldRows =
                    new LinkedHashMap<String, Map<String, Object>>();
            store.rows.forEach((key, value) ->
                    oldRows.put(key, new LinkedHashMap<>(value)));

            var oldLinks = new LinkedHashMap<>(store.links);
            var oldOverrides = new LinkedHashMap<>(store.overrides);
            var oldFiles = new LinkedHashMap<>(store.files);

            store.failJob = true;

            var error = assertThrows(
                    IllegalStateException.class,
                    () -> service.addDocument(
                            COMPANY,
                            baseId,
                            AiKnowledgePersistenceCheck.body("""
                                    {"title":"Must roll back","agentIds":[]}
                                    """),
                            "failure.txt",
                            "text/plain",
                            "Test text".getBytes(StandardCharsets.UTF_8)));

            assertEquals(
                    "Simulated job registration failure",
                    error.getMessage());

            assertEquals(oldRows, store.rows);
            assertEquals(oldLinks, store.links);
            assertEquals(oldOverrides, store.overrides);
            assertEquals(oldFiles, store.files);
            assertTrue(store.list("processing-jobs", COMPANY).isEmpty());
        }
    }
}
