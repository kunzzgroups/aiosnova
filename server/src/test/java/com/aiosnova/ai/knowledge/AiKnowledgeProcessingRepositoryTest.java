package com.aiosnova.ai.knowledge;

import java.lang.reflect.Proxy;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import static org.junit.jupiter.api.Assertions.*;

class AiKnowledgeProcessingRepositoryTest {
    static final String COMPANY = "company-j1";
    static final String FILE = "11111111-1111-4111-8111-111111111111";
    static final String JOB = "22222222-2222-4222-8222-222222222222";

    static class FakeJdbc extends JdbcTemplate {
        String sql;
        List<Object> parameters;
        int changed = 1;
        RuntimeException failure;
        public int update(String sql, Object... args) {
            capture(sql, args);
            if (failure != null) throw failure;
            return changed;
        }
        public <T> List<T> query(String sql, RowMapper<T> mapper, Object... args) {
            capture(sql, args);
            if (!COMPANY.equals(args[0]) || !JOB.equals(args[1])) return List.of();
            ResultSet row = (ResultSet) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{ResultSet.class}, (p, method, values) -> {
                String column = (String) values[0];
                if (method.getName().equals("getInt")) return switch (column) {
                    case "attempt_count" -> 0;
                    case "max_attempts" -> 3;
                    default -> throw new AssertionError(column);
                };
                if (!method.getName().equals("getString")) throw new AssertionError(method.getName());
                return switch (column) {
                    case "id" -> JOB;
                    case "company_id" -> COMPANY;
                    case "file_id" -> FILE;
                    case "status" -> "queued";
                    default -> throw new AssertionError(column);
                };
            });
            try { return List.of(mapper.mapRow(row, 0)); }
            catch (SQLException error) { throw new AssertionError(error); }
        }
        void capture(String sql, Object[] args) {
            this.sql = sql.replaceAll("\\s+", " ").trim().toLowerCase(Locale.ROOT);
            parameters = List.of(args);
        }
    }

    @Test void enqueueCreatesScopedJob() {
        var jdbc = new FakeJdbc();
        String id = new AiKnowledgeProcessingRepository(jdbc).enqueue(COMPANY, FILE);
        assertDoesNotThrow(() -> UUID.fromString(id));
        assertTrue(jdbc.sql.startsWith("insert into ai_knowledge_processing_jobs"));
        assertTrue(jdbc.sql.contains("from ai_knowledge_files f where f.company_id = ? and f.id = ?"));
        assertEquals(List.of(id, COMPANY, FILE), jdbc.parameters);
    }
    @Test void enqueueRejectsFileOutsideCompany() {
        var jdbc = new FakeJdbc(); jdbc.changed = 0;
        assertThrows(IllegalArgumentException.class, () -> new AiKnowledgeProcessingRepository(jdbc).enqueue("company-j2", FILE));
        assertTrue(jdbc.sql.contains("where f.company_id = ? and f.id = ?"));
        assertEquals(List.of("company-j2", FILE), jdbc.parameters.subList(1, 3));
    }
    @Test void duplicateFailureIsNotSwallowed() {
        var jdbc = new FakeJdbc(); jdbc.failure = new DuplicateKeyException("Simulated duplicate");
        assertSame(jdbc.failure, assertThrows(DuplicateKeyException.class, () -> new AiKnowledgeProcessingRepository(jdbc).enqueue(COMPANY, FILE)));
    }
    @Test void findMapsFieldsAndKeepsCompanyScope() {
        var jdbc = new FakeJdbc(); var repository = new AiKnowledgeProcessingRepository(jdbc);
        assertEquals(new AiKnowledgeProcessingRepository.Job(JOB, COMPANY, FILE, "queued", 0, 3), repository.find(COMPANY, JOB).orElseThrow());
        assertTrue(jdbc.sql.contains("where company_id = ? and id = ?"));
        assertEquals(List.of(COMPANY, JOB), jdbc.parameters);
        assertTrue(repository.find("company-j2", JOB).isEmpty());
        assertEquals(List.of("company-j2", JOB), jdbc.parameters);
    }
}
