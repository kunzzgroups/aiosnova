package com.aiosnova.ai.mcp;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

public class AiMcpCatalogSyncService {

    public record SyncResult(
            String serverId,
            long version,
            int added,
            int updated,
            int unavailable) {
    }

    private final AiMcpRepository repository;
    private final String merchantId;
    private final Set<String> writableCompanies;

    private final JsonMapper json = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .build();

    public AiMcpCatalogSyncService(
            AiMcpRepository repository,
            String merchantId,
            Set<String> writableCompanies) {

        this.repository = Objects.requireNonNull(repository);

        if (!validId(merchantId, 64)
                || writableCompanies == null
                || writableCompanies.stream()
                        .anyMatch(company -> !validId(company, 64))) {
            throw new IllegalArgumentException(
                    "Valid Merchant and company scope are required.");
        }

        this.merchantId = merchantId;
        this.writableCompanies = Set.copyOf(writableCompanies);
    }

    @Transactional
    public SyncResult sync(
            String companyId,
            String serverId,
            long expectedServerVersion,
            long expectedConnectionRevision,
            List<AiMcpToolDiscovery.DiscoveredTool> discovered) {

        requireTransaction();

        if (!validId(companyId, 64)
                || !validId(serverId, 36)
                || expectedServerVersion < 0
                || expectedConnectionRevision < 0) {
            throw bad("Invalid scope or version.");
        }

        if (!writableCompanies.contains(companyId)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Company is outside this MCP write scope.");
        }

        var incoming = validateCatalog(discovered);

        var server = repository.findServerForUpdate(
                        companyId, merchantId, serverId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "MCP server not found in this scope."));

        if (!companyId.equals(server.companyId())
                || !merchantId.equals(server.merchantId())
                || !serverId.equals(server.id())) {
            throw new IllegalStateException("MCP server scope mismatch.");
        }

        if (server.version() != expectedServerVersion
                || server.connectionRevision() != expectedConnectionRevision
                || !"verified".equals(server.verificationStatus())
                || !Objects.equals(
                        server.verificationRevision(),
                        Long.valueOf(expectedConnectionRevision))) {
            throw conflict();
        }

        var existing = new LinkedHashMap<
                String, AiMcpRepository.CatalogToolRow>();

        for (var tool : repository.findCatalogForUpdate(
                companyId, merchantId, serverId)) {

            if (!companyId.equals(tool.companyId())
                    || !serverId.equals(tool.serverId())
                    || existing.putIfAbsent(
                            tool.remoteName(), tool) != null) {
                throw new IllegalStateException(
                        "Stored MCP catalog scope or identity mismatch.");
            }
        }

        int added = 0;
        int updated = 0;
        int unavailable = 0;

        for (var entry : incoming.entrySet()) {
            var tool = entry.getValue();
            var previous = existing.get(entry.getKey());

            String toolId = previous == null
                    ? UUID.randomUUID().toString()
                    : previous.id();

            var write = new AiMcpRepository.CatalogToolWrite(
                    toolId,
                    tool.name(),
                    tool.description(),
                    tool.inputSchema(),
                    expectedConnectionRevision);

            if (previous == null) {
                requireOne(repository.insertCatalogTool(
                        companyId, merchantId, serverId, write));
                added++;
            } else {
                boolean schemaChanged = !schema(previous.inputSchema())
                        .equals(schema(tool.inputSchema()));

                boolean disable = schemaChanged
                        || !previous.available()
                        || previous.discoveredConnectionRevision()
                                != expectedConnectionRevision;

                requireOne(repository.updateCatalogTool(
                        companyId,
                        merchantId,
                        serverId,
                        previous.version(),
                        write,
                        disable));

                updated++;
            }
        }

        for (var previous : existing.values()) {
            if (!incoming.containsKey(previous.remoteName())
                    && (previous.available() || previous.enabled())) {

                requireOne(repository.markCatalogToolUnavailable(
                        companyId,
                        merchantId,
                        serverId,
                        previous.id(),
                        previous.version()));

                unavailable++;
            }
        }

        requireOne(repository.completeCatalogDiscovery(
                companyId,
                merchantId,
                serverId,
                expectedServerVersion,
                expectedConnectionRevision));

        return new SyncResult(
                serverId,
                Math.addExact(expectedServerVersion, 1L),
                added,
                updated,
                unavailable);
    }

    private Map<String, AiMcpToolDiscovery.DiscoveredTool> validateCatalog(
            List<AiMcpToolDiscovery.DiscoveredTool> discovered) {

        if (discovered == null || discovered.size() > 2000) {
            throw bad("Invalid MCP catalog.");
        }

        var result = new LinkedHashMap<
                String, AiMcpToolDiscovery.DiscoveredTool>();

        for (var tool : discovered) {
            if (tool == null
                    || tool.name() == null
                    || tool.name().isBlank()
                    || tool.name().codePointCount(
                            0, tool.name().length()) > 255
                    || tool.name().chars().anyMatch(Character::isISOControl)
                    || tool.description() == null
                    || tool.description().getBytes(
                            StandardCharsets.UTF_8).length > 60000) {
                throw bad("Invalid MCP tool definition.");
            }

            schema(tool.inputSchema());

            if (result.putIfAbsent(tool.name(), tool) != null) {
                throw bad("Duplicate MCP tool name.");
            }
        }

        return result;
    }

    private JsonNode schema(String text) {
        final JsonNode parsed;

        try {
            parsed = text == null ? null : json.readTree(text);
        } catch (RuntimeException error) {
            throw bad("Invalid MCP tool schema.");
        }

        if (parsed == null || !parsed.isObject()) {
            throw bad("Invalid MCP tool schema.");
        }

        return parsed;
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

    private static void requireOne(int affected) {
        if (affected != 1) {
            throw conflict();
        }
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST, message);
    }

    private static ResponseStatusException conflict() {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                "MCP configuration changed. Run discovery again.");
    }
}
