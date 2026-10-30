package com.aiosnova.ai.mcp;

import java.util.List;
import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

public class AiMcpReadService {

    private final AiMcpRepository repository;
    private final String merchantId;

    public record ToolDetail(
            String id,
            String companyId,
            String serverId,
            String remoteName,
            String description,
            JsonNode inputSchema,
            boolean enabled,
            boolean available,
            long discoveredConnectionRevision,
            long version) {
    }

    public AiMcpReadService(
            AiMcpRepository repository,
            String merchantId) {

        this.repository = Objects.requireNonNull(repository);

        if (merchantId == null
                || !merchantId.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new IllegalArgumentException(
                    "Valid Merchant ID is required.");
        }

        this.merchantId = merchantId;
    }

    public List<AiMcpRepository.ServerRow> list(String companyId) {
        requireCompany(companyId);

        return repository.findServers(companyId, merchantId);
    }

    public AiMcpRepository.ServerRow get(
            String companyId,
            String serverId) {

        requireCompany(companyId);

        if (serverId == null
                || !serverId.matches("[A-Za-z0-9_-]{1,36}")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid MCP server ID.");
        }

        return repository.findServer(
                companyId, merchantId, serverId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "MCP server not found in this scope."));
    }

    private static void requireCompany(String companyId) {
        if (companyId == null
                || !companyId.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid company ID.");
        }
    }

    public List<ToolDetail> tools(
            String companyId,
            String serverId) {

        // 先检查 Server 是否属于当前 Company／Merchant。
        var server = get(companyId, serverId);

        var json = JsonMapper.builder().build();

        return repository.findCatalog(
                companyId, merchantId, server.id())
                .stream()
                .map(tool -> {
                    if (!companyId.equals(tool.companyId())
                            || !server.id().equals(tool.serverId())) {
                        throw new IllegalStateException(
                                "Stored MCP tool scope mismatch.");
                    }

                    final JsonNode schema;

                    try {
                        schema = json.readTree(tool.inputSchema());
                    } catch (RuntimeException error) {
                        throw new IllegalStateException(
                                "Stored MCP tool schema is invalid.");
                    }

                    if (schema == null || !schema.isObject()) {
                        throw new IllegalStateException(
                                "Stored MCP tool schema is invalid.");
                    }

                    return new ToolDetail(
                            tool.id(),
                            tool.companyId(),
                            tool.serverId(),
                            tool.remoteName(),
                            tool.description(),
                            schema,
                            tool.enabled(),
                            tool.available(),
                            tool.discoveredConnectionRevision(),
                            tool.version());
                })
                .toList();
    }
}
