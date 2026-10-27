package com.aiosnova.ai.model;

import com.aiosnova.ai.provider.AiProviderRepository;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AiModelSyncService {

    private final AiProviderRepository providers;
    private final AiModelRepository models;
    private final OpenRouterModelService catalogService;
    private final TransactionTemplate transactions;

    public AiModelSyncService(
            AiProviderRepository providers,
            AiModelRepository models,
            OpenRouterModelService catalogService,
            PlatformTransactionManager transactionManager) {

        this.providers = providers;
        this.models = models;
        this.catalogService = catalogService;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    public record SyncResult(
            int created,
            int updated,
            List<String> capabilityWarnings) {
    }

    public SyncResult sync(String companyId, String providerId) {
        String company = companyId == null ? "" : companyId.trim();
        String providerIdValue = providerId == null ? "" : providerId.trim();

        if (!company.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid company ID.");
        }

        if (providerIdValue.isBlank() || providerIdValue.length() > 36) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid Provider ID.");
        }

        var provider = providers.findByCompany(company)
                .stream()
                .filter(item -> item.id().equals(providerIdValue))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Provider not found in this company."));

        if (!"openrouter".equals(provider.providerType()) ||
                !"https://openrouter.ai/api/v1".equals(provider.baseUrl())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Only the official OpenRouter catalog can currently be synced.");
        }

        // 网络请求在写入事务开始之前完成。
        List<OpenRouterModelService.CatalogModel> downloaded;

        try {
            downloaded = catalogService.loadModelCatalog();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();

            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Model catalog sync was interrupted.");
        } catch (IOException | RuntimeException error) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Unable to load the OpenRouter catalog. No models were synced.");
        }

        var catalog = validateCatalog(downloaded);

        try {
            SyncResult result = transactions.execute(
                    transaction -> writeCatalog(provider, catalog));

            if (result == null) {
                throw new IllegalStateException("The sync transaction returned no result.");
            }

            return result;

        } catch (DuplicateKeyException error) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Model configurations changed concurrently. Sync was cancelled; try again.");
        }
    }

    public AiModelRepository.ModelSummary refreshCapabilities(
            String companyId,
            String providerId,
            String modelConfigId,
            long expectedVersion) {

        String company = companyId == null ? "" : companyId.trim();
        String providerIdValue = providerId == null ? "" : providerId.trim();
        String configId = modelConfigId == null ? "" : modelConfigId.trim();

        if (!company.matches("[A-Za-z0-9_-]{1,64}") ||
                providerIdValue.isBlank() ||
                providerIdValue.length() > 36 ||
                configId.isBlank() ||
                configId.length() > 36 ||
                expectedVersion < 0) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid company, Provider, model configuration ID or version.");
        }

        var provider = providers.findByCompany(company)
                .stream()
                .filter(item -> item.id().equals(providerIdValue))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Provider not found in this company."));

        if (!"openrouter".equals(provider.providerType()) ||
                !"https://openrouter.ai/api/v1".equals(provider.baseUrl())) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Only official OpenRouter model capabilities are supported.");
        }

        var existing = models.findByProvider(company, providerIdValue)
                .stream()
                .filter(item -> item.id().equals(configId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Model configuration not found under this Provider."));

        if (existing.version() != expectedVersion) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Model configuration was modified. Reload and try again.");
        }

        // 网络请求放在写入事务外，避免等待网络时占用数据库锁。
        List<OpenRouterModelService.CatalogModel> downloaded;

        try {
            downloaded = catalogService.loadModelCatalog();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();

            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "The model capability request was interrupted.");
        } catch (IOException | RuntimeException error) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Unable to load the OpenRouter catalog. Capabilities were not updated.");
        }

        var entry = validateCatalog(downloaded)
                .stream()
                .filter(item -> item.modelId().equals(existing.modelId()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Model not found in the OpenRouter catalog."));

        var result = transactions.execute(transaction -> {
            if (!providers.lockForModelSync(
                    company,
                    providerIdValue,
                    provider.version())) {

                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Provider changed. Reload and try again.");
            }

            int affected = models.updateCatalogCapabilities(
                    company,
                    providerIdValue,
                    configId,
                    entry,
                    LocalDateTime.now(ZoneOffset.UTC),
                    expectedVersion);

            if (affected != 1) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Model configuration was changed or deleted. Reload and try again.");
            }

            return models.findByExternalId(
                    company,
                    providerIdValue,
                    existing.modelId()).orElseThrow(
                            () -> new IllegalStateException(
                                    "Unable to read the model configuration after updating."));
        });

        if (result == null) {
            throw new IllegalStateException("The capability update transaction returned no result.");
        }

        return result;
    }

    private SyncResult writeCatalog(
            AiProviderRepository.ProviderSummary provider,
            List<OpenRouterModelService.CatalogModel> catalog) {

        if (!providers.lockForModelSync(
                provider.companyId(),
                provider.id(),
                provider.version())) {

            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Provider was changed or deleted. Reload and try again.");
        }

        var existingByModelId = new HashMap<String, AiModelRepository.ModelSummary>();

        for (var model : models.findByProvider(
                provider.companyId(),
                provider.id())) {

            existingByModelId.put(model.modelId(), model);
        }

        LocalDateTime checkedAt = LocalDateTime.now(ZoneOffset.UTC);
        var warnings = new ArrayList<String>();

        int created = 0;
        int updated = 0;

        for (var entry : catalog) {
            var existing = existingByModelId.get(entry.modelId());

            if (existing == null) {
                models.insertFromCatalog(
                        UUID.randomUUID().toString(),
                        provider.companyId(),
                        provider.id(),
                        entry,
                        checkedAt);

                created++;

            } else {
                int affected = models.updateCatalogCapabilities(
                        provider.companyId(),
                        provider.id(),
                        existing.id(),
                        entry,
                        checkedAt,
                        existing.version());

                if (affected != 1) {
                    throw new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "Model configuration changed. Sync was cancelled; try again.");
                }

                updated++;
            }

            if (entry.capabilities() == null) {
                warnings.add(
                        entry.modelId() + "：" + entry.capabilityError());
            }
        }

        return new SyncResult(
                created,
                updated,
                List.copyOf(warnings));
    }

    private List<OpenRouterModelService.CatalogModel> validateCatalog(
            List<OpenRouterModelService.CatalogModel> catalog) {

        if (catalog == null || catalog.isEmpty()) {
            throw invalidCatalog();
        }

        var result = new ArrayList<OpenRouterModelService.CatalogModel>();

        var seen = new HashSet<String>();

        for (var entry : catalog) {
            if (entry == null ||
                    entry.modelId() == null ||
                    !entry.modelId().matches("[!-~]{1,200}") ||
                    !seen.add(entry.modelId())) {
                throw invalidCatalog();
            }

            String name = entry.name() == null
                    ? entry.modelId()
                    : entry.name().trim();

            if (name.isBlank()) {
                name = entry.modelId();
            }

            String description = entry.description() == null
                    ? ""
                    : entry.description();

            String capabilityError = entry.capabilities() == null
                    ? "Capability metadata is missing or invalid."
                    : null;

            if (name.length() > 255 ||
                    description.getBytes(StandardCharsets.UTF_8).length > 65535) {
                throw invalidCatalog();
            }

            var capabilities = entry.capabilities();

            if (capabilities != null &&
                    capabilities.contextWindow() != null &&
                    capabilities.contextWindow() <= 0) {
                throw invalidCatalog();
            }

            result.add(new OpenRouterModelService.CatalogModel(
                    entry.modelId(),
                    name,
                    description,
                    capabilities,
                    capabilityError));
        }

        return List.copyOf(result);
    }

    private ResponseStatusException invalidCatalog() {
        return new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "The catalog is empty or contains invalid fields. No models were synced.");
    }
}