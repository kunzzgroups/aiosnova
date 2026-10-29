package com.aiosnova.ai.chat;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class AiChatTransportConfiguration {

    @Bean
    @ConditionalOnMissingBean(AiChatService.ChatTransport.class)
    AiChatService.ChatTransport aiChatTransport() {
        return AiChatService.defaultTransport();
    }
}
