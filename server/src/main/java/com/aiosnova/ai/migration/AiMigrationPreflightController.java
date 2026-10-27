package com.aiosnova.ai.migration;

import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpStatus;

/** Local migration tool, enabled only in the standalone development entry point. */
@RestController
@ConditionalOnProperty(name = "ai.migration.preflight-enabled", havingValue = "true")
@RequestMapping(value = "/api/ai/migration/preflight", produces = "application/json;charset=UTF-8")
public class AiMigrationPreflightController {
    private final AiMigrationPreflightService service;
    private final AiSnapshotValidationService validation;
    public AiMigrationPreflightController(AiMigrationPreflightService service, AiSnapshotValidationService validation) {
        this.service = service; this.validation = validation;
    }
    @PostMapping("/snapshot")
    public AiSnapshotValidationService.Report validateSnapshot(@RequestBody String body) {
        if (body.getBytes(StandardCharsets.UTF_8).length > 10 * 1024 * 1024)
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Backup exceeds 10 MB.");
        tools.jackson.databind.JsonNode snapshot;
        try { snapshot = new ObjectMapper().readTree(body); }
        catch (RuntimeException invalid) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid JSON backup."); }
        return validation.validate(snapshot);
    }
    @PostMapping
    public AiMigrationPreflightService.Report check(@RequestBody AiMigrationPreflightService.Request request) {
        return service.check(request);
    }
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> error(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message", error.getReason() == null ? "Preflight failed." : error.getReason()));
    }
}
