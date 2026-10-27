package com.aiosnova.ai.tool;

import java.util.List;
import java.util.Map;

public final class AiToolRequestMapper {

    public List<Map<String, Object>> toRequestTools(
            AiToolRegistry registry) {

        if (registry == null) {
            throw new IllegalArgumentException(
                    "Tool registry is required.");
        }

        return registry.definitions()
                .stream()
                .map(this::toRequestTool)
                .toList();
    }

    private Map<String, Object> toRequestTool(
            AiToolDefinition definition) {

        Map<String, Object> function = Map.of(
                "name", definition.functionName(),
                "description", definition.description(),
                "parameters", definition.parameters());

        return Map.of(
                "type", "function",
                "function", function);
    }

}
