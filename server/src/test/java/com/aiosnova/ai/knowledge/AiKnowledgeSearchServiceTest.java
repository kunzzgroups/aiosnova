package com.aiosnova.ai.knowledge;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

class AiKnowledgeSearchServiceTest {
    static class Jdbc extends JdbcTemplate {
        int active=1,searches;
        @Override public <T>T queryForObject(String sql,Class<T> type,Object...args) {
            assertTrue(sql.contains("company_id=? AND merchant_id=? AND id=? AND status='active'"));
            assertEquals(List.of("company-j1","merchant-acme","agent-test"),List.of(args));
            return type.cast(active);
        }
        @Override public List<Map<String,Object>> queryForList(String sql,Object...args) {
            searches++;
            assertTrue(sql.contains("c.company_id=? AND b.merchant_id=?"));
            assertTrue(sql.contains("d.status='ready' AND d.mode='active'"));
            assertTrue(sql.contains("d.assignment_mode='inherit'"));
            assertTrue(sql.contains("d.assignment_mode='override'"));
            assertTrue(sql.contains("o.document_id=d.id AND o.agent_id=?"));
            assertTrue(sql.contains("f.document_id=d.id"));
            assertEquals(List.of("company-j1","merchant-acme","agent-test","agent-test"),Arrays.asList(args).subList(0,4));
            assertFalse(sql.contains("annual"));
            assertTrue(Arrays.asList(args).contains("annual"));
            return List.of(Map.of("id","chunk-test","content","Annual leave is fourteen days.","source_label","Section 1",
                "document_id","doc-test","title","Policy","document_type","policy","knowledge_base_id","kb-test","base_name","HR"));
        }
    }
    AiKnowledgeAccess access=new AiKnowledgeAccess("merchant-acme","company-j1=admin","company-j1");
    @Test void returnsActualTextUnderBindingAndCompanyFilters() {
        var jdbc=new Jdbc();var result=new AiKnowledgeSearchService(jdbc,access).search("company-j1","agent-test","annual leave");
        assertEquals(1,result.get("matched"));assertTrue(result.toString().contains("fourteen days"));assertEquals(1,jdbc.searches);
    }
    @Test void unauthorizedCompanyNeverQueriesStorage() {
        var jdbc=new Jdbc();assertThrows(ResponseStatusException.class,()->new AiKnowledgeSearchService(jdbc,access).search("company-j2","agent-test","annual leave"));
        assertEquals(0,jdbc.searches);
    }
    @Test void inactiveOrForeignAgentNeverSearchesChunks() {
        var jdbc=new Jdbc();jdbc.active=0;
        assertThrows(ResponseStatusException.class,()->new AiKnowledgeSearchService(jdbc,access).search("company-j1","agent-test","annual leave"));
        assertEquals(0,jdbc.searches);
    }
    @Test void chineseTermsAndQuestionLimit() {
        assertTrue(AiKnowledgeSearchService.terms("年假多少天").contains("年假"));
        assertTrue(AiKnowledgeSearchService.terms("the and for").isEmpty());
        assertThrows(ResponseStatusException.class,()->new AiKnowledgeSearchService(new Jdbc(),access).search("company-j1","agent-test","x".repeat(4001)));
    }
}
