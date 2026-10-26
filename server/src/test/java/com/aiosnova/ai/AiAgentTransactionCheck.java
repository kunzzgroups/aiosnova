package com.aiosnova.ai;

import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;

import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Explicit opt-in local MySQL check. Not run by normal test-compile or test. */
public class AiAgentTransactionCheck {
    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    static class TestConfiguration {
        @Bean DataSource dataSource() {
            String password = System.getenv("AI_DB_PASSWORD");
            if (password == null || password.isBlank()) {
                throw new IllegalStateException("Set AI_DB_PASSWORD in this terminal first.");
            }
            // Fixed local test target; no production URL or application secrets are loaded.
            return new DriverManagerDataSource(
                    "jdbc:mysql://127.0.0.1:3307/aiosnova_ai_local?characterEncoding=UTF-8",
                    "ai_app", password);
        }
        @Bean JdbcTemplate jdbcTemplate(DataSource dataSource) { return new JdbcTemplate(dataSource); }
        @Bean DataSourceTransactionManager transactionManager(DataSource dataSource) {
            return new DataSourceTransactionManager(dataSource);
        }
        @Bean FailingBindingRepository repository(JdbcTemplate jdbc) { return new FailingBindingRepository(jdbc); }
        @Bean AiAgentService service(FailingBindingRepository repository) { return new AiAgentService(repository); }
    }

    static class FailingBindingRepository extends AiAgentRepository {
        boolean failAfterBindings;
        boolean reachedDatabaseFailure;
        FailingBindingRepository(JdbcTemplate jdbc) { super(jdbc); }

        @Override public void insertKnowledgeBaseBindings(String companyId, String agentId, List<String> ids) {
            check(TransactionSynchronizationManager.isActualTransactionActive(), "No Spring transaction is active.");
            super.insertKnowledgeBaseBindings(companyId, agentId, ids);
            if (failAfterBindings) {
                reachedDatabaseFailure = true;
                // Both valid links were already written. MySQL rejects this duplicate PK.
                super.insertKnowledgeBaseBindings(companyId, agentId, List.of(ids.getFirst()));
            }
        }
    }

    public static void main(String[] args) {
        if (!"true".equals(System.getenv("AI_RUN_AGENT_DB_CHECK"))) {
            throw new IllegalStateException("Set AI_RUN_AGENT_DB_CHECK=true to opt in to local database writes.");
        }
        String company = "tx-check-" + UUID.randomUUID();
        String successId = "agent-" + UUID.randomUUID();
        String failureId = "agent-" + UUID.randomUUID();
        var ids = List.of("kb-test-a", "kb-test-b");
        try (var context = new AnnotationConfigApplicationContext(TestConfiguration.class)) {
            var jdbc = context.getBean(JdbcTemplate.class);
            var repository = context.getBean(FailingBindingRepository.class);
            var service = context.getBean(AiAgentService.class);
            try {
                var saved = service.saveNew(agent(company, successId), ids);
                check(saved.agent().knowledgeBaseCount() == 2, "Returned binding count is incorrect.");
                // These queries happen AFTER the proxied Service returns/commits.
                check(count(jdbc, "ai_agents", company, successId) == 1, "Agent was not committed.");
                check(count(jdbc, "ai_agent_knowledge_bases", company, successId) == 2, "Bindings were not committed.");
                check(service.get(company, successId).knowledgeBaseIds().equals(ids), "Saved binding IDs differ.");
                check(service.get(company, successId).agent().model().temperature() == 0.3, "Temperature differs.");
                System.out.println("PASS: committed Agent=1, bindings=2; configuration and IDs preserved.");

                repository.failAfterBindings = true;
                try {
                    service.saveNew(agent(company, failureId), ids);
                    throw new AssertionError("Expected a real MySQL duplicate-key failure.");
                } catch (DuplicateKeyException expected) {
                    check(repository.reachedDatabaseFailure, "Failure occurred before binding writes.");
                }
                check(count(jdbc, "ai_agents", company, failureId) == 0, "Agent was not rolled back.");
                check(count(jdbc, "ai_agent_knowledge_bases", company, failureId) == 0, "Bindings were not rolled back.");
                check(count(jdbc, "ai_agents", company, successId) == 1, "Rollback affected the earlier committed Agent.");
                System.out.println("PASS: real binding failure rolled back Agent=0 and bindings=0.");
            } finally {
                jdbc.update("DELETE FROM ai_agent_knowledge_bases WHERE company_id = ? AND agent_id IN (?, ?)",
                        company, successId, failureId);
                jdbc.update("DELETE FROM ai_agents WHERE company_id = ? AND id IN (?, ?)", company, successId, failureId);
                check(count(jdbc, "ai_agents", company, successId) + count(jdbc, "ai_agents", company, failureId) == 0,
                        "Agent cleanup failed.");
                check(count(jdbc, "ai_agent_knowledge_bases", company, successId)
                        + count(jdbc, "ai_agent_knowledge_bases", company, failureId) == 0, "Binding cleanup failed.");
                System.out.println("PASS: test records cleaned up.");
            }
        }
    }

    private static AiAgentRepository.NewAgent agent(String company, String id) {
        return new AiAgentRepository.NewAgent(id, company, "tx-check-merchant", "Transaction check",
                "Temporary integration test", "Test", "active", null, null, 0.3, 1, 2048);
    }

    private static int count(JdbcTemplate jdbc, String table, String company, String id) {
        // Table names are fixed test constants, never external input.
        String idColumn = table.equals("ai_agents") ? "id" : "agent_id";
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE company_id = ? AND "
                + idColumn + " = ?", Integer.class, company, id);
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
