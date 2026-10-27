package com.aiosnova.ai.migration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

/** Developer-only tools. Disabled unless explicitly opted in by server configuration. */
@Configuration
@ConditionalOnProperty(name = "ai.migration.preflight-enabled", havingValue = "true")
@Import({AiMigrationPreflightController.class, AiMigrationPreflightService.class,
        AiSnapshotValidationService.class, AiSnapshotImportRepository.class, AiSnapshotImportService.class})
public class AiMigrationToolsConfiguration {}
