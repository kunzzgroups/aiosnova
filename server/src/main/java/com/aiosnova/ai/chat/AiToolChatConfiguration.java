package com.aiosnova.ai.chat;

import java.util.List;

import com.aiosnova.ai.tool.AiToolAuthorizationService;
import com.aiosnova.ai.tool.AiToolDatabaseSource;
import com.aiosnova.ai.tool.AiToolRegistry;
import com.aiosnova.ai.tool.AiToolRepository;
import com.aiosnova.ai.tool.builtin.CalculatorTool;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "ai.tools.chat", name = "enabled", havingValue = "true")
public class AiToolChatConfiguration {

        @Bean
        AiAgentModelBindingValidator toolChatModelBindingValidator(
                        AiToolRepository repository,
                        @Value("${ai.agents.merchant-id:}") String merchantId) {

                return new AiAgentModelBindingValidator(repository, merchantId);
        }

        @Bean
        AiToolDatabaseSource toolChatDatabaseSource(
                        AiToolRepository repository,
                        @Value("${ai.agents.merchant-id:}") String merchantId,
                        @Value("${server.address:}") String address,
                        @Value("${ai.tools.management.enabled:false}") boolean managementEnabled) {

                if (!"127.0.0.1".equals(address) || !managementEnabled) {
                        throw new IllegalStateException(
                                        "Local tool chat requires loopback address "
                                                        + "and local tool management.");
                }

                return new AiToolDatabaseSource(repository, merchantId);
        }

        @Bean
        AiToolAuthorizationService toolChatAuthorization(
                        AiToolDatabaseSource source) {

                return new AiToolAuthorizationService(
                                source,
                                List.of(new AiToolRegistry.Registration(
                                                "calculator",
                                                new CalculatorTool())));
        }

        @Bean
        AiAgentExecutionParameterValidator toolChatParameterValidator(
                        AiToolRepository repository,
                        @Value("${ai.agents.merchant-id:}") String merchantId) {

                return new AiAgentExecutionParameterValidator(
                                repository, merchantId);
        }
}
