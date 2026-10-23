package com.aiosnova.ai;

import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/ai/model-preferences")
public class AiModelPreferencesController {
    private final AiModelPreferencesService service;
    public AiModelPreferencesController(AiModelPreferencesService service) { this.service = service; }
    public record SaveRequest(String companyId, String defaultModelConfigId,
            List<String> recommendedModelConfigIds, Long version) {}
    @GetMapping
    public AiModelPreferencesService.Preferences get(@RequestParam("companyId") String companyId) { return service.read(companyId); }
    @PutMapping
    public AiModelPreferencesService.Preferences save(@RequestBody SaveRequest input) {
        return service.save(input.companyId(), input.defaultModelConfigId(), input.recommendedModelConfigIds(), input.version());
    }
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> error(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message", error.getReason() == null ? "Model preferences request failed." : error.getReason()));
    }
}
