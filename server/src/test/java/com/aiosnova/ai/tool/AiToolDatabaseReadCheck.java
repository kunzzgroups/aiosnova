package com.aiosnova.ai.tool;

import com.aiosnova.ai.tool.builtin.CalculatorTool;

import java.sql.DriverManager;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.web.server.ResponseStatusException;

public final class AiToolDatabaseReadCheck {

    public static void main(String[] args) throws Exception {
        if (!"true".equals(
                System.getenv("AI_RUN_TOOL_DB_READ_CHECK"))) {
            throw new IllegalStateException(
                    "Explicit opt-in is required.");
        }

        String password = System.getenv("AI_DB_PASSWORD");

        if (password == null || password.isBlank()) {
            throw new IllegalStateException(
                    "Set AI_DB_PASSWORD in this terminal.");
        }

        // Fixed local target. No application configuration is loaded.
        String url =
                "jdbc:mysql://127.0.0.1:3307/aiosnova_ai_local"
                + "?characterEncoding=UTF-8"
                + "&connectionTimeZone=UTC"
                + "&forceConnectionTimeZoneToSession=true";

        try (var connection = DriverManager.getConnection(
                url, "ai_app", password)) {

            connection.setReadOnly(true);
            connection.setAutoCommit(false);

            try {
                // Enforce a server-side read-only transaction.
                try (var statement = connection.createStatement()) {
                    statement.execute("SET TRANSACTION READ ONLY");
                }

                var jdbc = new JdbcTemplate(
                        new SingleConnectionDataSource(
                                connection, true));

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

                Long toolCount = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM ai_tools", Long.class);

                Long bindingCount = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM ai_agent_tools", Long.class);

                check(
                        Long.valueOf(0).equals(toolCount)
                                && Long.valueOf(0).equals(bindingCount),
                        "This initial empty-table check expects "
                                + "zero tools and zero bindings. "
                                + "Do not delete existing data.");

                System.out.println(
                        "PASS: local database confirmed; "
                                + "tools=0, bindings=0.");

                var agents = jdbc.query(
                        """
                        SELECT company_id, merchant_id, id, status
                        FROM ai_agents
                        ORDER BY company_id, id
                        LIMIT 1
                        """,
                        (rs, row) -> new AiToolRepository.AgentScope(
                                rs.getString("company_id"),
                                rs.getString("merchant_id"),
                                rs.getString("id"),
                                rs.getString("status")));

                check(
                        !agents.isEmpty(),
                        "No existing Agent is available. "
                                + "Agent-scope checks cannot run yet; "
                                + "do not insert data for this check.");

                var expected = agents.getFirst();

                String company = expected.companyId();
                String merchant = expected.merchantId();
                String agentId = expected.agentId();

                var repository = new AiToolRepository(jdbc);

                var actual = repository.findAgent(
                        company, merchant, agentId).orElseThrow();

                check(
                        expected.equals(actual),
                        "Agent field mapping or scope mismatch.");

                check(
                        repository.findBoundActions(
                                company, merchant, agentId).isEmpty(),
                        "Unexpected bindings.");

                check(
                        repository.findTools(
                                company, merchant).isEmpty(),
                        "Unexpected tools.");

                System.out.println(
                        "PASS: actual Repository SQL and "
                                + "existing Agent mapping.");

                String absentCompany =
                        "read-check-" + UUID.randomUUID();

                String absentMerchant =
                        "read-check-" + UUID.randomUUID();

                check(
                        repository.findAgent(
                                company, absentMerchant, agentId).isEmpty(),
                        "Agent leaked across Merchant scope.");

                check(
                        repository.findAgent(
                                absentCompany, merchant, agentId).isEmpty(),
                        "Agent leaked across company scope.");

                check(
                        repository.findBoundActions(
                                company, absentMerchant, agentId).isEmpty(),
                        "Unexpected cross-Merchant bindings.");

                check(
                        repository.findTools(
                                company, absentMerchant).isEmpty(),
                        "Unexpected cross-Merchant tools.");

                System.out.println(
                        "PASS: existing Agent is not returned "
                                + "under a different company or Merchant.");

                var source = new AiToolDatabaseSource(
                        repository, merchant);

                var grant = source.findAgent(
                        company, agentId).orElseThrow();

                check(
                        company.equals(grant.companyId())
                                && agentId.equals(grant.agentId()),
                        "Source returned incorrect Agent identity.");

                check(
                        grant.active()
                                == "active".equals(expected.status()),
                        "Source returned incorrect Agent status.");

                check(
                        grant.allowedActions().isEmpty(),
                        "Source invented tool assignments.");

                check(
                        source.findTools(company).isEmpty(),
                        "Source invented company tools.");

                var otherMerchantSource =
                        new AiToolDatabaseSource(
                                repository, absentMerchant);

                check(
                        otherMerchantSource.findAgent(
                                company, agentId).isEmpty(),
                        "Source leaked an Agent across Merchants.");

                System.out.println(
                        "PASS: database Source reads Agent status "
                                + "and empty assignments.");

                var authorization = new AiToolAuthorizationService(
                        source,
                        List.of(new AiToolRegistry.Registration(
                                "calculator",
                                new CalculatorTool())));

                try {
                    authorization.authorize(company, agentId);

                    throw new AssertionError(
                            "An Agent without bindings was authorized.");

                } catch (ResponseStatusException error) {
                    check(
                            error.getStatusCode().value() == 403,
                            "Expected authorization denial with 403.");
                }

                System.out.println(
                        "PASS: no bindings means authorization denied.");

            } finally {
                connection.rollback();
            }
        }

        System.out.println(
                "PASS: read-only check completed. "
                        + "No rows written and no models called.");
    }

    private static void check(
            boolean condition,
            String message) {

        if (!condition) {
            throw new AssertionError(message);
        }
    }
}