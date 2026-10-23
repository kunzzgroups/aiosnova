package com.aiosnova.ai;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Tests saved credentials without returning them to the browser. */
@Service
public class AiProviderVerificationService {
    private final AiProviderRepository providers;
    private final AiApiKeyCrypto crypto;
    private final AiConnectionService connections;

    public AiProviderVerificationService(AiProviderRepository providers, AiApiKeyCrypto crypto,
            AiConnectionService connections) {
        this.providers = providers;
        this.crypto = crypto;
        this.connections = connections;
    }

    public Map<String, Object> test(String companyId, String providerId, String modelId, long version) {
        if (companyId == null || !companyId.matches("[A-Za-z0-9_-]{1,64}") ||
                providerId == null || providerId.isBlank() || providerId.length() > 36 ||
                modelId == null || !modelId.matches("[!-~]{1,200}") || version < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid company, Provider, test model or version.");
        }
        var summary = providers.findByCompany(companyId).stream()
                .filter(item -> item.id().equals(providerId)).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Provider not found in this company."));
        if (summary.version() != version) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Provider changed. Reload and try again.");
        }
        var config = providers.findExecutionConfig(companyId, providerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Provider not found."));
        if (!config.enabled()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Enable the Provider first.");
        if (!"openrouter".equals(config.providerType()) || !"https://openrouter.ai/api/v1".equals(config.baseUrl())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only the official OpenRouter endpoint is supported.");
        }
        if (config.encryptedApiKey() == null || config.encryptedApiKey().length == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Save the Provider API Key first.");
        }
        String key;
        try {
            key = crypto.decrypt(companyId, providerId, config.keyId(), config.encryptedApiKey());
        } catch (IllegalStateException error) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Unable to decrypt the Provider key. Check the AI storage key configuration.");
        }
        var result = connections.testConnection(new AiConnectionService.ConnectionTestRequest(config.baseUrl(), key, modelId));
        var latest = providers.findByCompany(companyId).stream()
                .filter(item -> item.id().equals(providerId)).findFirst();
        if (latest.isEmpty() || latest.get().version() != version) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Provider changed during the test. Discard this result and test again.");
        }
        return result;
    }
}
