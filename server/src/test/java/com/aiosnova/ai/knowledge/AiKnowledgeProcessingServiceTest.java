package com.aiosnova.ai.knowledge;

import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.annotation.*;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.*;

import static org.junit.jupiter.api.Assertions.*;

class AiKnowledgeProcessingServiceTest {

    static final String COMPANY = "company-j1";
    static final String JOB = "job-test";
    static final String FILE = "file-test";
    static final String DOCUMENT = "document-test";

    static final AiKnowledgeProcessingRepository.Claim VALID =
            new AiKnowledgeProcessingRepository.Claim(
                    JOB, COMPANY, "current-token");

    static class State {
        String jobStatus = "running";
        String documentStatus = "processing";
        String token = "current-token";
        long documentVersion = 7;

        boolean leaseValid = true;
        boolean failDocument;
        int jobWrites;
        int documentWrites;

        // 用来确认失败时没有改变其他配置。
        String assignmentMode = "override";
        String agentBinding = "agent-original";
    }

    record Snapshot(
            String jobStatus,
            String documentStatus,
            String token,
            long documentVersion) {
    }

    static class Transactions extends AbstractPlatformTransactionManager {
        private final State state;

        Transactions(State state) {
            this.state = state;
        }

        @Override
        protected Object doGetTransaction() {
            return new Snapshot(
                    state.jobStatus,
                    state.documentStatus,
                    state.token,
                    state.documentVersion);
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
        protected void doRollback(DefaultTransactionStatus status) {
            var snapshot = (Snapshot) status.getTransaction();
            state.jobStatus = snapshot.jobStatus();
            state.documentStatus = snapshot.documentStatus();
            state.token = snapshot.token();
            state.documentVersion = snapshot.documentVersion();
        }
    }

    static void requireTransaction() {
        assertTrue(
                TransactionSynchronizationManager
                        .isActualTransactionActive(),
                "Expected an active Spring transaction");
    }

    static class Jobs extends AiKnowledgeProcessingRepository {
        private final State state;

        Jobs(State state) {
            super(null);
            this.state = state;
        }

        @Override
        public Optional<Job> find(String company, String job) {
            requireTransaction();

            if (!COMPANY.equals(company) || !JOB.equals(job)) {
                return Optional.empty();
            }

            return Optional.of(
                    new Job(JOB, COMPANY, FILE, state.jobStatus, 1, 3));
        }

        @Override
        public Optional<String> findDocumentId(
                String company, String file) {
            requireTransaction();

            return COMPANY.equals(company) && FILE.equals(file)
                    ? Optional.of(DOCUMENT)
                    : Optional.empty();
        }

        @Override
        public boolean fail(Claim claim) {
            requireTransaction();

            if (!COMPANY.equals(claim.companyId())
                    || !JOB.equals(claim.jobId())
                    || !"running".equals(state.jobStatus)
                    || !state.leaseValid
                    || !claim.token().equals(state.token)) {
                return false;
            }

            state.jobWrites++;
            state.jobStatus = "failed";
            state.token = null;
            return true;
        }
    }

    static class Knowledge extends AiKnowledgeRepository {
        private final State state;

        Knowledge(State state) {
            super(null);
            this.state = state;
        }

        @Override
        public void update(
                String entity,
                String company,
                String id,
                Map<String, Object> fields) {

            requireTransaction();

            assertEquals("documents", entity);
            assertEquals(COMPANY, company);
            assertEquals(DOCUMENT, id);
            assertEquals(Map.of("status", "failed"), fields);

            // 这里必须已经更新过任务。
            assertEquals("failed", state.jobStatus);

            state.documentWrites++;
            state.documentStatus = "failed";
            state.documentVersion++;

            // 故意在模拟写入后失败，验证全部恢复。
            if (state.failDocument) {
                throw new IllegalStateException(
                        "Simulated document update failure");
            }
        }
    }

    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    static class Config {
        @Bean
        State state() {
            return new State();
        }

        @Bean
        Transactions transactionManager(State state) {
            return new Transactions(state);
        }

        @Bean
        Jobs jobs(State state) {
            return new Jobs(state);
        }

        @Bean
        Knowledge knowledge(State state) {
            return new Knowledge(state);
        }

        @Bean
        AiKnowledgeProcessingService service(
                Jobs jobs, Knowledge knowledge) {
            return new AiKnowledgeProcessingService(jobs, knowledge);
        }
    }

    @Test
    void taskAndDocumentFailTogether() {
        try (var context =
                     new AnnotationConfigApplicationContext(Config.class)) {
            var state = context.getBean(State.class);
            var service = context.getBean(
                    AiKnowledgeProcessingService.class);

            assertTrue(AopUtils.isAopProxy(service));
            assertTrue(service.fail(VALID));

            assertEquals("failed", state.jobStatus);
            assertEquals("failed", state.documentStatus);
            assertNull(state.token);
            assertEquals(8, state.documentVersion);
            assertEquals(1, state.jobWrites);
            assertEquals(1, state.documentWrites);
            assertEquals("override", state.assignmentMode);
            assertEquals("agent-original", state.agentBinding);
        }
    }

    @Test
    void documentFailureRollsBackBothUpdates() {
        try (var context =
                     new AnnotationConfigApplicationContext(Config.class)) {
            var state = context.getBean(State.class);
            var service = context.getBean(
                    AiKnowledgeProcessingService.class);

            state.failDocument = true;

            assertThrows(
                    IllegalStateException.class,
                    () -> service.fail(VALID));

            assertEquals("running", state.jobStatus);
            assertEquals("processing", state.documentStatus);
            assertEquals("current-token", state.token);
            assertEquals(7, state.documentVersion);

            // 观测计数不回滚，证明两步写入确实尝试过。
            assertEquals(1, state.jobWrites);
            assertEquals(1, state.documentWrites);
            assertEquals("override", state.assignmentMode);
            assertEquals("agent-original", state.agentBinding);
        }
    }

    @Test
    void staleTokenAndExpiredLeaseCannotUpdateDocument() {
        try (var context =
                     new AnnotationConfigApplicationContext(Config.class)) {
            var state = context.getBean(State.class);
            var service = context.getBean(
                    AiKnowledgeProcessingService.class);

            var oldClaim = new AiKnowledgeProcessingRepository.Claim(
                    JOB, COMPANY, "old-token");

            assertFalse(service.fail(oldClaim));

            state.leaseValid = false;
            assertFalse(service.fail(VALID));

            assertEquals("running", state.jobStatus);
            assertEquals("processing", state.documentStatus);
            assertEquals("current-token", state.token);
            assertEquals(7, state.documentVersion);
            assertEquals(0, state.jobWrites);
            assertEquals(0, state.documentWrites);
        }
    }

    @Test
    void otherCompanyCannotUpdateTaskOrDocument() {
        try (var context =
                     new AnnotationConfigApplicationContext(Config.class)) {
            var state = context.getBean(State.class);
            var service = context.getBean(
                    AiKnowledgeProcessingService.class);

            var foreignClaim =
                    new AiKnowledgeProcessingRepository.Claim(
                            JOB, "company-j2", "current-token");

            assertFalse(service.fail(foreignClaim));

            assertEquals("running", state.jobStatus);
            assertEquals("processing", state.documentStatus);
            assertEquals("current-token", state.token);
            assertEquals(7, state.documentVersion);
            assertEquals(0, state.jobWrites);
            assertEquals(0, state.documentWrites);
        }
    }
}
