package com.aiosnova.ai.tool;

import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;

import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/ai/tools")
@ConditionalOnProperty(prefix = "ai.tools.management", name = "enabled", havingValue = "true")

public class AiToolManagementController {

    private final AiToolReadService reads;
    private final AiToolWriteService writes;

    // Preserve existing read-only tests.
    public AiToolManagementController(AiToolReadService reads) {
        this(reads, null);
    }

    @Autowired
    public AiToolManagementController(
            AiToolReadService reads,
            AiToolWriteService writes) {

        this.reads = reads;
        this.writes = writes;
    }

    public record ToolList(List<AiToolReadService.ToolDetail> items) {
    }

    public record SaveToolRequest(
            String companyId,
            String name,
            String description,
            String module,
            String action,
            String executorType,
            String risk,
            String status,
            Integer timeoutSeconds,
            Boolean requiresConfirmation,
            JsonNode configuration,
            List<String> agentIds,
            Long version) {

        AiToolWriteService.CreateRequest toServiceRequest() {
            if (timeoutSeconds == null
                    || requiresConfirmation == null
                    || configuration == null
                    || !configuration.isObject()
                    || agentIds == null) {
                throw badRequest(
                        "Timeout, confirmation, configuration object "
                                + "and Agent IDs are required.");
            }

            return new AiToolWriteService.CreateRequest(
                    companyId,
                    name,
                    description,
                    module,
                    action,
                    executorType,
                    risk,
                    status,
                    timeoutSeconds,
                    requiresConfirmation,
                    configuration.toString(),
                    agentIds);
        }
    }

    public record EnabledRequest(
            String companyId,
            Boolean enabled,
            Long version) {
    }

    public record AgentBindingsRequest(
            String companyId,
            List<String> agentIds,
            Long version) {
    }

    private AiToolWriteService writeService() {
        if (writes == null) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Tool management writes are not enabled.");
        }

        return writes;
    }

    private static long requiredVersion(Long version) {
        if (version == null
                || version < 0
                || version == Long.MAX_VALUE) {
            throw badRequest("A valid current tool version is required.");
        }

        return version;
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST, message);
    }

    @PostMapping
    public ResponseEntity<AiToolWriteService.SavedTool> create(
            @RequestBody SaveToolRequest request) {

        var service = writeService();

        if (request.version() != null) {
            throw badRequest("Do not provide a version when creating a tool.");
        }

        var saved = service.create(request.toServiceRequest());

        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @PutMapping("/{id}")
    public AiToolWriteService.SavedTool update(
            @PathVariable String id,
            @RequestBody SaveToolRequest request) {

        var service = writeService();
        long version = requiredVersion(request.version());

        return service.update(
                id,
                version,
                request.toServiceRequest());
    }

    @PatchMapping("/{id}/enabled")
    public AiToolWriteService.SavedTool setEnabled(
            @PathVariable String id,
            @RequestBody EnabledRequest request) {

        var service = writeService();
        long version = requiredVersion(request.version());

        if (request.enabled() == null) {
            throw badRequest("Enabled is required.");
        }

        return service.setEnabled(
                request.companyId(),
                id,
                request.enabled(),
                version);
    }

    @PutMapping("/{id}/agents")
    public AiToolWriteService.SavedTool replaceAgentBindings(
            @PathVariable String id,
            @RequestBody AgentBindingsRequest request) {

        var service = writeService();
        long version = requiredVersion(request.version());

        if (request.agentIds() == null) {
            throw badRequest(
                    "Agent IDs are required; use an empty array to clear bindings.");
        }

        return service.replaceAgentBindings(
                request.companyId(),
                id,
                version,
                request.agentIds());
    }

    @GetMapping
    public ToolList list(@RequestParam String companyId) {
        return new ToolList(reads.list(companyId));
    }

    @GetMapping("/{id}")
    public AiToolReadService.ToolDetail get(
            @PathVariable String id,
            @RequestParam String companyId) {

        return reads.get(companyId, id);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleConstraintError(
            DataIntegrityViolationException error) {

        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of(
                        "message",
                        "Tool data conflicts with existing records. "
                                + "Reload and check the configuration."));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleError(
            ResponseStatusException error) {

        return ResponseEntity.status(error.getStatusCode())
                .body(Map.of(
                        "message",
                        error.getReason() == null
                                ? "Tool request failed."
                                : error.getReason()));
    }
}