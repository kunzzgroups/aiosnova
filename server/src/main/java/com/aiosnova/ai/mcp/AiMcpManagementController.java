package com.aiosnova.ai.mcp;

import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/ai/mcp/servers")
@ConditionalOnProperty(prefix = "ai.mcp.management", name = "enabled", havingValue = "true")
public class AiMcpManagementController {

    public record ServerList(
            List<AiMcpRepository.ServerRow> items) {
    }

    private final AiMcpReadService reads;
    private final AiMcpWriteService writes;
    private final AiMcpVerificationService verification;
    private final AiMcpDiscoverySyncService discovery;

    public AiMcpManagementController(AiMcpReadService reads) {
        this(reads, null, null, null);
    }

    public AiMcpManagementController(
            AiMcpReadService reads,
            AiMcpWriteService writes) {

        this(reads, writes, null, null);
    }

    @Autowired
    public AiMcpManagementController(
            AiMcpReadService reads,
            AiMcpWriteService writes,
            AiMcpVerificationService verification,
            AiMcpDiscoverySyncService discovery) {

        this.reads = reads;
        this.writes = writes;
        this.verification = verification;
        this.discovery = discovery;
    }

    public record SaveServerRequest(
            String companyId, String name, String description, String endpointUrl,
            String authType, String apiKey, Integer timeoutSeconds, Long version) {
        AiMcpWriteService.SaveRequest toServiceRequest() {
            if (timeoutSeconds == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Timeout is required.");
            }
            return new AiMcpWriteService.SaveRequest(companyId, name, description,
                    endpointUrl, authType, apiKey, timeoutSeconds);
        }

        @Override
        public String toString() {
            return "SaveServerRequest[credentials redacted]";
        }
    }

    public record OperationRequest(
            String companyId,
            Long version) {

        long requiredVersion() {
            if (version == null || version < 0) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "A valid version is required.");
            }

            return version;
        }
    }

    public record ToolList(
            List<AiMcpReadService.ToolDetail> items) {
    }

    @GetMapping("/{serverId}/tools")
    public ToolList tools(
            @PathVariable("serverId") String serverId,
            @RequestParam("companyId") String companyId) {

        return new ToolList(reads.tools(companyId, serverId));
    }

    @PostMapping("/{serverId}/verify")
    public AiMcpVerificationService.VerificationResult verify(
            @PathVariable("serverId") String serverId,
            @RequestBody OperationRequest request) {

        if (verification == null) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "MCP verification is not configured.");
        }

        return verification.verify(
                request.companyId(),
                serverId,
                request.requiredVersion());
    }

    @PostMapping("/{serverId}/discover")
    public AiMcpCatalogSyncService.SyncResult discover(
            @PathVariable("serverId") String serverId,
            @RequestBody OperationRequest request) {

        if (discovery == null) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "MCP discovery is not configured.");
        }

        return discovery.discoverAndSync(
                request.companyId(),
                serverId,
                request.requiredVersion());
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleOperationFailure(
            IllegalStateException error) {

        // 不把异常原文或上游内容返回浏览器。
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(Map.of(
                        "code", "mcp_operation_failed",
                        "message", "MCP operation failed."));
    }

    @PostMapping
    public ResponseEntity<AiMcpWriteService.SavedServer> create(
            @RequestBody SaveServerRequest request) {
        requireWrites();
        if (request.version() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Do not supply a version when creating a server.");
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(writes.create(request.toServiceRequest()));
    }

    @PatchMapping("/{serverId}")
    public AiMcpWriteService.SavedServer update(
            @PathVariable("serverId") String serverId,
            @RequestBody SaveServerRequest request) {
        requireWrites();
        if (request.version() == null || request.version() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A valid version is required.");
        }
        return writes.update(serverId, request.version(), request.toServiceRequest());
    }

    private void requireWrites() {
        if (writes == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "MCP writes are not configured.");
        }
    }

    @GetMapping
    public ServerList list(
            @RequestParam("companyId") String companyId) {

        return new ServerList(reads.list(companyId));
    }

    @GetMapping("/{serverId}")
    public AiMcpRepository.ServerRow get(
            @RequestParam("companyId") String companyId,
            @PathVariable("serverId") String serverId) {

        return reads.get(companyId, serverId);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleStatus(
            ResponseStatusException error) {

        String message = error.getReason() == null
                ? "MCP request failed."
                : error.getReason();

        return ResponseEntity.status(error.getStatusCode())
                .body(Map.of("message", message));
    }
}
