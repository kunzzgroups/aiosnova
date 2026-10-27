package com.aiosnova.ai.provider;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.DeleteMapping;

@RestController
@RequestMapping("/api/ai/providers")
public class AiProviderController {

    private final AiProviderRepository repository;
    private final AiProviderService service;
    private final AiProviderVerificationService verification;

    public AiProviderController(
            AiProviderRepository repository,
            AiProviderService service,
            AiProviderVerificationService verification) {
        this.repository = repository;
        this.service = service;
        this.verification = verification;
    }

    public record CreateProviderRequest(
            String companyId,
            String name,
            String baseUrl,
            Boolean enabled,
            String apiKey) {
    }

    public record TestProviderRequest(String companyId, String modelId, Long version) {}

    @PostMapping("/{id}/test-connection")
    public Map<String, Object> testConnection(@PathVariable("id") String id,
            @RequestBody TestProviderRequest request) {
        if (request.version() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide the Provider version.");
        return verification.test(request.companyId(), id, request.modelId(), request.version());
    }

    public record UpdateProviderRequest(
            String companyId,
            String name,
            String baseUrl,
            Boolean enabled,
            String apiKey,
            Long version) {
    }

    public record SetProviderEnabledRequest(
            String companyId,
            Boolean enabled,
            Long version) {
    }

    public record BulkDeleteProvidersRequest(
            String companyId,
            List<AiProviderService.DeleteProviderItem> items) {
    }

    @GetMapping
    public Map<String, List<AiProviderRepository.ProviderSummary>> list(
            @RequestParam("companyId") String companyId) {

        if (companyId.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Company ID is required.");
        }

        var items = repository.findByCompany(companyId.trim());

        return Map.of("items", items);
    }

    @PostMapping
    public ResponseEntity<AiProviderRepository.ProviderSummary> create(
            @RequestBody CreateProviderRequest request) {

        var provider = service.create(
                request.companyId(),
                request.name(),
                request.baseUrl(),
                Boolean.TRUE.equals(request.enabled()),
                request.apiKey());

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(provider);
    }

    @PutMapping("/{id}")
    public AiProviderRepository.ProviderSummary update(
            @PathVariable("id") String id,
            @RequestBody UpdateProviderRequest request) {

        if (request.enabled() == null || request.version() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Provide the enabled state and version.");
        }

        return service.update(
                request.companyId(),
                id,
                request.name(),
                request.baseUrl(),
                request.enabled(),
                request.apiKey(),
                request.version());
    }

    @PatchMapping("/{id}/enabled")
    public AiProviderRepository.ProviderSummary setEnabled(
            @PathVariable("id") String id,
            @RequestBody SetProviderEnabledRequest request) {

        if (request.enabled() == null || request.version() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Provide the enabled state and version.");
        }

        return service.setEnabled(
                request.companyId(),
                id,
                request.enabled(),
                request.version());
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleRequestError(
            ResponseStatusException error) {

        String message = error.getReason();

        return ResponseEntity
                .status(error.getStatusCode())
                .body(Map.of(
                        "message",
                        message == null ? "Request failed." : message));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable("id") String id,
            @RequestParam("companyId") String companyId,
            @RequestParam("version") long version) {

        service.delete(companyId, id, version);

        return ResponseEntity.noContent().build();
    }

    @PostMapping("/bulk-delete")
    public Map<String, Integer> deleteMany(
            @RequestBody BulkDeleteProvidersRequest request) {

        int deleted = service.deleteMany(
                request.companyId(),
                request.items());

        return Map.of("deleted", deleted);
    }
}
