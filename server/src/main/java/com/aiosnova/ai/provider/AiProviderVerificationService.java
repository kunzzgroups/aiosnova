package com.aiosnova.ai.provider;

import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Verifies saved Provider configuration and persists safe results. */
@Service
public class AiProviderVerificationService {

    private final AiProviderRepository providers;
    private final AiApiKeyCrypto crypto;
    private final AiConnectionService connections;

    public AiProviderVerificationService(
            AiProviderRepository providers,
            AiApiKeyCrypto crypto,
            AiConnectionService connections) {

        this.providers = providers;
        this.crypto = crypto;
        this.connections = connections;
    }

    private record VerificationOutcome(
            boolean ok,
            String reply,
            String code,
            String message) {
    }

    public Map<String, Object> test(
            String companyId,
            String providerId,
            String modelId,
            long version) {

        if (companyId == null
                || !companyId.matches("[A-Za-z0-9_-]{1,64}")
                || providerId == null
                || providerId.isBlank()
                || providerId.length() > 36
                || modelId == null
                || !modelId.matches("[!-~]{1,200}")
                || version < 0) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid company, Provider, test model or version.");
        }

        // Read the version before reading credentials.
        var state = providers
                .findVerificationState(companyId, providerId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Provider not found in this company."));

        if (state.version() != version) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Provider changed. Reload and try again.");
        }

        var config = providers
                .findExecutionConfig(companyId, providerId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Provider not found in this company."));

        if (!config.enabled()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Enable the Provider first.");
        }

        if (!"openrouter".equals(config.providerType())
                || !"https://openrouter.ai/api/v1"
                        .equals(config.baseUrl())) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Only the official OpenRouter endpoint is supported.");
        }

        if (config.encryptedApiKey() == null
                || config.encryptedApiKey().length == 0) {

            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Save the Provider API Key first.");
        }

        String attemptId = UUID.randomUUID().toString();
        long connectionRevision = state.connectionRevision();

        int started = providers.beginVerification(
                companyId,
                providerId,
                version,
                connectionRevision,
                attemptId);

        if (started != 1) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Provider changed before verification. Reload and try again.");
        }

        String key;

        try {
            key = crypto.decrypt(
                    companyId,
                    providerId,
                    config.keyId(),
                    config.encryptedApiKey());
        } catch (IllegalStateException error) {
            return finish(
                    companyId,
                    providerId,
                    connectionRevision,
                    attemptId,
                    modelId,
                    new VerificationOutcome(
                            false,
                            "",
                            "credential_decryption_failed",
                            "Unable to decrypt the saved Provider key. Check the AI storage key configuration."));
        }

        VerificationOutcome outcome;

        try {
            var result = connections.testConnection(
                    new AiConnectionService.ConnectionTestRequest(
                            config.baseUrl(),
                            key,
                            modelId));

            outcome = normalizeResult(result);
        } catch (RuntimeException error) {
            // Do not save exception text or upstream response bodies.
            outcome = new VerificationOutcome(
                    false,
                    "",
                    "verification_internal_error",
                    "Unable to complete model verification.");
        }

        // Keep database writes outside the network exception handler.
        return finish(
                companyId,
                providerId,
                connectionRevision,
                attemptId,
                modelId,
                outcome);
    }

    private Map<String, Object> finish(
            String companyId,
            String providerId,
            long connectionRevision,
            String attemptId,
            String modelId,
            VerificationOutcome outcome) {

        int saved = providers.completeVerification(
                companyId,
                providerId,
                connectionRevision,
                attemptId,
                modelId,
                outcome.ok(),
                outcome.code(),
                outcome.message());

        if (saved != 1) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Provider changed or another verification superseded this request. Discard this result and reload.");
        }

        var latest = providers
                .findVerificationState(companyId, providerId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Provider was deleted after verification. Reload."));

        String expectedStatus = outcome.ok() ? "verified" : "failed";

        if (latest.connectionRevision() != connectionRevision
                || latest.verificationRevision() == null
                || latest.verificationRevision() != connectionRevision
                || !expectedStatus.equals(latest.verificationStatus())
                || !modelId.equals(latest.verificationModelId())
                || latest.verificationAttemptId() != null) {

            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Provider verification changed. Reload to see the latest state.");
        }

        return Map.of(
                "ok", outcome.ok(),
                "message", outcome.message(),
                "reply", outcome.reply(),
                "errorCode", outcome.code(),
                "verificationStatus", latest.verificationStatus(),
                "connectionRevision", latest.connectionRevision(),
                "providerVersion", latest.version());
    }

    private VerificationOutcome normalizeResult(
            Map<String, Object> result) {

        if (result != null
                && Boolean.TRUE.equals(result.get("ok"))
                && result.get("reply") instanceof String reply
                && !reply.isBlank()) {

            return new VerificationOutcome(
                    true,
                    reply,
                    "",
                    "Model connection successful.");
        }

        String message =
                result != null && result.get("message") instanceof String text
                        ? text
                        : "";

        String code = switch (message) {
            case "Authentication failed. Check the OpenRouter API Key."
                    -> "authentication_failed";
            case "Insufficient OpenRouter credits. Check your balance or key limits."
                    -> "insufficient_credits";
            case "Rate limit reached. Try again later."
                    -> "rate_limited";
            case "Model request timed out."
                    -> "timeout";
            case "Model request was interrupted."
                    -> "interrupted";
            case "Unable to connect to the model service."
                    -> "connection_failed";
            case "OpenRouter returned an error instead of a model reply.",
                 "The model returned no valid text reply.",
                 "Invalid request parameters or model response format."
                    -> "invalid_response";
            default -> "";
        };

        // Only persist recognized, safe diagnostic messages.
        if (!code.isEmpty()) {
            return new VerificationOutcome(false, "", code, message);
        }

        if (message.matches(
                "Model request failed\\. HTTP status: [1-5][0-9]{2}")) {

            return new VerificationOutcome(
                    false,
                    "",
                    "upstream_http_error",
                    message);
        }

        return new VerificationOutcome(
                false,
                "",
                "verification_failed",
                "The model did not return a valid verification result.");
    }
}
