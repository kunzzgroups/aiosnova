package com.aiosnova.ai.knowledge;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.*;

import static org.junit.jupiter.api.Assertions.*;

class AiKnowledgeChunkRepositoryTest {

    static final String COMPANY = "company-j1";
    static final String DOCUMENT = "document-test";
    static final String FILE = "file-test";

    static class FakeJdbc extends JdbcTemplate {
        @Override public void afterPropertiesSet() { /* In-memory JDBC only. */ }

        List<List<Object>> rows = new ArrayList<>();
        int deletes;
        int inserts;
        boolean failSecondInsert;

        FakeJdbc() {
            rows.add(List.of(
                    "old-id", COMPANY, DOCUMENT, FILE,
                    0, "Old text", "Page 1"));
        }

        @Override
        public <T> T queryForObject(
                String sql,
                Class<T> requiredType,
                Object... args) {

            assertTrue(TransactionSynchronizationManager
                    .isActualTransactionActive());

            String normalized = normalize(sql);
            assertTrue(normalized.contains("from ai_knowledge_files"));
            assertTrue(normalized.contains(
                    "where company_id = ? and id = ? and document_id = ?"));

            boolean matches = Arrays.equals(
                    args, new Object[]{COMPANY, FILE, DOCUMENT});

            return requiredType.cast(matches ? 1 : 0);
        }

        @Override
        public int update(String sql, Object... args) {
            assertTrue(TransactionSynchronizationManager
                    .isActualTransactionActive());

            String normalized = normalize(sql);

            if (normalized.startsWith("delete ")) {
                assertTrue(normalized.contains(
                        "where company_id = ? and document_id = ? and file_id = ?"));
                assertEquals(
                        List.of(COMPANY, DOCUMENT, FILE),
                        Arrays.asList(args));

                deletes++;
                int count = rows.size();
                rows.clear();
                return count;
            }

            assertTrue(normalized.startsWith(
                    "insert into ai_knowledge_document_chunks"));
            assertEquals(7, args.length);
            assertEquals(COMPANY, args[1]);
            assertEquals(DOCUMENT, args[2]);
            assertEquals(FILE, args[3]);

            inserts++;

            if (failSecondInsert && inserts == 2) {
                throw new IllegalStateException(
                        "Simulated chunk insert failure");
            }

            rows.add(new ArrayList<>(Arrays.asList(args)));
            return 1;
        }

        static String normalize(String sql) {
            return sql.replaceAll("\\s+", " ")
                    .trim().toLowerCase(Locale.ROOT);
        }
    }

    static class Transactions extends AbstractPlatformTransactionManager {
        @Override protected void doSetRollbackOnly(DefaultTransactionStatus status) {
            // Tests propagate every inner exception to the outer transaction.
        }
        @Override protected boolean isExistingTransaction(Object transaction) {
            return TransactionSynchronizationManager.isActualTransactionActive();
        }

        private final FakeJdbc jdbc;

        Transactions(FakeJdbc jdbc) {
            this.jdbc = jdbc;
        }

        @Override
        protected Object doGetTransaction() {
            var snapshot = new ArrayList<List<Object>>();
            jdbc.rows.forEach(row ->
                    snapshot.add(new ArrayList<>(row)));
            return snapshot;
        }

        @Override
        protected void doBegin(
                Object transaction,
                TransactionDefinition definition) {
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        @SuppressWarnings("unchecked")
        protected void doRollback(DefaultTransactionStatus status) {
            jdbc.rows = (List<List<Object>>) status.getTransaction();
        }
    }

    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    static class Config {
        @Bean
        FakeJdbc jdbc() {
            return new FakeJdbc();
        }

        @Bean
        Transactions transactionManager(FakeJdbc jdbc) {
            return new Transactions(jdbc);
        }

        @Bean
        AiKnowledgeChunkRepository repository(FakeJdbc jdbc) {
            return new AiKnowledgeChunkRepository(jdbc);
        }
    }

    static List<AiKnowledgeChunkRepository.Chunk> chunks() {
        return List.of(
                new AiKnowledgeChunkRepository.Chunk(
                        "First text", "Page 1"),
                new AiKnowledgeChunkRepository.Chunk(
                        "Second text", null));
    }

    @Test
    void replacesOldChunksInOrder() {
        try (var context =
                     new AnnotationConfigApplicationContext(Config.class)) {
            var jdbc = context.getBean(FakeJdbc.class);
            var repository = context.getBean(
                    AiKnowledgeChunkRepository.class);
            var transaction = new TransactionTemplate(
                    context.getBean(Transactions.class));

            transaction.executeWithoutResult(status ->
                    repository.replace(
                            COMPANY, DOCUMENT, FILE, chunks()));

            assertEquals(1, jdbc.deletes);
            assertEquals(2, jdbc.inserts);
            assertEquals(2, jdbc.rows.size());

            assertEquals(0, jdbc.rows.get(0).get(4));
            assertEquals("First text", jdbc.rows.get(0).get(5));
            assertEquals("Page 1", jdbc.rows.get(0).get(6));

            assertEquals(1, jdbc.rows.get(1).get(4));
            assertEquals("Second text", jdbc.rows.get(1).get(5));
            assertNull(jdbc.rows.get(1).get(6));

            assertNotEquals(
                    jdbc.rows.get(0).get(0),
                    jdbc.rows.get(1).get(0));
        }
    }

    @Test
    void rejectsEmptyContentBeforeDeletingOldChunks() {
        try (var context =
                     new AnnotationConfigApplicationContext(Config.class)) {
            var jdbc = context.getBean(FakeJdbc.class);
            var repository = context.getBean(
                    AiKnowledgeChunkRepository.class);
            var transaction = new TransactionTemplate(
                    context.getBean(Transactions.class));

            var oldRows = new ArrayList<>(jdbc.rows);

            var invalid = List.of(
                    new AiKnowledgeChunkRepository.Chunk(
                            "Valid first chunk", null),
                    new AiKnowledgeChunkRepository.Chunk(
                            "   ", null));

            assertThrows(IllegalArgumentException.class, () ->
                    transaction.executeWithoutResult(status ->
                            repository.replace(
                                    COMPANY, DOCUMENT, FILE, invalid)));

            assertThrows(IllegalArgumentException.class, () ->
                    transaction.executeWithoutResult(status ->
                            repository.replace(
                                    COMPANY, DOCUMENT, FILE, List.of())));

            assertEquals(oldRows, jdbc.rows);
            assertEquals(0, jdbc.deletes);
            assertEquals(0, jdbc.inserts);
        }
    }

    @Test
    void rejectsWrongCompanyFileOrDocument() {
        try (var context =
                     new AnnotationConfigApplicationContext(Config.class)) {
            var jdbc = context.getBean(FakeJdbc.class);
            var repository = context.getBean(
                    AiKnowledgeChunkRepository.class);
            var transaction = new TransactionTemplate(
                    context.getBean(Transactions.class));

            var oldRows = new ArrayList<>(jdbc.rows);

            for (var scope : List.of(
                    List.of("company-j2", DOCUMENT, FILE),
                    List.of(COMPANY, "other-document", FILE),
                    List.of(COMPANY, DOCUMENT, "other-file"))) {

                assertThrows(IllegalArgumentException.class, () ->
                        transaction.executeWithoutResult(status ->
                                repository.replace(
                                        scope.get(0),
                                        scope.get(1),
                                        scope.get(2),
                                        chunks())));
            }

            assertEquals(oldRows, jdbc.rows);
            assertEquals(0, jdbc.deletes);
            assertEquals(0, jdbc.inserts);
        }
    }

    @Test
    void insertFailureRestoresOldChunks() {
        try (var context =
                     new AnnotationConfigApplicationContext(Config.class)) {
            var jdbc = context.getBean(FakeJdbc.class);
            var repository = context.getBean(
                    AiKnowledgeChunkRepository.class);
            var transaction = new TransactionTemplate(
                    context.getBean(Transactions.class));

            var oldRows = new ArrayList<>(jdbc.rows);
            jdbc.failSecondInsert = true;

            assertThrows(IllegalStateException.class, () ->
                    transaction.executeWithoutResult(status ->
                            repository.replace(
                                    COMPANY, DOCUMENT, FILE, chunks())));

            // 证明删除和第一块插入发生过，然后被事务恢复。
            assertEquals(1, jdbc.deletes);
            assertEquals(2, jdbc.inserts);
            assertEquals(oldRows, jdbc.rows);
        }
    }
}
