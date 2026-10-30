package com.aiosnova.ai.mcp;

import java.net.URI;
import java.util.Base64;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import com.aiosnova.ai.provider.AiApiKeyCrypto;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

public class AiMcpWriteService {

    public record SaveRequest(
            String companyId,
            String name,
            String description,
            String endpointUrl,
            String authType,
            String apiKey,
            int timeoutSeconds) {

        @Override
        public String toString() {
            return "SaveRequest[credentials redacted]";
        }
    }

    public record SavedServer(String id, long version) {
    }

    private record Validated(
            String companyId,
            String name,
            String description,
            String endpointUrl,
            String authType,
            int timeoutSeconds) {
    }

    private final AiMcpRepository repository;
    private final AiApiKeyCrypto crypto;
    private final String merchantId;
    private final Set<String> writableCompanies;

    public AiMcpWriteService(
            AiMcpRepository repository,
            AiApiKeyCrypto crypto,
            String merchantId,
            Set<String> writableCompanies) {

        this.repository = Objects.requireNonNull(repository);
        this.crypto = Objects.requireNonNull(crypto);

        if (!validId(merchantId, 64)
                || writableCompanies == null
                || writableCompanies.stream()
                        .anyMatch(company -> !validId(company, 64))) {
            throw new IllegalArgumentException(
                    "Valid server-side Merchant and company scope are required.");
        }

        this.merchantId = merchantId;
        this.writableCompanies = Set.copyOf(writableCompanies);
    }

    @Transactional
    public SavedServer create(SaveRequest request) {
        requireTransaction();

        var input = validate(request);
        requireCompany(input.companyId());

        boolean hasKey = hasKey(request.apiKey());

        validateKey(input.authType(), request.apiKey());

        if ("api_key".equals(input.authType()) && !hasKey) {
            throw bad("API Key is required.");
        }

        String serverId = UUID.randomUUID().toString();

        String ciphertext = hasKey
                ? encrypt(input.companyId(), serverId, request.apiKey())
                : null;

        int affected = repository.insertServer(
                new AiMcpRepository.NewServer(
                        serverId,
                        input.companyId(),
                        merchantId,
                        input.name(),
                        input.description(),
                        input.endpointUrl(),
                        input.authType(),
                        ciphertext,
                        input.timeoutSeconds()));

        if (affected != 1) {
            throw new IllegalStateException(
                    "MCP server could not be saved.");
        }

        return new SavedServer(serverId, 0L);
    }

    @Transactional
    public SavedServer update(
            String serverId,
            long expectedVersion,
            SaveRequest request) {

        requireTransaction();

        var input = validate(request);
        requireCompany(input.companyId());

        if (!validId(serverId, 36)) {
            throw bad("Invalid MCP server ID.");
        }

        if (expectedVersion < 0) {
            throw bad("Invalid version.");
        }

        var current = repository.findServerForUpdate(
                        input.companyId(), merchantId, serverId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "MCP server not found in this scope."));

        // 防止错误的 Repository 实现返回其他范围的数据。
        if (!input.companyId().equals(current.companyId())
                || !merchantId.equals(current.merchantId())
                || !serverId.equals(current.id())) {
            throw new IllegalStateException("MCP server scope mismatch.");
        }

        if (current.version() != expectedVersion) {
            throw conflict();
        }

        validateKey(input.authType(), request.apiKey());

        boolean hasNewKey = hasKey(request.apiKey());

        if ("api_key".equals(input.authType())
                && !"api_key".equals(current.authType())
                && !hasNewKey) {
            throw bad("API Key is required when enabling API Key authentication.");
        }

        boolean connectionChanged =
                !input.endpointUrl().equals(current.endpointUrl())
                || !input.authType().equals(current.authType())
                || hasNewKey;

        // 切换到 None 清除旧密钥；API Key 留空则保留旧密钥。
        boolean replaceSecret =
                "none".equals(input.authType()) || hasNewKey;

        String ciphertext = hasNewKey
                ? encrypt(input.companyId(), serverId, request.apiKey())
                : null;

        int affected = repository.updateServer(
                input.companyId(),
                merchantId,
                serverId,
                expectedVersion,
                new AiMcpRepository.ServerEdit(
                        input.name(),
                        input.description(),
                        input.endpointUrl(),
                        input.authType(),
                        ciphertext,
                        replaceSecret,
                        input.timeoutSeconds(),
                        connectionChanged));

        if (affected != 1) {
            throw conflict();
        }

        return new SavedServer(
                serverId, Math.addExact(expectedVersion, 1L));
    }

    private Validated validate(SaveRequest request) {
        if (request == null) {
            throw bad("MCP server configuration is required.");
        }

        if (!validId(request.companyId(), 64)) {
            throw bad("Invalid company ID.");
        }

        String name = request.name() == null
                ? "" : request.name().trim();

        if (name.isEmpty() || name.length() > 255) {
            throw bad("Name must contain 1 to 255 characters.");
        }

        String description = request.description() == null
                ? "" : request.description();

        // 应用层限制，避免超过 MySQL TEXT 的字节容量。
        if (description.getBytes(
                java.nio.charset.StandardCharsets.UTF_8).length > 60000) {
            throw bad("Description is too long.");
        }

        String endpoint = validateEndpoint(request.endpointUrl());

        if (!Set.of("none", "api_key").contains(
                request.authType() == null ? "" : request.authType())) {
            throw bad("Unsupported authentication type.");
        }

        if (request.timeoutSeconds() < 1
                || request.timeoutSeconds() > 120) {
            throw bad("Timeout must be between 1 and 120 seconds.");
        }

        return new Validated(
                request.companyId(),
                name,
                description,
                endpoint,
                request.authType(),
                request.timeoutSeconds());
    }

    private static String validateEndpoint(String value) {
        if (value == null || value.isBlank() || value.length() > 2048) {
            throw bad("Invalid MCP endpoint URL.");
        }

        String endpoint = value.trim();

        final URI uri;

        try {
            uri = URI.create(endpoint);
        } catch (IllegalArgumentException error) {
            throw bad("Invalid MCP endpoint URL.");
        }

        String scheme = uri.getScheme();
        String host = uri.getHost();

        if (host == null
                || uri.getRawUserInfo() != null
                || uri.getRawFragment() != null
                || uri.getPort() == 0
                || uri.getPort() > 65535) {
            throw bad("Invalid MCP endpoint URL.");
        }

        boolean https = "https".equalsIgnoreCase(scheme);

        boolean localHttp = "http".equalsIgnoreCase(scheme)
                && Set.of("127.0.0.1", "localhost", "[::1]", "::1")
                        .contains(host.toLowerCase(java.util.Locale.ROOT));

        if (!https && !localHttp) {
            throw bad("Use HTTPS, or HTTP for a local loopback endpoint.");
        }

        return endpoint;
    }

    private static void validateKey(String authType, String apiKey) {
        if ("none".equals(authType) && hasKey(apiKey)) {
            throw bad("Do not supply an API Key for None authentication.");
        }

        if (hasKey(apiKey)
                && (apiKey.length() > 8192
                        || apiKey.chars().anyMatch(Character::isISOControl))) {
            throw bad("Invalid API Key.");
        }
    }

    private String encrypt(
            String companyId,
            String serverId,
            String apiKey) {

        // 使用独立的 MCP 上下文，避免与 Provider 密钥上下文混用。
        byte[] encrypted = crypto.encrypt(
                companyId, "mcp:" + serverId, apiKey);

        return crypto.keyId() + ":"
                + Base64.getEncoder().encodeToString(encrypted);
    }

    private void requireCompany(String companyId) {
        if (!writableCompanies.contains(companyId)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Company is outside this MCP write scope.");
        }
    }

    private static boolean hasKey(String apiKey) {
        return apiKey != null && !apiKey.isBlank();
    }

    private static boolean validId(String value, int maxLength) {
        return value != null
                && value.length() <= maxLength
                && value.matches("[A-Za-z0-9_-]+");
    }

    private static void requireTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException(
                    "An active transaction is required.");
        }
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST, message);
    }

    private static ResponseStatusException conflict() {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                "MCP server was modified. Reload and try again.");
    }
}