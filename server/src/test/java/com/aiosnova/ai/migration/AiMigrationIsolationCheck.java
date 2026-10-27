package com.aiosnova.ai.migration;

import java.util.Map;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;

/** Disabled tools must not require a database or create any migration entry points. */
public class AiMigrationIsolationCheck {
    public static void main(String[] args) {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("test-disabled", Map.of("ai.migration.preflight-enabled", "false")));
            context.register(AiMigrationToolsConfiguration.class, AiMigrationPreflightController.class,
                    AiMigrationPreflightService.class, AiSnapshotValidationService.class,
                    AiSnapshotImportService.class, AiSnapshotImportRepository.class);
            context.refresh();
            for (Class<?> type : new Class<?>[]{AiMigrationToolsConfiguration.class, AiMigrationPreflightController.class,
                    AiMigrationPreflightService.class, AiSnapshotValidationService.class,
                    AiSnapshotImportService.class, AiSnapshotImportRepository.class}) {
                if (!context.getBeansOfType(type).isEmpty()) throw new AssertionError("Migration tool loaded: " + type.getSimpleName());
            }
            System.out.println("PASS: migration configuration, endpoints and import beans are disabled without database initialization.");
        }
    }
}
