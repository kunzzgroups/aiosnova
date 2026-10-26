package com.aiosnova_standalone;

import java.util.Map;

import com.aiosnova.ai.AiConnectionController;
import com.aiosnova.ai.AiConnectionService;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import com.aiosnova.ai.AiModelController;
import com.aiosnova.ai.OpenRouterModelService;
import com.aiosnova.ai.AiProviderRepository;
import com.aiosnova.ai.AiProviderController;
import com.aiosnova.ai.AiApiKeyCrypto;
import com.aiosnova.ai.AiProviderService;
import com.aiosnova.ai.AiProviderVerificationService;
import com.aiosnova.ai.AiChatService;
import com.aiosnova.ai.AiChatController;
import com.aiosnova.ai.AiChatMessageValidator;
import com.aiosnova.ai.AiModelRepository;
import com.aiosnova.ai.AiModelConfigController;
import com.aiosnova.ai.AiModelSyncService;
import com.aiosnova.ai.AiModelStateService;
import com.aiosnova.ai.AiModelPreferencesService;
import com.aiosnova.ai.AiModelPreferencesController;
import com.aiosnova.ai.AiAgentRepository;
import com.aiosnova.ai.AiMigrationToolsConfiguration;
import com.aiosnova.ai.AiAgentWriteService;
import com.aiosnova.ai.AiKnowledgeAccess;
import com.aiosnova.ai.AiKnowledgeRepository;
import com.aiosnova.ai.AiKnowledgeService;
import com.aiosnova.ai.AiKnowledgeController;
import com.aiosnova.ai.AiAgentService;
import com.aiosnova.ai.AiAgentController;

@Configuration
@EnableAutoConfiguration
@Import({
    AiConnectionController.class,
    AiConnectionService.class,
    AiModelController.class,
    OpenRouterModelService.class,
    AiProviderRepository.class,
    AiProviderController.class,
    AiApiKeyCrypto.class,
    AiProviderService.class,
    AiProviderVerificationService.class,
    AiChatService.class,
    AiChatController.class,
    AiChatMessageValidator.class,
    AiModelRepository.class,
    AiModelConfigController.class,
    AiModelSyncService.class,
    AiModelStateService.class,
    AiModelPreferencesService.class,
    AiModelPreferencesController.class,
    AiAgentRepository.class,
    AiMigrationToolsConfiguration.class,
    AiAgentWriteService.class,
    AiKnowledgeAccess.class,
    AiKnowledgeRepository.class,
    AiKnowledgeService.class,
    AiKnowledgeController.class,
    AiAgentService.class,
    AiAgentController.class,
})
public class AiStandaloneApplication {

    public static void main(String[] args) {
        SpringApplication app =
            new SpringApplication(AiStandaloneApplication.class);

        app.setDefaultProperties(Map.of(
            "spring.config.name", "application-ai-standalone"
        ));

        app.run(args);
    }
}
