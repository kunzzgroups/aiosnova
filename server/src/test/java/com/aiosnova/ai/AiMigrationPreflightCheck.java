package com.aiosnova.ai;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

/** Offline behavior checks. Fake SELECT results, no credentials or database writes. */
public class AiMigrationPreflightCheck {
    static class ReadOnlyJdbc extends JdbcTemplate {
        boolean conflict;
        List<Map<String, Object>> models = List.of();
        int queries;
        @Override public List<Map<String, Object>> queryForList(String sql, Object... args) {
            if (!sql.stripLeading().startsWith("SELECT")) throw new AssertionError("Non-read SQL");
            queries++;
            if (sql.contains("FROM ai_models")) return models;
            return conflict && sql.contains("FROM ai_agents") ? List.of(Map.of("id", "agent-a")) : List.of();
        }
    }
    public static void main(String[] args) {
        var jdbc = new ReadOnlyJdbc();
        var service = new AiMigrationPreflightService(jdbc);
        var targets = List.of(new AiMigrationPreflightService.Target("agent-a", "company-a"));
        var models = List.of(new AiMigrationPreflightService.ModelTarget("agent-a", "company-a", "provider-a", "config-a"));
        var request = new AiMigrationPreflightService.Request(targets, List.of(), List.of(), models);
        if (service.check(request).passed()) throw new AssertionError("Missing model accepted");
        jdbc.models = List.of(Map.of("status", "enabled", "capability_chat", true,
                "capability_vision", false, "capability_tool_calling", false,
                "provider_enabled", 1, "has_api_key", 1, "capabilities_checked_at", "checked"));
        if (!service.check(request).passed()) throw new AssertionError("Available model rejected");
        var allKinds = new AiMigrationPreflightService.Request(targets, List.of(), List.of(), models,
                List.of(new AiMigrationPreflightService.Target("skill-a", "company-a")),
                List.of(new AiMigrationPreflightService.Target("source-a", "company-a")),
                List.of(new AiMigrationPreflightService.Target("template-a", "company-a")));
        int queryStart = jdbc.queries;
        var allReport = service.check(allKinds);
        if (!allReport.passed() || allReport.checkedIds() != 4 || jdbc.queries - queryStart != 5)
            throw new AssertionError("Content/template tables were not checked");
        jdbc.conflict = true;
        if (service.check(request).errors().stream().noneMatch(error -> error.contains("already exists"))) throw new AssertionError("ID conflict missed");
        jdbc.conflict = false;
        jdbc.models = List.of(Map.of("status", "disabled", "capability_chat", false,
                "capability_vision", false, "capability_tool_calling", false,
                "provider_enabled", false, "has_api_key", false, "capabilities_checked_at", "checked"));
        if (service.check(request).errors().size() != 4) throw new AssertionError("Unavailable model checks missed");
        int before = jdbc.queries;
        try {
            service.check(new AiMigrationPreflightService.Request(targets, List.of(), List.of(),
                    List.of(new AiMigrationPreflightService.ModelTarget("agent-a", "other-company", "p", "m"))));
            throw new AssertionError("Cross-company request accepted");
        } catch (ResponseStatusException expected) {
            if (expected.getStatusCode().value() != 400 || jdbc.queries != before) throw new AssertionError("Validation must precede queries");
        }
        System.out.println("PASS: SELECT-only preflight, ID conflicts, missing/available/unavailable models and company validation.");
    }
}
