package com.aiosnova.ai.tool;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import tools.jackson.databind.json.JsonMapper;

public final class AiToolResultMessageMapper {

    private final JsonMapper json = JsonMapper.builder().build();

    public List<Map<String, Object>> toMessages(
            List<AiToolCallExecutor.Result> results) {

        if (results == null) {
            throw new IllegalArgumentException(
                    "Tool results are required.");
        }

        List<Map<String, Object>> messages = new ArrayList<>();
        Set<String> ids = new HashSet<>();

        for (var result : results) {
            if (result == null
                    || !ids.add(result.toolCallId())) {
                throw new IllegalArgumentException(
                        "Invalid or duplicate tool result.");
            }

            Map<String, Object> payload;

            if (result.success()) {
                payload = Map.of(
                        "ok", true,
                        "output", result.output());
            } else {
                payload = Map.of(
                        "ok", false,
                        "error", Map.of(
                                "code", result.error().code(),
                                "message", result.error().message()));
            }

            messages.add(Map.of(
                    "role", "tool",
                    "tool_call_id", result.toolCallId(),
                    "content", json.writeValueAsString(payload)));
        }

        return List.copyOf(messages);
    }
}