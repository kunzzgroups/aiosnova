package com.aiosnova.ai.mcp;

import java.util.Objects;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

public class AiMcpVerificationService {

    public record VerificationResult(
            String serverId,
            long version,
            boolean verified) {
    }

    private record Registration(
            AiMcpRepository.ServerRow snapshot,
            long registeredVersion) {
    }

    private final AiMcpRepository repository;
    private final AiMcpDiscoverySyncService.TransportFactory transports;
    private final TransactionTemplate transactions;
    private final String merchantId;
    private final Set<String> writableCompanies;

    public AiMcpVerificationService(
            AiMcpRepository repository,
            AiMcpDiscoverySyncService.TransportFactory transports,
            PlatformTransactionManager transactionManager,
            String merchantId,
            Set<String> writableCompanies) {

        this.repository = Objects.requireNonNull(repository);
        this.transports = Objects.requireNonNull(transports);
        this.transactions = new TransactionTemplate(
                Objects.requireNonNull(transactionManager));

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

    // 不添加 @Transactional。
    public VerificationResult verify(
            String companyId,
            String serverId,
            long expectedVersion) {

        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException(
                    "MCP verification must start outside a transaction.");
        }

        // 本流程会增加两次版本，提前避免 long 溢出。
        if (!validId(companyId, 64)
                || !validId(serverId, 36)
                || expectedVersion < 0
                || expectedVersion > Long.MAX_VALUE - 2) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid scope or version.");
        }

        if (!writableCompanies.contains(companyId)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Company is outside this MCP write scope.");
        }

        Registration registration = Objects.requireNonNull(
                transactions.execute(status -> {
                    var snapshot = repository.findServerForUpdate(
                                    companyId, merchantId, serverId)
                            .orElseThrow(() -> new ResponseStatusException(
                                    HttpStatus.NOT_FOUND,
                                    "MCP server not found in this scope."));

                    if (!companyId.equals(snapshot.companyId())
                            || !merchantId.equals(snapshot.merchantId())
                            || !serverId.equals(snapshot.id())) {
                        throw new IllegalStateException(
                                "MCP server scope mismatch.");
                    }

                    if (snapshot.version() != expectedVersion) {
                        throw conflict();
                    }

                    requireOne(repository.beginVerification(
                            companyId,
                            merchantId,
                            serverId,
                            expectedVersion,
                            snapshot.connectionRevision()));

                    return new Registration(
                            snapshot, expectedVersion + 1);
                }));

        // 登记事务已经提交，网络操作不能在事务里面。
        boolean verified;

        try {
            var transport = Objects.requireNonNull(
                    transports.create(registration.snapshot()));

            new AiMcpHandshake(transport).initialize();

            verified = true;
        } catch (RuntimeException failure) {
            // 不保存或输出上游原文；Repository 使用固定安全错误信息。
            verified = false;
        }

        final boolean outcome = verified;

        // 不把结果保存放进上面的 catch，防止把 409 当成网络失败。
        transactions.executeWithoutResult(status ->
                requireOne(repository.completeVerification(
                        companyId,
                        merchantId,
                        serverId,
                        registration.registeredVersion(),
                        registration.snapshot().connectionRevision(),
                        outcome)));

        return new VerificationResult(
                serverId,
                registration.registeredVersion() + 1,
                outcome);
    }

    private static boolean validId(String value, int maxLength) {
        return value != null
                && value.length() <= maxLength
                && value.matches("[A-Za-z0-9_-]+");
    }

    private static void requireOne(int affected) {
        if (affected != 1) {
            throw conflict();
        }
    }

    private static ResponseStatusException conflict() {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                "MCP configuration changed. Verify again.");
    }
}
