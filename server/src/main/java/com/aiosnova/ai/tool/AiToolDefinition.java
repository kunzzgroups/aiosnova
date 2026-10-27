package com.aiosnova.ai.tool;

import java.util.Map;

/**
 * Tool metadata exposed to the model.
 * Contains no credentials or executable code.
 */
public record AiToolDefinition(
        String action,
        String functionName,
        String description,
        Map<String, Object> parameters) {
}