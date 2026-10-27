package com.aiosnova.ai.tool;

import java.util.Map;

public interface AiToolHandler {

    AiToolDefinition definition();

    /**
     * Validate only: no HTTP, database writes or other side effects.
     */
    void validateArguments(Map<String, Object> arguments);

    Map<String, Object> execute(
            Map<String, Object> arguments);
}