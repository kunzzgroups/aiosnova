package com.aiosnova.ai.agent;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping(value = "/api/ai/agents", produces = "application/json;charset=UTF-8")
public class AiAgentController {
    private final AiAgentService service;
    private final AiAgentWriteService writes;

    public AiAgentController(AiAgentService service, AiAgentWriteService writes) {
        this.service = service;
        this.writes = writes;
    }

    public record AgentList(List<AiAgentService.AgentItem> items, int count) {}

    @PostMapping
    public ResponseEntity<AiAgentService.AgentItem> create(@RequestBody AiAgentWriteService.CreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(writes.create(request));
    }

    @PatchMapping("/{agentId}")
    public AiAgentService.AgentItem update(@PathVariable("agentId") String agentId,
            @RequestBody AiAgentWriteService.UpdateRequest request) {
        return writes.update(agentId, request);
    }

    @DeleteMapping("/{agentId}")
    public ResponseEntity<Void> delete(@PathVariable("agentId") String agentId,
            @RequestParam("companyId") String companyId, @RequestParam("version") Long version) {
        writes.delete(companyId, agentId, version);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/knowledge-bases")
    public Map<String, Object> knowledgeBases(@RequestParam("companyId") String companyId) {
        var items = writes.knowledgeBases(companyId);
        return Map.of("items", items, "count", items.size());
    }

    @GetMapping
    public AgentList list(@RequestParam("companyId") String companyId) {
        var items = service.list(companyId);
        return new AgentList(items, items.size());
    }

    @GetMapping("/{agentId}")
    public AiAgentService.AgentDetail get(@RequestParam("companyId") String companyId,
            @PathVariable("agentId") String agentId) {
        return service.get(companyId, agentId);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleRequestError(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message",
                error.getReason() == null ? "Agent request failed." : error.getReason()));
    }
}
