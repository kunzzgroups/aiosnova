package com.aiosnova.ai.model;

import java.lang.reflect.Proxy;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;

/** Offline contract checks using fake SQL; no real database or model requests. */
public class AiModelPreferencesCheck {
    private static final String A = "00000000-0000-0000-0000-000000000001";
    private static final String B = "00000000-0000-0000-0000-000000000002";

    private static class MemoryJdbc extends JdbcTemplate {
        String company, defaultId, recommendations = "[]";
        long version;
        boolean missing;
        Set<String> available = Set.of(A, B);

        @Override
        public <T> List<T> query(String sql, RowMapper<T> mapper, Object... args) {
            if (missing) throw new BadSqlGrammarException("test", sql, new SQLException("Missing table", "42S02", 1146));
            if (!args[0].equals(company)) return List.of();
            ResultSet row = (ResultSet) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{ResultSet.class}, (proxy, method, parameters) -> {
                if (method.getName().equals("getString")) return ((Integer) parameters[0]) == 1 ? defaultId : recommendations;
                if (method.getName().equals("getLong")) return version;
                throw new UnsupportedOperationException(method.getName());
            });
            try { return List.of(mapper.mapRow(row, 0)); }
            catch (SQLException error) { throw new IllegalStateException(error); }
        }

        @Override
        public <T> T queryForObject(String sql, Class<T> type, Object... args) { return type.cast(version); }

        @Override
        public List<Map<String, Object>> queryForList(String sql, Object... args) {
            return available.contains(args[1]) && args[0].equals("company-j1") ? List.of(Map.of("id", args[1])) : List.of();
        }

        @Override
        public int update(String sql, Object... args) {
            if (sql.startsWith("INSERT")) { if (company == null) company = (String) args[0]; return 1; }
            if (((Long) args[3]) != version) return 0;
            defaultId = (String) args[0]; recommendations = (String) args[1]; version++;
            return 1;
        }
    }

    private static void reject(Runnable action, int status) {
        try { action.run(); throw new AssertionError("Expected HTTP " + status); }
        catch (ResponseStatusException error) {
            if (error.getStatusCode().value() != status) throw new AssertionError(error);
        }
    }

    public static void main(String[] args) {
        var jdbc = new MemoryJdbc();
        var service = new AiModelPreferencesService(jdbc);
        if (service.read("company-j1").defaultModelConfigId() != null) throw new AssertionError("No implicit default");
        var saved = service.save("company-j1", A, List.of(A, B), 0L);
        if (saved.version() != 1 || !saved.defaultModelConfigId().equals(A) || saved.recommendedModelConfigIds().size() != 2)
            throw new AssertionError("Preferences not retained");
        reject(() -> service.save("company-j1", B, List.of(B), 0L), 409);
        reject(() -> service.save("company-j1", A, List.of(A, A), 1L), 400);
        reject(() -> service.save("company-j1", A, java.util.Collections.nCopies(7, A), 1L), 400);
        reject(() -> service.save("company-j1", "not-a-uuid", List.of(), 1L), 400);
        if (service.read("company-j2").defaultModelConfigId() != null) throw new AssertionError("Cross-company preference leak");
        jdbc.available = Set.of(B);
        reject(() -> service.save("company-j1", A, List.of(A), 1L), 409);
        if (!service.read("company-j1").defaultModelConfigId().equals(A)) throw new AssertionError("Unavailable default was silently replaced");
        jdbc.missing = true;
        if (service.read("company-j1").storageReady()) throw new AssertionError("Missing migration not reported");
        reject(() -> service.save("company-j1", B, List.of(B), 1L), 503);
        System.out.println("PASS: company preferences, explicit defaults, recommendation limits, stale versions, unavailable models, migration readiness");
    }
}
