package com.aiosnova.ai.knowledge;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
@Import({AiKnowledgeProcessingRepository.class,AiKnowledgeChunkRepository.class,
    AiKnowledgeProcessingService.class,AiKnowledgeTextExtractor.class,AiKnowledgeProcessingWorker.class,
    AiKnowledgeSearchService.class,AiKnowledgeSearchController.class,AiKnowledgeProcessingController.class})
public class AiKnowledgeProcessingConfiguration { }
