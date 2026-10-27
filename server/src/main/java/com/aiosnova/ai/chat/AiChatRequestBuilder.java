package com.aiosnova.ai.chat;

import com.aiosnova.ai.tool.AiToolRegistry;
import com.aiosnova.ai.tool.AiToolRequestMapper;
import com.aiosnova.ai.tool.AiToolCallExecutor;
import com.aiosnova.ai.tool.AiToolFollowUpMessages;

import java.net.URI;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import tools.jackson.databind.ObjectMapper;

final class AiChatRequestBuilder {

        private final ObjectMapper json = new ObjectMapper();
        private final AiToolFollowUpMessages followUpMessages = new AiToolFollowUpMessages();
        private final AiToolRequestMapper tools = new AiToolRequestMapper();

        HttpRequest build(
                        String modelId,
                        List<Map<String, Object>> messages,
                        Double temperature,
                        String apiKey) {

                return buildRequest(
                                modelId, messages, temperature, apiKey, null);
        }

        /**
         * Definition inspection only. Tool selection remains disabled.
         * Not exposed through a Controller.
         */
        HttpRequest buildWithToolDefinitions(
                        String modelId,
                        List<Map<String, Object>> messages,
                        Double temperature,
                        String apiKey,
                        AiToolRegistry registry) {

                if (registry == null) {
                        throw new IllegalArgumentException(
                                        "Tool registry is required.");
                }

                return buildRequest(
                                modelId, messages, temperature, apiKey, registry);
        }

        /**
         * Builds a final-answer request after successful tool execution.
         * Assembly failure prevents request construction.
         * Not exposed through a Controller.
         */
        HttpRequest buildAfterToolExecution(
                        String modelId,
                        List<Map<String, Object>> originalMessages,
                        Double temperature,
                        String apiKey,
                        AiToolRegistry registry,
                        String firstResponseBody,
                        List<AiToolCallExecutor.Result> results) {

                if (registry == null || registry.definitions().isEmpty()) {
                        throw new IllegalArgumentException(
                                        "A non-empty tool registry is required.");
                }

                var messages = followUpMessages.assemble(
                                originalMessages,
                                firstResponseBody,
                                results);

                return buildRequest(
                                modelId,
                                messages,
                                temperature,
                                apiKey,
                                registry);
        }

        // Preserve the behavior of all existing callers.
        private HttpRequest buildRequest(
                        String modelId,
                        List<Map<String, Object>> messages,
                        Double temperature,
                        String apiKey,
                        AiToolRegistry registry) {

                return buildRequest(
                                modelId, messages, temperature, apiKey, registry, "none");
        }

        /**
         * First round of the isolated tool flow.
         * No Controller currently calls this method.
         */
        HttpRequest buildForToolSelection(
                        String modelId,
                        List<Map<String, Object>> messages,
                        Double temperature,
                        String apiKey,
                        AiToolRegistry registry) {

                if (registry == null || registry.definitions().isEmpty()) {
                        throw new IllegalArgumentException(
                                        "A non-empty tool registry is required.");
                }

                return buildRequest(
                                modelId, messages, temperature, apiKey, registry, "auto");
        }

        private HttpRequest buildRequest(
                        String modelId,
                        List<Map<String, Object>> messages,
                        Double temperature,
                        String apiKey,
                        AiToolRegistry registry,
                        String toolChoice) {

                var body = new HashMap<String, Object>();

                body.put("model", modelId);
                body.put("messages", messages);
                body.put("stream", false);
                body.put("max_tokens", 2048);

                if (temperature != null) {
                        body.put("temperature", temperature);
                }

                if (registry != null) {
                        var definitions = tools.toRequestTools(registry);

                        if (!definitions.isEmpty()) {
                                body.put("tools", definitions);
                                body.put("tool_choice", toolChoice);
                        }
                }

                return HttpRequest.newBuilder()
                                .uri(URI.create(
                                                "https://openrouter.ai/api/v1/chat/completions"))
                                .timeout(Duration.ofSeconds(60))
                                .header("Content-Type", "application/json")
                                .header("Authorization", "Bearer " + apiKey)
                                .POST(HttpRequest.BodyPublishers.ofString(
                                                json.writeValueAsString(body),
                                                StandardCharsets.UTF_8))
                                .build();
        }
}
