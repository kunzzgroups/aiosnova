package com.aiosnova.ai.tool;

import java.util.Map;

public record AiToolCall(
        String id,
        String functionName,
        Map<String, Object> arguments) {
}