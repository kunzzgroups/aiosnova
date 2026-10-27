package com.aiosnova.ai.tool;

import com.aiosnova.ai.tool.builtin.CalculatorTool;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import javax.sql.DataSource;

import org.springframework.aop.support.AopUtils;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.json.JsonMapper;

/**
 * Explicit local MySQL write check.
 * Not executed by normal Maven/JUnit tests.
 */
public class AiToolTransactionCheck {

    private static final String RUN = UUID.randomUUID().toString();

    private static final String MERCHANT = "tool-tx-" + RUN;
    private static final String SUCCESS_COMPANY = "tool-ok-" + RUN;
    private static final String FAILURE_COMPANY = "tool-fail-" + RUN;

    private static final List<String> SUCCESS_AGENTS = List.of(
            UUID.randomUUID().toString(),
            UUID.randomUUID().toString());

    private static final List<String> FAILURE_AGENTS = List.of(
            UUID.randomUUID().toString(),
            UUID.randomUUID().toString());

    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    static class TestConfiguration {

        @Bean
        DataSource dataSource() {
            String password = System.getenv("AI_DB_PASSWORD");

            if (password == null || password.isBlank()) {
                throw new IllegalStateException(
                        "Set the local AI_DB_PASSWORD first.");
            }

            return new DriverManagerDataSource(
                    "jdbc:mysql://127.0.0.1:3307/aiosnova_ai_local"
                            + "?characterEncoding=UTF-8"
                            + "&connectionTimeZone=UTC"
                            + "&forceConnectionTimeZoneToSession=true",
                    "ai_app",
                    password);
        }

        @Bean
        JdbcTemplate jdbcTemplate(DataSource dataSource) {
            return new JdbcTemplate(dataSource);
        }

        @Bean
        DataSourceTransactionManager transactionManager(
                DataSource dataSource) {
            return new DataSourceTransactionManager(dataSource);
        }

        @Bean
        FailingBindingRepository repository(JdbcTemplate jdbc) {
            return new FailingBindingRepository(jdbc);
        }

        @Bean
        AiToolWriteService toolWriteService(
                FailingBindingRepository repository) {
            return new AiToolWriteService(repository, MERCHANT);
        }
    }

    static class FailingBindingRepository extends AiToolRepository {

        boolean failAfterBindings;
        boolean reachedDuplicateInsert;

        FailingBindingRepository(JdbcTemplate jdbc) {
            super(jdbc);
        }

        @Override
        public void insertAgentBindings(
                String companyId,
                String toolId,
                List<String> agentIds) {

            check(
                    TransactionSynchronizationManager
                            .isActualTransactionActive(),
                    "Binding writes have no active Spring transaction.");

            // Real SQL: successfully insert the two bindings first.
            super.insertAgentBindings(companyId, toolId, agentIds);

            if (failAfterBindings) {
                check(!agentIds.isEmpty(), "Missing failure-test Agent.");

                reachedDuplicateInsert = true;

                // Real MySQL duplicate primary key, not a simulated exception.
                super.insertAgentBindings(
                        companyId,
                        toolId,
                        List.of(agentIds.getFirst()));

                throw new AssertionError(
                        "Expected duplicate binding to fail.");
            }
        }
    }

    public static void main(String[] args) {
        if (!"true".equals(
                System.getenv("AI_RUN_TOOL_DB_TX_CHECK"))) {
            throw new IllegalStateException(
                    "Explicit database write-test opt-in is required.");
        }

        try (var context = new AnnotationConfigApplicationContext(
                TestConfiguration.class)) {

            var jdbc = context.getBean(JdbcTemplate.class);
            var repository = context.getBean(FailingBindingRepository.class);
            var service = context.getBean(AiToolWriteService.class);

            check(
                    "aiosnova_ai_local".equals(
                            jdbc.queryForObject(
                                    "SELECT DATABASE()", String.class)),
                    "Unexpected database.");

            check(
                    Integer.valueOf(3307).equals(
                            jdbc.queryForObject(
                                    "SELECT @@port", Integer.class)),
                    "Unexpected MySQL port.");

            check(
                    AopUtils.isAopProxy(service),
                    "Service is not using a Spring transaction proxy.");

            // Check before entering cleanup scope, so a collision cannot
            // cause existing data to be deleted.
            requireEmptyScope(jdbc, SUCCESS_COMPANY);
            requireEmptyScope(jdbc, FAILURE_COMPANY);

            try {
                insertAgents(jdbc, SUCCESS_COMPANY, SUCCESS_AGENTS);
                insertAgents(jdbc, FAILURE_COMPANY, FAILURE_AGENTS);

                var saved = service.create(
                        request(SUCCESS_COMPANY, SUCCESS_AGENTS));

                // These reads occur after the proxied call has committed.
                check(
                        count(jdbc, "ai_tools", SUCCESS_COMPANY) == 1,
                        "Tool was not committed.");

                check(
                        count(jdbc, "ai_agent_tools", SUCCESS_COMPANY) == 2,
                        "Both bindings were not committed.");

                check(saved.version() == 0L, "Unexpected initial version.");

                check(
                        saved.agentIds().equals(
                                SUCCESS_AGENTS.stream().sorted().toList()),
                        "Returned Agent IDs changed.");

                var tool = repository.findTools(
                        SUCCESS_COMPANY, MERCHANT).getFirst();

                check(saved.id().equals(tool.id()), "Tool ID changed.");
                check(
                        "Transaction Calculator".equals(tool.name()),
                        "Tool name changed.");
                check(
                        "Temporary transaction check".equals(
                                tool.description()),
                        "Description changed.");
                check(
                        "Utility".equals(tool.module()),
                        "Module changed.");
                check(
                        "calc.run".equals(tool.action()),
                        "Action changed.");
                check(
                        "calculator".equals(tool.executorType()),
                        "Executor changed.");
                check(
                        "active".equals(tool.status()),
                        "Tool status changed.");
                check(
                        "low".equals(tool.risk())
                                && !tool.requiresConfirmation()
                                && tool.timeoutSeconds() == 30,
                        "Execution settings changed.");
                check(
                        "{}".equals(tool.configuration()),
                        "Configuration changed.");

                for (String agentId : SUCCESS_AGENTS) {
                    check(
                            repository.findBoundActions(
                                    SUCCESS_COMPANY,
                                    MERCHANT,
                                    agentId).equals(List.of("calc.run")),
                            "Stored binding differs.");
                }

                // Read database authorization only; no tool execution.
                var authorization = new AiToolAuthorizationService(
                        new AiToolDatabaseSource(repository, MERCHANT),
                        List.of(new AiToolRegistry.Registration(
                                "calculator",
                                new CalculatorTool())));

                check(
                        authorization.authorize(
                                SUCCESS_COMPANY,
                                SUCCESS_AGENTS.getFirst())
                                .functionNames().equals(Set.of("calc_run")),
                        "Committed database binding was not authorized.");

                System.out.println(
                        "PASS: committed tool=1, bindings=2; "
                                + "configuration, IDs and database authorization preserved.");

                repository.failAfterBindings = true;

                try {
                    service.create(
                            request(FAILURE_COMPANY, FAILURE_AGENTS));

                    throw new AssertionError(
                            "Expected a real duplicate-binding failure.");

                } catch (DuplicateKeyException expected) {
                    check(
                            repository.reachedDuplicateInsert,
                            "Failure occurred before the intended binding error.");
                }

                check(
                        count(jdbc, "ai_tools", FAILURE_COMPANY) == 0,
                        "Failed tool insert was not rolled back.");

                check(
                        count(jdbc, "ai_agent_tools", FAILURE_COMPANY) == 0,
                        "Failed binding writes were not rolled back.");

                check(
                        count(jdbc, "ai_tools", SUCCESS_COMPANY) == 1
                                && count(
                                        jdbc,
                                        "ai_agent_tools",
                                        SUCCESS_COMPANY) == 2,
                        "Rollback affected the earlier committed transaction.");

                System.out.println(
                        "PASS: real binding failure rolled back "
                                + "tool=0, bindings=0; earlier commit preserved.");

                checkEditingTransactions(
                        service,
                        repository,
                        saved.id());

            } finally {
                cleanup(jdbc, SUCCESS_COMPANY);
                cleanup(jdbc, FAILURE_COMPANY);

                requireEmptyScope(jdbc, SUCCESS_COMPANY);
                requireEmptyScope(jdbc, FAILURE_COMPANY);

                System.out.println(
                        "PASS: temporary tools, bindings and Agents cleaned up.");
            }
        }
    }

    private static AiToolWriteService.CreateRequest request(
            String company,
            List<String> agentIds) {

        return new AiToolWriteService.CreateRequest(
                company,
                "Transaction Calculator",
                "Temporary transaction check",
                "Utility",
                "calc.run",
                "calculator",
                "low",
                "active",
                30,
                false,
                "{}",
                agentIds);
    }

    private static void insertAgents(
            JdbcTemplate jdbc,
            String company,
            List<String> ids) {

        for (String id : ids) {
            jdbc.update(
                    """
                            INSERT INTO ai_agents (
                                id, company_id, merchant_id,
                                name, description, status
                            )
                            VALUES (?, ?, ?, ?, ?, ?)
                            """,
                    id,
                    company,
                    MERCHANT,
                    "Tool transaction test Agent",
                    "Temporary local test",
                    "active");
        }
    }

    private static void cleanup(
            JdbcTemplate jdbc,
            String company) {

        jdbc.update(
                "DELETE FROM ai_agent_tools WHERE company_id = ?",
                company);

        jdbc.update(
                "DELETE FROM ai_tools WHERE company_id = ?",
                company);

        jdbc.update(
                """
                        DELETE FROM ai_agents
                        WHERE company_id = ? AND merchant_id = ?
                        """,
                company,
                MERCHANT);
    }

    private static void requireEmptyScope(
            JdbcTemplate jdbc,
            String company) {

        check(
                count(jdbc, "ai_tools", company) == 0
                        && count(jdbc, "ai_agent_tools", company) == 0
                        && count(jdbc, "ai_agents", company) == 0,
                "Test scope is not empty: " + company);
    }

    private static long count(
            JdbcTemplate jdbc,
            String table,
            String company) {

        if (!Set.of(
                "ai_tools", "ai_agent_tools", "ai_agents").contains(table)) {
            throw new IllegalArgumentException("Unexpected test table.");
        }

        Long value = jdbc.queryForObject(
                "SELECT COUNT(*) FROM " + table + " WHERE company_id = ?",
                Long.class,
                company);

        return value == null ? 0 : value;
    }

    private static void check(
            boolean condition,
            String message) {

        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private record ToolSnapshot(
            AiToolRepository.ToolRow tool,
            List<String> agentIds) {

        private ToolSnapshot {
            agentIds = List.copyOf(agentIds);
        }
    }

    private static ToolSnapshot snapshot(
            AiToolRepository repository,
            String toolId) {

        var tool = repository.findTools(SUCCESS_COMPANY, MERCHANT)
                .stream()
                .filter(item -> toolId.equals(item.id()))
                .findFirst()
                .orElseThrow();

        return new ToolSnapshot(
                tool,
                repository.findBoundAgentIds(
                        SUCCESS_COMPANY, toolId));
    }

    private static void expectConflict(Runnable operation) {
        try {
            operation.run();
            throw new AssertionError("Expected a version conflict.");

        } catch (ResponseStatusException error) {
            check(
                    error.getStatusCode().value() == 409,
                    "Expected HTTP 409, got "
                            + error.getStatusCode().value());
        }
    }

    private static void expectBindingFailure(
            FailingBindingRepository repository,
            Runnable operation) {

        repository.failAfterBindings = true;
        repository.reachedDuplicateInsert = false;

        try {
            operation.run();

            throw new AssertionError(
                    "Expected a real duplicate-binding failure.");

        } catch (DuplicateKeyException expected) {
            check(
                    repository.reachedDuplicateInsert,
                    "Failure occurred before the intended SQL error.");

        } finally {
            repository.failAfterBindings = false;
        }
    }

    private static AiToolWriteService.CreateRequest editedRequest(
            String name,
            String configuration,
            List<String> agentIds) {

        return new AiToolWriteService.CreateRequest(
                SUCCESS_COMPANY,
                name,
                "Edited transaction-check description",
                "Utility",
                "calc.run",
                "calculator",
                "low",
                "active",
                30,
                false,
                configuration,
                agentIds);
    }

    private static void checkEditingTransactions(
            AiToolWriteService service,
            FailingBindingRepository repository,
            String toolId) {

        // The earlier create-rollback test left this flag enabled.
        repository.failAfterBindings = false;
        repository.reachedDuplicateInsert = false;

        List<String> bothAgents = SUCCESS_AGENTS.stream().sorted().toList();

        List<String> oneAgent = List.of(bothAgents.getFirst());

        var initial = snapshot(repository, toolId);

        check(initial.tool().version() == 0, "Expected initial version 0.");
        check(initial.agentIds().equals(bothAgents), "Initial bindings differ.");

        // 1. Configuration and bindings commit together: version 0 -> 1.
        var edited = service.update(
                toolId,
                0,
                editedRequest(
                        "Edited Calculator",
                        "{\"testLabel\":\"edited\"}",
                        oneAgent));

        var afterEdit = snapshot(repository, toolId);

        check(edited.version() == 1, "Returned edit version differs.");
        check(afterEdit.tool().version() == 1, "Stored edit version differs.");
        check(
                "Edited Calculator".equals(afterEdit.tool().name()),
                "Edited name was not saved.");
        check(
                "Edited transaction-check description".equals(
                        afterEdit.tool().description()),
                "Edited description was not saved.");
        check(
                new JsonMapper().readTree(afterEdit.tool().configuration())
                        .path("testLabel").asString().equals("edited"),
                "Edited JSON configuration was not saved.");
        check(
                afterEdit.agentIds().equals(oneAgent),
                "Edited bindings were not saved.");

        System.out.println(
                "PASS: configuration and replacement bindings committed; version=1.");

        // 2. Disable and re-enable without replacing bindings.
        var disabled = service.setEnabled(
                SUCCESS_COMPANY, toolId, false, 1);

        var afterDisable = snapshot(repository, toolId);

        check(disabled.version() == 2, "Disable version differs.");
        check(
                "disabled".equals(afterDisable.tool().status()),
                "Tool was not disabled.");
        check(afterDisable.tool().version() == 2, "Stored disable version differs.");
        check(
                afterDisable.agentIds().equals(oneAgent),
                "Disabling removed bindings.");
        check(
                afterDisable.tool().configuration().equals(
                        afterEdit.tool().configuration()),
                "Disabling changed configuration.");

        var enabled = service.setEnabled(
                SUCCESS_COMPANY, toolId, true, 2);

        var afterEnable = snapshot(repository, toolId);

        check(enabled.version() == 3, "Enable version differs.");
        check(
                "active".equals(afterEnable.tool().status()),
                "Tool was not enabled.");
        check(afterEnable.tool().version() == 3, "Stored enable version differs.");
        check(
                afterEnable.agentIds().equals(oneAgent),
                "Enabling changed bindings.");

        System.out.println(
                "PASS: disable/re-enable preserved configuration and bindings.");

        // 3. Replace, explicitly clear, then restore bindings.
        service.replaceAgentBindings(
                SUCCESS_COMPANY, toolId, 3, bothAgents);

        var replaced = snapshot(repository, toolId);
        check(replaced.tool().version() == 4, "Replacement version differs.");
        check(replaced.agentIds().equals(bothAgents), "Replacement failed.");

        service.replaceAgentBindings(
                SUCCESS_COMPANY, toolId, 4, List.of());

        var cleared = snapshot(repository, toolId);
        check(cleared.tool().version() == 5, "Clear version differs.");
        check(cleared.agentIds().isEmpty(), "Bindings were not cleared.");
        check(
                cleared.tool().configuration().equals(
                        afterEdit.tool().configuration()),
                "Clearing bindings changed configuration.");

        service.replaceAgentBindings(
                SUCCESS_COMPANY, toolId, 5, bothAgents);

        var baseline = snapshot(repository, toolId);
        check(baseline.tool().version() == 6, "Restored version differs.");
        check(baseline.agentIds().equals(bothAgents), "Bindings not restored.");

        System.out.println(
                "PASS: replacement and explicit clearing incremented versions.");

        // 4. All three edit operations reject stale version 0.
        expectConflict(() -> service.update(
                toolId,
                0,
                editedRequest("Stale edit", "{}", oneAgent)));

        check(
                baseline.equals(snapshot(repository, toolId)),
                "Stale configuration edit changed data.");

        expectConflict(() -> service.setEnabled(
                SUCCESS_COMPANY, toolId, false, 0));

        check(
                baseline.equals(snapshot(repository, toolId)),
                "Stale status edit changed data.");

        expectConflict(() -> service.replaceAgentBindings(
                SUCCESS_COMPANY, toolId, 0, List.of()));

        check(
                baseline.equals(snapshot(repository, toolId)),
                "Stale binding edit changed data.");

        System.out.println(
                "PASS: stale configuration/status/binding versions rejected with 409.");

        // 5. Fail after configuration update, old-binding deletion and new inserts.
        expectBindingFailure(
                repository,
                () -> service.update(
                        toolId,
                        6,
                        editedRequest(
                                "Must roll back",
                                "{\"testLabel\":\"must-not-survive\"}",
                                oneAgent)));

        check(
                baseline.equals(snapshot(repository, toolId)),
                "Failed edit did not restore configuration, version and bindings.");

        System.out.println(
                "PASS: failed configuration edit restored old fields, version and bindings.");

        // 6. Binding-only failure must also restore the old version and links.
        expectBindingFailure(
                repository,
                () -> service.replaceAgentBindings(
                        SUCCESS_COMPANY, toolId, 6, oneAgent));

        check(
                baseline.equals(snapshot(repository, toolId)),
                "Failed binding replacement did not restore old state.");

        System.out.println(
                "PASS: failed binding replacement restored old version and bindings.");
    }
}
