package com.aiosnova.ai.knowledge;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class AiKnowledgeSearchService {
    private final JdbcTemplate jdbc;
    private final AiKnowledgeAccess access;
    public AiKnowledgeSearchService(JdbcTemplate jdbc,AiKnowledgeAccess access) { this.jdbc=jdbc;this.access=access; }

    @Transactional(readOnly=true)
    public Map<String,Object> search(String company,String agent,String question) {
        if(company==null || !company.matches("[A-Za-z0-9_-]{1,64}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid company ID.");
        access.read(company);
        if (agent==null || !agent.matches("[A-Za-z0-9_-]{1,128}") || question==null || question.length()>4000)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid retrieval request.");
        Integer active=jdbc.queryForObject("SELECT COUNT(*) FROM ai_agents WHERE company_id=? AND merchant_id=? AND id=? AND status='active'",
                Integer.class,company,access.merchantId,agent);
        if (active==null || active!=1) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Active Agent not found in this company.");
        var terms=terms(question);
        if (terms.isEmpty()) return Map.of("sources",List.of(),"scanned",0,"matched",0,"scope","");
        var predicates=new ArrayList<String>();
        var parameters=new ArrayList<Object>(List.of(company,access.merchantId,agent,agent));
        for (String term:terms) { predicates.add("LOCATE(?, c.content)>0");parameters.add(term); }
        String sql="""
                SELECT c.id,c.content,c.source_label,d.id document_id,d.title,d.document_type,d.knowledge_base_id,b.name base_name
                FROM ai_knowledge_document_chunks c
                JOIN ai_knowledge_documents d ON d.company_id=c.company_id AND d.id=c.document_id
                JOIN ai_knowledge_files f ON f.company_id=c.company_id AND f.id=c.file_id AND f.document_id=d.id
                JOIN ai_knowledge_bases b ON b.company_id=d.company_id AND b.id=d.knowledge_base_id
                WHERE c.company_id=? AND b.merchant_id=? AND d.status='ready' AND d.mode='active'
                  AND d.chunk_count>0 AND d.last_indexed_at IS NOT NULL
                  AND ((d.assignment_mode='inherit' AND EXISTS
                    (SELECT 1 FROM ai_agent_knowledge_bases l WHERE l.company_id=d.company_id AND l.knowledge_base_id=b.id AND l.agent_id=?))
                    OR (d.assignment_mode='override' AND EXISTS
                    (SELECT 1 FROM ai_agent_document_overrides o WHERE o.company_id=d.company_id AND o.document_id=d.id AND o.agent_id=?)))
                AND (
                """+String.join(" OR ",predicates)+") ORDER BY d.id,c.chunk_index LIMIT 200";
        var rows=jdbc.queryForList(sql,parameters.toArray());
        var sources=rows.stream().sorted(Comparator.<Map<String,Object>>comparingInt(row -> score(row.get("content").toString(),terms)).reversed())
            .limit(8).map(row -> {
                String text=row.get("content").toString();
                String type=switch(row.get("document_type").toString()) { case "contract" -> "contract"; case "invoice" -> "invoice"; case "record" -> "record"; default -> "policy"; };
                return Map.<String,Object>of("id",row.get("id"),"type",type,"title",row.get("title"),
                    "origin",row.get("base_name")+" · "+Objects.toString(row.get("source_label"),""),
                    "snippet",text.substring(0,Math.min(2000,text.length())),"relevance",Math.min(100,score(text,terms)*20),
                    "baseId",row.get("knowledge_base_id"),"documentId",row.get("document_id"),"kind","file");
            }).toList();
        return Map.of("sources",sources,"scanned",rows.size(),"matched",sources.size(),"scope","Agent-authorized company documents");
    }
    static List<String> terms(String question) {
        var result=new LinkedHashSet<String>();
        for(String word:question.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")) {
            if(word.length()<2 || Set.of("what","when","where","this","that","with","from","please","the","and","are","for").contains(word)) continue;
            if(word.matches(".*\\p{IsHan}.*")) { for(int i=0;i<word.length()-1;i++)result.add(word.substring(i,i+2)); }
            else result.add(word);
        }
        return result.stream().limit(16).toList();
    }
    static int score(String text,List<String> terms) { String value=text.toLowerCase(Locale.ROOT);return (int)terms.stream().filter(value::contains).count(); }
}
