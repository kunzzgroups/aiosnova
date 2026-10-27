package com.aiosnova.ai.tool;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.EnableTransactionManagement;

@Configuration
@EnableTransactionManagement
@Import(AiToolManagementController.class)
@ConditionalOnProperty(
        prefix = "ai.tools.management",
        name = "enabled",
        havingValue = "true")
public class AiToolManagementConfiguration {

    @Bean
    AiToolRepository aiToolRepository(
            JdbcTemplate jdbc,
            @Value("${server.address:}") String serverAddress) {

        if (!"127.0.0.1".equals(serverAddress)) {
            throw new IllegalStateException(
                    "Local tool management requires server.address=127.0.0.1.");
        }

        String url = jdbc.execute(
                (ConnectionCallback<String>) connection ->
                        connection.getMetaData().getURL());

        String localTarget =
                "jdbc:mysql://127.0.0.1:3307/aiosnova_ai_local";

        if (url == null
                || !(url.equals(localTarget)
                        || url.startsWith(localTarget + "?"))) {
            throw new IllegalStateException(
                    "Local tool management requires the local AI database.");
        }

        return new AiToolRepository(jdbc);
    }

    @Bean
    AiToolReadService aiToolReadService(
            AiToolRepository repository,
            @Value("${ai.agents.merchant-id:}") String merchantId) {

        return new AiToolReadService(repository, merchantId);
    }

    @Bean
    AiToolWriteService aiToolWriteService(
            AiToolRepository repository,
            @Value("${ai.agents.merchant-id:}") String merchantId) {

        return new AiToolWriteService(repository, merchantId);
    }
}