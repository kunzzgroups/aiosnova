package com.aiosnova.ai;

import java.util.Map;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.DeleteMapping;

@RestController
@RequestMapping(value = "/api/ai/models", produces = "application/json;charset=UTF-8")
public class AiModelConfigController {

        private final AiModelRepository models;
        private final AiProviderRepository providers;
        private final AiModelSyncService syncService;
        private final AiModelStateService stateService;

        public AiModelConfigController(
                        AiModelRepository models,
                        AiProviderRepository providers,
                        AiModelSyncService syncService,
                        AiModelStateService stateService) {

                this.models = models;
                this.providers = providers;
                this.syncService = syncService;
                this.stateService = stateService;
        }

        @GetMapping
        public Map<String, Object> list(
                        @RequestParam("companyId") String companyId,
                        @RequestParam("providerId") String providerId) {

                String normalizedCompanyId = companyId.trim();
                String normalizedProviderId = providerId.trim();

                if (!normalizedCompanyId.matches("[A-Za-z0-9_-]{1,64}")) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Invalid company ID.");
                }

                if (normalizedProviderId.isBlank() ||
                                normalizedProviderId.length() > 36) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Invalid Provider ID.");
                }

                boolean providerExists = providers
                                .findByCompany(normalizedCompanyId)
                                .stream()
                                .anyMatch(provider -> provider.id().equals(normalizedProviderId));

                if (!providerExists) {
                        throw new ResponseStatusException(
                                        HttpStatus.NOT_FOUND,
                                        "Provider not found in this company.");
                }

                var items = models.findByProvider(
                                normalizedCompanyId,
                                normalizedProviderId);

                return Map.of(
                                "items", items,
                                "count", items.size());
        }

        public record SyncModelsRequest(
                        String companyId,
                        String providerId) {
        }

        @PostMapping("/sync")
        public AiModelSyncService.SyncResult sync(
                        @RequestBody SyncModelsRequest request) {

                return syncService.sync(
                                request.companyId(),
                                request.providerId());
        }

        public record SetModelEnabledRequest(
                        String companyId,
                        String providerId,
                        Boolean enabled,
                        Long version) {
        }

        public record SetManyEnabledRequest(String companyId, String providerId, Boolean enabled,
                        List<DeleteModelItem> items) {}

        public record CompanyModelItem(String providerId, String id, Long version) {}
        public record CompanyModelsRequest(String companyId, Boolean enabled, List<CompanyModelItem> items) {}

        private List<AiModelStateService.CompanyModelTarget> companyTargets(CompanyModelsRequest request) {
                if (request.items() == null || request.items().isEmpty() || request.items().size() > 1000 ||
                                request.items().stream().anyMatch(item -> item == null || item.version() == null))
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide model IDs, Provider IDs and versions.");
                return request.items().stream().map(item -> new AiModelStateService.CompanyModelTarget(
                                item.providerId(), item.id(), item.version())).toList();
        }

        @PostMapping("/company-bulk-enabled")
        public Map<String, Integer> setCompanyManyEnabled(@RequestBody CompanyModelsRequest request) {
                if (request.enabled() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide the enabled state.");
                return Map.of("updated", stateService.setCompanyManyEnabled(request.companyId(), companyTargets(request), request.enabled()));
        }

        @PostMapping("/company-bulk-delete")
        public Map<String, Integer> deleteCompanyMany(@RequestBody CompanyModelsRequest request) {
                return Map.of("deleted", stateService.deleteCompanyMany(request.companyId(), companyTargets(request)));
        }

        @PostMapping("/bulk-enabled")
        public Map<String, Integer> setManyEnabled(@RequestBody SetManyEnabledRequest request) {
                if (request.enabled() == null || request.items() == null || request.items().isEmpty() || request.items().size() > 1000 ||
                                request.items().stream().anyMatch(item -> item == null || item.version() == null))
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide enabled state and 1 to 1,000 model IDs with versions.");
                var targets = request.items().stream()
                                .map(item -> new AiModelRepository.DeleteModelTarget(item.id(), item.version())).toList();
                return Map.of("updated", stateService.setManyEnabled(request.companyId(), request.providerId(), targets, request.enabled()));
        }

        @PatchMapping("/{id}/enabled")
        public AiModelRepository.ModelSummary setEnabled(
                        @PathVariable("id") String id,
                        @RequestBody SetModelEnabledRequest request) {

                if (request.enabled() == null || request.version() == null) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Provide the enabled state and version.");
                }

                return stateService.setEnabled(
                                request.companyId(),
                                request.providerId(),
                                id,
                                request.enabled(),
                                request.version());
        }

        public record UpdateModelRequest(
                        String companyId,
                        String providerId,
                        String name,
                        String type,
                        Boolean enabled,
                        String description,
                        Integer contextWindow,
                        Long version) {
        }

        @PutMapping("/{id}")
        public AiModelRepository.ModelSummary update(
                        @PathVariable("id") String id,
                        @RequestBody UpdateModelRequest request) {

                if (request.enabled() == null || request.version() == null) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Provide the enabled state and version.");
                }

                return stateService.updateConfiguration(
                                request.companyId(),
                                request.providerId(),
                                id,
                                request.name(),
                                request.type(),
                                request.enabled(),
                                request.description(),
                                request.contextWindow(),
                                request.version());
        }

        @DeleteMapping("/{id}")
        public ResponseEntity<Void> delete(
                        @PathVariable("id") String id,
                        @RequestParam("companyId") String companyId,
                        @RequestParam("providerId") String providerId,
                        @RequestParam("version") long version) {

                stateService.delete(
                                companyId,
                                providerId,
                                id,
                                version);

                return ResponseEntity.noContent().build();
        }

        public record DeleteModelItem(
                        String id,
                        Long version) {
        }

        public record DeleteModelsRequest(
                        String companyId,
                        String providerId,
                        List<DeleteModelItem> items) {
        }

        @PostMapping("/bulk-delete")
        public Map<String, Integer> deleteMany(
                        @RequestBody DeleteModelsRequest request) {

                if (request.items() == null ||
                                request.items().isEmpty() ||
                                request.items().size() > 100) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Select between 1 and 100 models.");
                }

                for (var item : request.items()) {
                        if (item == null || item.version() == null) {
                                throw new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "Provide the ID and version for every model.");
                        }
                }

                var targets = request.items()
                                .stream()
                                .map(item -> new AiModelRepository.DeleteModelTarget(
                                                item.id(),
                                                item.version()))
                                .toList();

                int deleted = stateService.deleteMany(
                                request.companyId(),
                                request.providerId(),
                                targets);

                return Map.of("deleted", deleted);
        }

        public record CreateModelRequest(
                        String companyId,
                        String providerId,
                        String modelId,
                        String name,
                        String type,
                        String description,
                        Integer contextWindow) {
        }

        @PostMapping
        public ResponseEntity<AiModelRepository.ModelSummary> create(
                        @RequestBody CreateModelRequest request) {

                var created = stateService.createManual(
                                request.companyId(),
                                request.providerId(),
                                request.modelId(),
                                request.name(),
                                request.type(),
                                request.description(),
                                request.contextWindow());

                return ResponseEntity
                                .status(HttpStatus.CREATED)
                                .body(created);
        }

        public record RefreshCapabilitiesRequest(
                        String companyId,
                        String providerId,
                        Long version) {
        }

        @PostMapping("/{id}/refresh-capabilities")
        public AiModelRepository.ModelSummary refreshCapabilities(
                        @PathVariable("id") String id,
                        @RequestBody RefreshCapabilitiesRequest request) {

                if (request.version() == null) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Provide the model version.");
                }

                return syncService.refreshCapabilities(
                                request.companyId(),
                                request.providerId(),
                                id,
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
                                                message == null ? "Model list request failed." : message));
        }
}
