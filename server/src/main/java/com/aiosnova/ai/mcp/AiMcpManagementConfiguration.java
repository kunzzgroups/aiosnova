package com.aiosnova.ai.mcp;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import java.net.URI;
import java.time.Duration;

import com.aiosnova.ai.provider.AiApiKeyCrypto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods = false)
@EnableTransactionManagement
@Profile("ai-standalone")
@Import(AiMcpManagementController.class)
@ConditionalOnProperty(prefix = "ai.mcp.management", name = "enabled", havingValue = "true")
public class AiMcpManagementConfiguration {

    @Bean
    AiMcpRepository aiMcpRepository(
            JdbcTemplate jdbc,
            @Value("${server.address:}") String serverAddress) {
        if (!"127.0.0.1".equals(serverAddress)) {
            throw new IllegalStateException(
                    "Local MCP management requires server.address=127.0.0.1.");
        }
        String url = jdbc.execute((ConnectionCallback<String>) connection -> connection.getMetaData().getURL());
        String localTarget = "jdbc:mysql://127.0.0.1:3307/aiosnova_ai_local";
        if (url == null || !(url.equals(localTarget) || url.startsWith(localTarget + "?"))) {
            throw new IllegalStateException(
                    "Local MCP management requires the local AI database.");
        }
        return new AiMcpRepository(jdbc);
    }

    @Bean
    AiMcpReadService aiMcpReadService(
            AiMcpRepository repository,
            @Value("${ai.agents.merchant-id:}") String merchantId) {
        return new AiMcpReadService(repository, merchantId);
    }

    @Bean
    AiMcpWriteService aiMcpWriteService(
            AiMcpRepository repository,
            AiApiKeyCrypto crypto,
            @Value("${ai.agents.merchant-id:}") String merchantId,
            @Value("${ai.mcp.management.writable-companies:}") String companies) {
        return new AiMcpWriteService(repository, crypto, merchantId, parseCompanies(companies));
    }

    private static Set<String> parseCompanies(String companies) {
        return Arrays.stream(companies.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    @Bean
    @ConditionalOnMissingBean(AiMcpDiscoverySyncService.TransportFactory.class)
    AiMcpDiscoverySyncService.TransportFactory aiMcpTransportFactory() {
        return server -> {
            if (!"none".equals(server.authType())) {
                throw new IllegalStateException(
                        "Authenticated MCP transport is not configured.");
            }

            return new AiMcpHttpTransport(
                    URI.create(server.endpointUrl()),
                    Duration.ofSeconds(server.timeoutSeconds()));
        };
    }

    @Bean
    AiMcpCatalogSyncService aiMcpCatalogSyncService(
            AiMcpRepository repository,
            @Value("${ai.agents.merchant-id:}") String merchantId,
            @Value("${ai.mcp.management.writable-companies:}") String companies) {

        return new AiMcpCatalogSyncService(
                repository, merchantId, parseCompanies(companies));
    }

    @Bean
    AiMcpDiscoverySyncService aiMcpDiscoverySyncService(
            AiMcpRepository repository,
            AiMcpCatalogSyncService sync,
            AiMcpDiscoverySyncService.TransportFactory transports,
            @Value("${ai.agents.merchant-id:}") String merchantId,
            @Value("${ai.mcp.management.writable-companies:}") String companies) {

        return new AiMcpDiscoverySyncService(
                repository,
                sync,
                transports,
                merchantId,
                parseCompanies(companies));
    }

    @Bean
    AiMcpVerificationService aiMcpVerificationService(
            AiMcpRepository repository,
            AiMcpDiscoverySyncService.TransportFactory transports,
            PlatformTransactionManager transactionManager,
            @Value("${ai.agents.merchant-id:}") String merchantId,
            @Value("${ai.mcp.management.writable-companies:}") String companies) {

        return new AiMcpVerificationService(
                repository,
                transports,
                transactionManager,
                merchantId,
                parseCompanies(companies));
    }
}
