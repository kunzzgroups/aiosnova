package com.aiosnova.ai.tool;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;

import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

public final class AiToolCallParser {

    // Local parser limits, not provider limits.
    private static final int MAX_RESPONSE_CHARS = 1_000_000;
    private static final int MAX_ARGUMENT_CHARS = 16_384;
    private static final int MAX_CALLS = 8;

    private final JsonMapper json = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .build();

    public List<AiToolCall> parse(String responseBody) {

        if (responseBody == null
                || responseBody.isBlank()
                || responseBody.length() > MAX_RESPONSE_CHARS) {
            throw invalidResponse();
        }

        JsonNode root;

        try {
            root = json.readTree(responseBody);
        } catch (RuntimeException error) {
            throw invalidResponse();
        }

        if (root == null || !root.isObject() || root.has("error")) {
            throw invalidResponse();
        }

        var choices = root.path("choices");

        // Current requests use one completion, not multiple choices.
        if (!choices.isArray() || choices.size() != 1) {
            throw invalidResponse();
        }

        var choice = choices.get(0);
        var message = choice.path("message");

        if (!message.isObject()
                || !"assistant".equals(
                        message.path("role").asString(""))) {
            throw invalidResponse();
        }

        String finishReason =
                choice.path("finish_reason").asString("");

        var calls = message.path("tool_calls");

        if (calls.isMissingNode()
                || calls.isNull()
                || (calls.isArray() && calls.isEmpty())) {

            if ("tool_calls".equals(finishReason)) {
                throw invalidResponse();
            }

            return List.of();
        }

        if (!calls.isArray()
                || calls.size() > MAX_CALLS
                || !"tool_calls".equals(finishReason)) {
            throw invalidResponse();
        }

        var result = new ArrayList<AiToolCall>();
        var ids = new HashSet<String>();

        for (JsonNode call : calls) {
            String id = requiredText(call.path("id"));

            if (!id.matches("[!-~]{1,200}") || !ids.add(id)) {
                throw invalidResponse();
            }

            if (!"function".equals(
                    call.path("type").asString(""))) {
                throw invalidResponse();
            }

            var function = call.path("function");

            String name = requiredText(function.path("name"));

            if (!name.matches("[A-Za-z][A-Za-z0-9_-]{0,63}")) {
                throw invalidResponse();
            }

            String rawArguments =
                    requiredText(function.path("arguments"));

            if (rawArguments.length() > MAX_ARGUMENT_CHARS) {
                throw invalidArguments();
            }

            Map<String, Object> arguments;

            try {
                arguments = json.readValue(
                        rawArguments,
                        new TypeReference<Map<String, Object>>() {});
            } catch (RuntimeException error) {
                throw invalidArguments();
            }

            if (arguments == null) {
                throw invalidArguments();
            }

            result.add(new AiToolCall(
                    id,
                    name,
                    Collections.unmodifiableMap(arguments)));
        }

        return List.copyOf(result);
    }

    private static String requiredText(JsonNode value) {
        if (!value.isString() || value.asString().isBlank()) {
            throw invalidResponse();
        }

        return value.asString();
    }

    private static IllegalArgumentException invalidResponse() {
        return new IllegalArgumentException(
                "Invalid or incomplete tool-call response.");
    }

    private static IllegalArgumentException invalidArguments() {
        return new IllegalArgumentException(
                "Tool arguments must be a valid JSON object.");
    }
}