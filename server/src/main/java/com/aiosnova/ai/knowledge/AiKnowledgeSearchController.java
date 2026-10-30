package com.aiosnova.ai.knowledge;

import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ai/knowledge")
public class AiKnowledgeSearchController {
    private final AiKnowledgeSearchService search;
    public AiKnowledgeSearchController(AiKnowledgeSearchService search) { this.search=search; }
    public record Request(String companyId,String agentId,String question) { }
    @PostMapping("/search") public Map<String,Object> search(@RequestBody Request request) {
        return search.search(request.companyId(),request.agentId(),request.question());
    }
}
