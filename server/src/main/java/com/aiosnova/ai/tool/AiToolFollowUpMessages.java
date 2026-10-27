package com.aiosnova.ai.tool;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

public final class AiToolFollowUpMessages {

    private final JsonMapper json = JsonMapper.builder().build();
    private final AiToolCallParser parser = new AiToolCallParser();
    private final AiToolResultMessageMapper mapper =
            new AiToolResultMessageMapper();

    public List<Map<String, Object>> assemble(
            List<Map<String, Object>> originalMessages,
            String responseBody,
            List<AiToolCallExecutor.Result> results) {

        if (originalMessages == null
                || originalMessages.isEmpty()
                || originalMessages.stream().anyMatch(
                        message -> message == null)
                || results == null) {
            throw new IllegalArgumentException(
                    "Original messages and tool results are required.");
        }

        // Reuse strict response validation.
        var calls = parser.parse(responseBody);

        if (calls.isEmpty() || calls.size() != results.size()) {
            throw new IllegalArgumentException(
                    "Tool calls and results must match.");
        }

        var resultsById =
                new HashMap<String, AiToolCallExecutor.Result>();

        for (var result : results) {
            if (result == null || !result.success()) {
                throw new IllegalArgumentException(
                        "Tool execution failed. Follow-up is blocked.");
            }

            if (resultsById.putIfAbsent(
                    result.toolCallId(), result) != null) {
                throw new IllegalArgumentException(
                        "Duplicate tool result.");
            }
        }

        var orderedResults =
                new ArrayList<AiToolCallExecutor.Result>();
        var matchedIds = new HashSet<String>();

        for (var call : calls) {
            var result = resultsById.get(call.id());

            if (result == null
                    || !call.functionName().equals(
                            result.functionName())
                    || !matchedIds.add(call.id())) {
                throw new IllegalArgumentException(
                        "Tool result does not match its call.");
            }

            orderedResults.add(result);
        }

        var root = json.readTree(responseBody);
        var originalAssistant = root.path("choices")
                .get(0).path("message");

        var content = originalAssistant.path("content");

        if (!content.isMissingNode()
                && !content.isNull()
                && !content.isString()) {
            throw new IllegalArgumentException(
                    "Unsupported assistant content.");
        }

        // Preserve the original tool-call IDs, names and argument strings.
        var assistant = new HashMap<String, Object>();
        assistant.put("role", "assistant");
        assistant.put(
                "content",
                content.isString() ? content.asString() : null);
        assistant.put(
                "tool_calls",
                json.readValue(
                        json.writeValueAsString(
                                originalAssistant.path("tool_calls")),
                        new TypeReference<List<Map<String, Object>>>() {}));

        var messages = new ArrayList<Map<String, Object>>();
        messages.addAll(originalMessages);
        messages.add(assistant);
        messages.addAll(mapper.toMessages(orderedResults));

        // JSON snapshot: do not share mutable nested data with the caller.
        List<Map<String, Object>> snapshot = json.readValue(
                json.writeValueAsString(messages),
                new TypeReference<List<Map<String, Object>>>() {});

        return List.copyOf(snapshot);
    }
}