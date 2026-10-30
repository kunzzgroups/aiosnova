package com.aiosnova.ai.mcp;

import java.util.Objects;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

public class AiMcpDiscoverySyncService {

    @FunctionalInterface
    public interface TransportFactory {
        AiMcpTransport create(AiMcpRepository.ServerRow server);
    }

    private final AiMcpRepository repository;
    private final AiMcpCatalogSyncService sync;
    private final TransportFactory transports;
    private final String merchantId;
    private final Set<String> writableCompanies;

    public AiMcpDiscoverySyncService(
            AiMcpRepository repository,
            AiMcpCatalogSyncService sync,
            TransportFactory transports,
            String merchantId,
            Set<String> writableCompanies) {

        this.repository = Objects.requireNonNull(repository);
        this.sync = Objects.requireNonNull(sync);
        this.transports = Objects.requireNonNull(transports);

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

    // 不添加 @Transactional：网络发现必须在事务之外。
    public AiMcpCatalogSyncService.SyncResult discoverAndSync(
            String companyId,
            String serverId,
            long expectedServerVersion) {

        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException(
                    "MCP network discovery must run outside a transaction.");
        }

        if (!validId(companyId, 64)
                || !validId(serverId, 36)
                || expectedServerVersion < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid scope or version.");
        }

        if (!writableCompanies.contains(companyId)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Company is outside this MCP write scope.");
        }

        var snapshot = repository.findServer(
                        companyId, merchantId, serverId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "MCP server not found in this scope."));

        if (!companyId.equals(snapshot.companyId())
                || !merchantId.equals(snapshot.merchantId())
                || !serverId.equals(snapshot.id())) {
            throw new IllegalStateException("MCP server scope mismatch.");
        }

        if (snapshot.version() != expectedServerVersion
                || !"verified".equals(snapshot.verificationStatus())
                || !Objects.equals(
                        snapshot.verificationRevision(),
                        Long.valueOf(snapshot.connectionRevision()))) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "MCP configuration changed or needs verification.");
        }

        AiMcpTransport transport = Objects.requireNonNull(
                transports.create(snapshot));

        var discovered = new AiMcpDiscoveryService(transport).discover();

        // 必须注入经过 Spring 事务代理的同步 Service。
        return sync.sync(
                companyId,
                serverId,
                snapshot.version(),
                snapshot.connectionRevision(),
                discovered.tools());
    }

    private static boolean validId(String value, int maxLength) {
        return value != null
                && value.length() <= maxLength
                && value.matches("[A-Za-z0-9_-]+");
    }
}