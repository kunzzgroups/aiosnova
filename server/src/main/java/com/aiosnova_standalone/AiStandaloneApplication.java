package com.aiosnova_standalone;

import java.util.Map;

import com.aiosnova.ai.provider.AiConnectionController;
import com.aiosnova.ai.provider.AiConnectionService;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import com.aiosnova.ai.model.AiModelController;
import com.aiosnova.ai.model.OpenRouterModelService;
import com.aiosnova.ai.provider.AiProviderRepository;
import com.aiosnova.ai.provider.AiProviderController;
import com.aiosnova.ai.provider.AiApiKeyCrypto;
import com.aiosnova.ai.provider.AiProviderService;
import com.aiosnova.ai.provider.AiProviderVerificationService;
import com.aiosnova.ai.chat.AiChatService;
import com.aiosnova.ai.chat.AiChatController;
import com.aiosnova.ai.chat.AiChatMessageValidator;
import com.aiosnova.ai.model.AiModelRepository;
import com.aiosnova.ai.model.AiModelConfigController;
import com.aiosnova.ai.model.AiModelSyncService;
import com.aiosnova.ai.model.AiModelStateService;
import com.aiosnova.ai.model.AiModelPreferencesService;
import com.aiosnova.ai.model.AiModelPreferencesController;
import com.aiosnova.ai.agent.AiAgentRepository;
import com.aiosnova.ai.migration.AiMigrationToolsConfiguration;
import com.aiosnova.ai.agent.AiAgentWriteService;
import com.aiosnova.ai.knowledge.AiKnowledgeAccess;
import com.aiosnova.ai.knowledge.AiKnowledgeRepository;
import com.aiosnova.ai.knowledge.AiKnowledgeService;
import com.aiosnova.ai.knowledge.AiKnowledgeController;
import com.aiosnova.ai.agent.AiAgentService;
import com.aiosnova.ai.agent.AiAgentController;
import com.aiosnova.ai.tool.AiToolManagementConfiguration;

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
    AiToolManagementConfiguration.class,
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
