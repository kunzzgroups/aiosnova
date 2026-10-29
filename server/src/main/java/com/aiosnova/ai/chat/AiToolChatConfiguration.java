package com.aiosnova.ai.chat;

import java.util.List;

import com.aiosnova.ai.tool.AiToolAuthorizationService;
import com.aiosnova.ai.tool.AiToolDatabaseSource;
import com.aiosnova.ai.tool.AiToolRegistry;
import com.aiosnova.ai.tool.AiToolRepository;
import com.aiosnova.ai.tool.builtin.CalculatorTool;
import com.aiosnova.ai.tool.AiToolHandler;
import com.aiosnova.auth.AuthRepository;
import com.aiosnova.auth.SessionService;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;

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
                        AiToolDatabaseSource source,
                        @Qualifier("toolChatCalculator") AiToolHandler calculator) {

                return new AiToolAuthorizationService(
                                source,
                                List.of(new AiToolRegistry.Registration(
                                                "calculator",
                                                calculator)));
        }

        @Bean
        AiAgentExecutionParameterValidator toolChatParameterValidator(
                        AiToolRepository repository,
                        @Value("${ai.agents.merchant-id:}") String merchantId) {

                return new AiAgentExecutionParameterValidator(
                                repository, merchantId);
        }

        @Bean("toolChatCalculator")
        @ConditionalOnMissingBean(name = "toolChatCalculator")
        AiToolHandler toolChatCalculator() {
                return new CalculatorTool();
        }

        @Bean
        AiToolChatRequests toolChatRequests() {
                return new AiToolChatRequests();
        }

        @Bean
        AiToolChatLifecycle toolChatLifecycle(
                        AiChatService service,
                        AiToolAuthorizationService authorization,
                        AiToolChatRequests requests) {

                return new AiToolChatLifecycle(
                                service,
                                authorization,
                                requests);
        }

        @Bean
        @ConditionalOnBean({ SessionService.class, AuthRepository.class })
        @ConditionalOnMissingBean(AiToolChatAccess.class)
        AiToolChatAccess toolChatAccess(
                        SessionService sessions,
                        AuthRepository repository,
                        @Value("${ai.agents.merchant-id:}") String merchantId) {

                return new AiSessionToolChatAccess(
                                sessions,
                                repository,
                                merchantId);
        }
}
