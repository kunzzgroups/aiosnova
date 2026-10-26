package com.aiosnova.ai;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.HashSet;
import java.util.List;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AiProviderService {

        private final AiProviderRepository repository;
        private final AiApiKeyCrypto crypto;

        public AiProviderService(
                        AiProviderRepository repository,
                        AiApiKeyCrypto crypto) {
                this.repository = repository;
                this.crypto = crypto;
        }

        public record DeleteProviderItem(
                        String id,
                        Long version) {
        }

        @Transactional
        public AiProviderRepository.ProviderSummary create(
                        String companyId,
                        String name,
                        String baseUrl,
                        boolean enabled,
                        String apiKey) {
                // 1. 检查并整理输入。
                String normalizedCompanyId = requiredText(companyId, "Company ID", 64);

                if (!normalizedCompanyId.matches("[A-Za-z0-9_-]+")) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Company ID may contain letters, digits, underscores and hyphens only.");
                }

                String normalizedName = requiredText(name, "Provider name", 120);

                String normalizedBaseUrl = requiredText(baseUrl, "Base URL", 512);

                if (!"https://openrouter.ai/api/v1".equals(normalizedBaseUrl)) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Only https://openrouter.ai/api/v1 is currently supported.");
                }

                // 2. 先生成 ID，加密时需要绑定这个 ID。
                String id = UUID.randomUUID().toString();

                byte[] encryptedApiKey = null;
                String keyId = null;

                // 允许先建立不含密钥的 Provider，用于同步公开目录。
                if (apiKey != null && !apiKey.isBlank()) {
                        String normalizedApiKey = apiKey.trim();

                        if (normalizedApiKey.getBytes(StandardCharsets.UTF_8).length > 4096 ||
                                        normalizedApiKey.chars().anyMatch(Character::isISOControl)) {
                                throw new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "API Key is too long or contains control characters.");
                        }

                        // 3. 将明文转换为密文。
                        encryptedApiKey = crypto.encrypt(
                                        normalizedCompanyId,
                                        id,
                                        normalizedApiKey);

                        keyId = crypto.keyId();
                }

                // 4. 只把密文交给 Repository。
                try {
                        repository.insert(
                                        id,
                                        normalizedCompanyId,
                                        normalizedName,
                                        normalizedBaseUrl,
                                        enabled,
                                        encryptedApiKey,
                                        keyId);
                } catch (DuplicateKeyException error) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Provider already exists. Check the name and try again.");
                }

                return requireProvider(normalizedCompanyId, id);
        }

        @Transactional
        public AiProviderRepository.ProviderSummary update(
                        String companyId,
                        String providerId,
                        String name,
                        String baseUrl,
                        boolean enabled,
                        String apiKey,
                        long expectedVersion) {

                String normalizedCompanyId = validateCompanyId(companyId);
                String normalizedProviderId = requiredText(providerId, "Provider ID", 36);

                String normalizedName = requiredText(name, "Provider name", 120);

                String normalizedBaseUrl = requiredText(baseUrl, "Base URL", 512);

                if (!"https://openrouter.ai/api/v1".equals(normalizedBaseUrl)) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Only https://openrouter.ai/api/v1 is currently supported.");
                }

                var existing = requireProvider(
                                normalizedCompanyId,
                                normalizedProviderId);

                checkVersion(existing, expectedVersion);

                // null 表示本次不替换密钥。
                byte[] encryptedApiKey = null;
                String keyId = null;

                if (apiKey != null && !apiKey.isBlank()) {
                        String normalizedApiKey = apiKey.trim();

                        if (normalizedApiKey.getBytes(StandardCharsets.UTF_8).length > 4096 ||
                                        normalizedApiKey.chars().anyMatch(Character::isISOControl)) {
                                throw new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "API Key is too long or contains control characters.");
                        }

                        encryptedApiKey = crypto.encrypt(
                                        normalizedCompanyId,
                                        normalizedProviderId,
                                        normalizedApiKey);

                        keyId = crypto.keyId();
                }

                boolean connectionChanged = !normalizedBaseUrl.equals(existing.baseUrl())
                                || encryptedApiKey != null;

                int affected;

                try {
                        affected = repository.update(
                                        normalizedCompanyId,
                                        normalizedProviderId,
                                        normalizedName,
                                        normalizedBaseUrl,
                                        enabled,
                                        encryptedApiKey,
                                        keyId,
                                        expectedVersion);
                } catch (DuplicateKeyException error) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Provider already exists. Check the name and try again.");
                }

                if (affected != 1) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Provider was changed or deleted. Reload and try again.");
                }

                if (connectionChanged) {
                        int invalidated = repository.invalidateVerificationAfterConnectionChange(
                                        normalizedCompanyId,
                                        normalizedProviderId,
                                        expectedVersion + 1);

                        if (invalidated != 1) {
                                throw new ResponseStatusException(
                                                HttpStatus.CONFLICT,
                                                "Provider changed while resetting verification. Reload and try again.");
                        }
                }

                return requireProvider(
                                normalizedCompanyId,
                                normalizedProviderId);
        }

        @Transactional
        public AiProviderRepository.ProviderSummary setEnabled(
                        String companyId,
                        String providerId,
                        boolean enabled,
                        long expectedVersion) {

                String normalizedCompanyId = validateCompanyId(companyId);
                String normalizedProviderId = requiredText(providerId, "Provider ID", 36);

                var existing = requireProvider(
                                normalizedCompanyId,
                                normalizedProviderId);

                checkVersion(existing, expectedVersion);

                int affected = repository.updateEnabled(
                                normalizedCompanyId,
                                normalizedProviderId,
                                enabled,
                                expectedVersion);

                if (affected != 1) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Provider was changed or deleted. Reload and try again.");
                }

                return requireProvider(
                                normalizedCompanyId,
                                normalizedProviderId);
        }

        @Transactional
        public void delete(
                        String companyId,
                        String providerId,
                        long expectedVersion) {

                String normalizedCompanyId = validateCompanyId(companyId);

                String normalizedProviderId = requiredText(providerId, "Provider ID", 36);

                var existing = requireProvider(
                                normalizedCompanyId,
                                normalizedProviderId);

                checkVersion(existing, expectedVersion);

                if (existing.enabled()) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Disable the Provider before deleting it.");
                }

                int affected = repository.deleteDisabled(
                                normalizedCompanyId,
                                normalizedProviderId,
                                expectedVersion);

                if (affected != 1) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Provider state changed. Reload and try again.");
                }
        }

        @Transactional
        public int deleteMany(
                        String companyId,
                        List<DeleteProviderItem> items) {

                String normalizedCompanyId = validateCompanyId(companyId);

                if (items == null || items.isEmpty()) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Select at least one Provider.");
                }

                if (items.size() > 100) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Delete at most 100 Providers at a time.");
                }

                var seenIds = new HashSet<String>();

                // 先检查整批记录，全部通过后才开始删除。
                for (var item : items) {
                        if (item == null || item.version() == null) {
                                throw new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "Provide the ID and version for every Provider.");
                        }

                        String id = requiredText(item.id(), "Provider ID", 36);

                        if (!seenIds.add(id)) {
                                throw new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "Do not submit the same Provider twice.");
                        }

                        var existing = requireProvider(normalizedCompanyId, id);

                        checkVersion(existing, item.version());

                        if (existing.enabled()) {
                                throw new ResponseStatusException(
                                                HttpStatus.CONFLICT,
                                                "Some selected Providers are enabled. Disable all of them first.");
                        }
                }

                // 删除时再次通过 SQL 检查公司、启用状态和版本。
                for (var item : items) {
                        int affected = repository.deleteDisabled(
                                        normalizedCompanyId,
                                        item.id().trim(),
                                        item.version());

                        if (affected != 1) {
                                throw new ResponseStatusException(
                                                HttpStatus.CONFLICT,
                                                "Some Providers changed. Batch deletion was cancelled; reload and try again.");
                        }
                }

                return items.size();
        }

        private String validateCompanyId(String companyId) {
                String value = requiredText(companyId, "Company ID", 64);

                if (!value.matches("[A-Za-z0-9_-]+")) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Company ID may contain letters, digits, underscores and hyphens only.");
                }

                return value;
        }

        private AiProviderRepository.ProviderSummary requireProvider(
                        String companyId,
                        String providerId) {

                return repository.findByCompany(companyId)
                                .stream()
                                .filter(provider -> provider.id().equals(providerId))
                                .findFirst()
                                .orElseThrow(() -> new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "Provider not found in this company."));
        }

        private void checkVersion(
                        AiProviderRepository.ProviderSummary provider,
                        long expectedVersion) {

                if (expectedVersion < 0) {
                        throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Version must not be negative.");
                }

                if (provider.version() != expectedVersion) {
                        throw new ResponseStatusException(
                                        HttpStatus.CONFLICT,
                                        "Provider was modified. Reload and try again.");
                }
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