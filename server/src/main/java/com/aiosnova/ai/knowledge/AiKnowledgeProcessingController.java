package com.aiosnova.ai.knowledge;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/ai/knowledge/processing")
public class AiKnowledgeProcessingController {
    private final AiKnowledgeAccess access;
    private final AiKnowledgeProcessingRepository jobs;
    private final AiKnowledgeProcessingService service;
    public AiKnowledgeProcessingController(AiKnowledgeAccess access,AiKnowledgeProcessingRepository jobs,AiKnowledgeProcessingService service) {
        this.access=access;this.jobs=jobs;this.service=service;
    }
    @GetMapping("/{id}") public AiKnowledgeProcessingRepository.Job status(@PathVariable String id,@RequestParam String companyId) {
        access.read(companyId);
        return jobs.find(companyId,id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Processing task not found."));
    }
    @PostMapping("/{id}/retry") public void retry(@PathVariable String id,@RequestParam String companyId) {
        access.write(companyId);
        if(!service.retry(companyId,id))throw new ResponseStatusException(HttpStatus.CONFLICT,"Task cannot be retried in its current state.");
    }
}
