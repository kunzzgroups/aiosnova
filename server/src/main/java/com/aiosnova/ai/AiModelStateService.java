package com.aiosnova.ai;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AiModelStateService {

        private final AiModelRepository models;
        private final AiProviderRepository providers;

        public AiModelStateService(
                        AiModelRepository models,
                        AiProviderRepository providers) {

                this.models = models;
                this.providers = providers;
        }

        @Transactional
        public AiModelRepository.ModelSummary setEnabled(
                        String companyId,
                        String providerId,
                        String modelConfigId,
                        boolean enabled,
                        long expectedVersion) {

                String company = validateCompanyId(companyId);
                String provider = requiredText(providerId, "Provider ID", 36);
                String modelId = requiredText(modelConfigId, "Model configuration ID", 36);

                if (expectedVersion < 0) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Version must not be negative.");
                }

                var providerConfig = requireProvider(company, provider);

                // 与模型同步使用相同的 Provider 锁。
                if (!providers.lockForModelSync(
                                company,
                                provider,
                                providerConfig.version())) {

                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Provider changed. Reload and try again.");
                }

                var existing = models.findByProvider(company, provider)
                                .stream()
                                .filter(model -> model.id().equals(modelId))
                                .findFirst()
                                .orElseThrow(() -> new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "Model configuration not found under this Provider."));

                if (existing.version() != expectedVersion) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Model configuration was modified. Reload and try again.");
                }

                if (enabled) {
                        requireKnownCapabilities(existing);
                }

                int affected = models.updateEnabled(
                                company,
                                provider,
                                existing.id(),
                                enabled,
                                expectedVersion);

                if (affected != 1) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Model configuration changed. Reload and try again.");
                }

                return models.findByExternalId(
                                company,
                                provider,
                                existing.modelId()).orElseThrow(
                                                () -> new IllegalStateException(
                                                                "Unable to read the model configuration after updating."));
        }

        @Transactional
        public int setManyEnabled(String companyId, String providerId,
                        List<AiModelRepository.DeleteModelTarget> targets, boolean enabled) {
                String company = validateCompanyId(companyId);
                String provider = requiredText(providerId, "Provider ID", 36);
                if (targets == null || targets.isEmpty() || targets.size() > 1000)
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select between 1 and 1,000 models.");
                var parent = requireProvider(company, provider);
                if (!providers.lockForModelSync(company, provider, parent.version()))
                        throw new ResponseStatusException(HttpStatus.CONFLICT, "Provider changed. Reload and try again.");
                var byId = models.findByProvider(company, provider).stream()
                                .collect(Collectors.toMap(AiModelRepository.ModelSummary::id, Function.identity()));
                var unique = new HashSet<String>();
                for (var target : targets) {
                        if (target == null || target.id() == null || target.version() < 0 || !unique.add(target.id()))
                                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Model IDs must be valid and unique.");
                        var existing = byId.get(target.id());
                        if (existing == null || existing.version() != target.version())
                                throw new ResponseStatusException(HttpStatus.CONFLICT, "Some models changed. No models were updated. Reload and try again.");
                        if (enabled) requireKnownCapabilities(existing);
                }
                for (var target : targets) {
                        if (models.updateEnabled(company, provider, target.id(), enabled, target.version()) != 1)
                                throw new ResponseStatusException(HttpStatus.CONFLICT, "Some models changed. All updates were cancelled.");
                }
                return targets.size();
        }

        public record CompanyModelTarget(String providerId, String id, long version) {}

        private java.util.SortedMap<String, List<AiModelRepository.DeleteModelTarget>> groupCompanyTargets(
                        List<CompanyModelTarget> targets, int limit) {
                if (targets == null || targets.isEmpty() || targets.size() > limit)
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select between 1 and " + limit + " models.");
                var groups = new java.util.TreeMap<String, List<AiModelRepository.DeleteModelTarget>>();
                var unique = new HashSet<String>();
                for (var target : targets) {
                        if (target == null || target.version() < 0)
                                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide valid model targets and versions.");
                        String provider = requiredText(target.providerId(), "Provider ID", 36);
                        String id = requiredText(target.id(), "Model configuration ID", 36);
                        if (!unique.add(id)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Do not select the same model twice.");
                        groups.computeIfAbsent(provider, ignored -> new java.util.ArrayList<>())
                                        .add(new AiModelRepository.DeleteModelTarget(id, target.version()));
                }
                return groups;
        }

        @Transactional
        public int setCompanyManyEnabled(String companyId, List<CompanyModelTarget> targets, boolean enabled) {
                String company = validateCompanyId(companyId);
                var groups = groupCompanyTargets(targets, 1000);
                int updated = 0;
                for (var group : groups.entrySet())
                        updated += setManyEnabled(company, group.getKey(), group.getValue(), enabled);
                return updated;
        }

        @Transactional
        public int deleteCompanyMany(String companyId, List<CompanyModelTarget> targets) {
                String company = validateCompanyId(companyId);
                var groups = groupCompanyTargets(targets, 100);
                int deleted = 0;
                for (var group : groups.entrySet())
                        deleted += deleteMany(company, group.getKey(), group.getValue());
                return deleted;
        }

        @Transactional
        public AiModelRepository.ModelSummary updateConfiguration(
                        String companyId,
                        String providerId,
                        String modelConfigId,
                        String name,
                        String type,
                        boolean enabled,
                        String description,
                        Integer contextWindow,
                        long expectedVersion) {

                String company = validateCompanyId(companyId);
                String provider = requiredText(providerId, "Provider ID", 36);
                String configId = requiredText(modelConfigId, "Model configuration ID", 36);
                String modelName = requiredText(name, "Model name", 255);
                String modelType = requiredText(type, "Model type", 16);

                if (!java.util.Set.of(
                                "chat", "reasoning", "embedding", "other").contains(modelType)) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Invalid model type.");
                }

                String modelDescription = description == null ? "" : description.trim();

                if (modelDescription.length() > 10000) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Model description must not exceed 10000 characters.");
                }

                if (contextWindow != null && contextWindow <= 0) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Context window must be greater than zero.");
                }

                if (expectedVersion < 0) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Version must not be negative.");
                }

                var providerConfig = requireProvider(company, provider);

                // 与同步、启停操作使用相同的 Provider 锁。
                if (!providers.lockForModelSync(
                                company,
                                provider,
                                providerConfig.version())) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Provider changed. Reload and try again.");
                }

                var existing = models.findByProvider(company, provider)
                                .stream()
                                .filter(model -> model.id().equals(configId))
                                .findFirst()
                                .orElseThrow(() -> new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "Model configuration not found under this Provider."));

                if (existing.version() != expectedVersion) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Model configuration was modified. Reload and try again.");
                }

                if (enabled) {
                        requireKnownCapabilities(existing);
                }

                int affected = models.updateConfiguration(
                                company,
                                provider,
                                existing.id(),
                                modelName,
                                modelType,
                                enabled,
                                modelDescription,
                                contextWindow,
                                expectedVersion);

                if (affected != 1) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Model configuration changed. Reload and try again.");
                }

                return models.findByExternalId(
                                company,
                                provider,
                                existing.modelId()).orElseThrow(
                                                () -> new IllegalStateException(
                                                                "Unable to read the model configuration after updating."));
        }

        @Transactional
        public void delete(
                        String companyId,
                        String providerId,
                        String modelConfigId,
                        long expectedVersion) {

                String company = validateCompanyId(companyId);
                String provider = requiredText(providerId, "Provider ID", 36);
                String configId = requiredText(modelConfigId, "Model configuration ID", 36);

                if (expectedVersion < 0) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Version must not be negative.");
                }

                var providerConfig = requireProvider(company, provider);

                // 与模型同步、启停和编辑使用同一个 Provider 锁。
                if (!providers.lockForModelSync(
                                company,
                                provider,
                                providerConfig.version())) {

                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Provider changed. Reload and try again.");
                }

                var existing = models.findByProvider(company, provider)
                                .stream()
                                .filter(model -> model.id().equals(configId))
                                .findFirst()
                                .orElseThrow(() -> new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "Model configuration not found under this Provider."));

                if (existing.version() != expectedVersion) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Model configuration was modified. Reload and try again.");
                }

                if (!"disabled".equals(existing.status())) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Disable the model before deleting it.");
                }

                int affected = models.deleteDisabled(
                                company,
                                provider,
                                existing.id(),
                                expectedVersion);

                if (affected != 1) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Model configuration changed. Reload and try again.");
                }
        }

        @Transactional
        public int deleteMany(
                        String companyId,
                        String providerId,
                        List<AiModelRepository.DeleteModelTarget> targets) {

                String company = validateCompanyId(companyId);
                String provider = requiredText(providerId, "Provider ID", 36);

                if (targets == null || targets.isEmpty() || targets.size() > 100) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Select between 1 and 100 models.");
                }

                // 复制并规范化输入，后续检查和删除使用同一份数据。
                var normalizedTargets = new java.util.ArrayList<AiModelRepository.DeleteModelTarget>();

                var uniqueIds = new HashSet<String>();

                for (var target : targets) {
                        if (target == null) {
                                throw new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "Deletion targets must not contain null entries.");
                        }

                        String configId = requiredText(target.id(), "Model configuration ID", 36);

                        if (!uniqueIds.add(configId)) {
                                throw new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "Do not select the same model twice.");
                        }

                        if (target.version() < 0) {
                                throw new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "Version must not be negative.");
                        }

                        normalizedTargets.add(
                                        new AiModelRepository.DeleteModelTarget(
                                                        configId,
                                                        target.version()));
                }

                var providerConfig = requireProvider(company, provider);

                // 与同步、编辑、启停及单条删除共用 Provider 锁。
                if (!providers.lockForModelSync(
                                company,
                                provider,
                                providerConfig.version())) {

                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Provider changed. Reload and try again.");
                }

                Map<String, AiModelRepository.ModelSummary> existingById = models.findByProvider(company, provider)
                                .stream()
                                .collect(Collectors.toMap(
                                                AiModelRepository.ModelSummary::id,
                                                Function.identity()));

                // 整批检查通过前，不执行任何删除。
                for (var target : normalizedTargets) {
                        var existing = existingById.get(target.id());

                        if (existing == null) {
                                throw new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "Some models belong to another Provider or were deleted.");
                        }

                        if (existing.version() != target.version()) {
                                throw new ResponseStatusException(
                                                HttpStatus.CONFLICT,
                                                "Some model configurations were modified. Reload and try again.");
                        }

                        if (!"disabled".equals(existing.status())) {
                                throw new ResponseStatusException(
                                                HttpStatus.CONFLICT,
                                                "Disable all selected models first.");
                        }
                }

                int deleted = models.deleteManyDisabled(
                                company,
                                provider,
                                normalizedTargets);

                if (deleted != normalizedTargets.size()) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Deleted count did not match. The operation was cancelled.");
                }

                return deleted;
        }

        @Transactional
        public AiModelRepository.ModelSummary createManual(
                        String companyId,
                        String providerId,
                        String externalModelId,
                        String name,
                        String type,
                        String description,
                        Integer contextWindow) {

                String company = validateCompanyId(companyId);
                String provider = requiredText(providerId, "Provider ID", 36);
                String modelId = requiredText(externalModelId, "Model ID", 200);
                String modelName = requiredText(name, "Model name", 255);
                String modelType = requiredText(type, "Model type", 16);

                if (!modelId.matches("[\\x21-\\x7E]+")) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                                        "Model ID must contain printable ASCII characters without spaces.");
                }
                if (!java.util.Set.of("chat", "reasoning", "embedding", "other").contains(modelType)) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid model type.");
                }
                String modelDescription = description == null ? "" : description.trim();
                if (modelDescription.length() > 10000) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Model description must not exceed 10000 characters.");
                }
                if (contextWindow != null && contextWindow <= 0) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Context window must be greater than zero, or omitted when unknown.");
                }

                var providerConfig = requireProvider(company, provider);
                if (!providers.lockForModelSync(company, provider, providerConfig.version())) {
                        throw new ResponseStatusException(HttpStatus.CONFLICT, "Provider changed. Reload and try again.");
                }
                if (models.findByExternalId(company, provider, modelId).isPresent()) {
                        throw new ResponseStatusException(HttpStatus.CONFLICT, "This Provider already has this model. Edit the existing configuration.");
                }

                int affected;
                try {
                        affected = models.insertManual(
                                        java.util.UUID.randomUUID().toString(), company, provider,
                                        modelId, modelName, modelType, modelDescription, contextWindow);
                } catch (org.springframework.dao.DuplicateKeyException error) {
                        throw new ResponseStatusException(HttpStatus.CONFLICT,
                                        "Model configuration conflicts with an existing record. Reload to confirm.", error);
                }
                if (affected != 1) {
                        throw new IllegalStateException("Unable to create the model.");
                }
                return models.findByExternalId(company, provider, modelId)
                                .orElseThrow(() -> new IllegalStateException("Unable to read the model configuration after creation."));
        }

        private void requireKnownCapabilities(
                        AiModelRepository.ModelSummary model) {

                if (model.capabilities() == null ||
                                model.capabilitiesCheckedAt() == null ||
                                (model.capabilityError() != null &&
                                                !model.capabilityError().isBlank())) {

                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Model capabilities are unknown. Refresh capabilities before enabling or running this model.");
                }
        }

        public AiModelRepository.ModelSummary requireEnabledModel(
                        String companyId,
                        String providerId,
                        String externalModelId) {

                String company = validateCompanyId(companyId);
                String provider = requiredText(providerId, "Provider ID", 36);
                String modelId = requiredText(externalModelId, "Model ID", 200);

                var providerConfig = requireProvider(company, provider);

                if (!providerConfig.enabled()) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "This Provider is disabled. Enable it in AI Settings to continue.");
                }

                var model = models.findByExternalId(
                                company,
                                provider,
                                modelId).orElseThrow(
                                                () -> new ResponseStatusException(
                                                                HttpStatus.NOT_FOUND,
                                                                "This Provider has no configuration for this model. Sync the catalog first."));

                if (!"enabled".equals(model.status())) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "This model is disabled. Enable it in AI Settings to continue.");
                }

                requireKnownCapabilities(model);
                return model;
        }

        private AiProviderRepository.ProviderSummary requireProvider(
                        String companyId,
                        String providerId) {

                return providers.findByCompany(companyId)
                                .stream()
                                .filter(provider -> provider.id().equals(providerId))
                                .findFirst()
                                .orElseThrow(() -> new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "Provider not found in this company."));
        }

        private String validateCompanyId(String companyId) {
                String company = requiredText(companyId, "Company ID", 64);

                if (!company.matches("[A-Za-z0-9_-]+")) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Invalid company ID.");
                }

                return company;
        }

        private String requiredText(
                        String value,
                        String label,
                        int maxLength) {

                if (value == null || value.isBlank()) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        label + " is required.");
                }

                String normalized = value.trim();

                if (normalized.length() > maxLength) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        label + " must not exceed " + maxLength);
                }

                return normalized;
        }
}
