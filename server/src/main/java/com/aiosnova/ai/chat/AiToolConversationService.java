package com.aiosnova.ai.chat;

import com.aiosnova.ai.tool.AiToolCallExecutor;
import com.aiosnova.ai.tool.AiToolCallParser;
import com.aiosnova.ai.tool.AiToolRegistry;

import java.io.IOException;
import java.net.http.HttpRequest;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.web.server.ResponseStatusException;

import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Isolated two-round flow.
 * No default HTTP transport, Spring registration or Controller integration.
 */
final class AiToolConversationService {

    static final class Failure extends RuntimeException {
        private final String code;

        Failure(String code, String message) {
            super(message);
            this.code = code;
        }

        String code() {
            return code;
        }
    }

    private final AiChatService.ChatTransport transport;
    private final AiToolRegistry registry;
    private final AiToolCallExecutor executor;
    private final Runnable executionGuard;

    private final AiChatRequestBuilder builder = new AiChatRequestBuilder();

    private final AiToolCallParser parser = new AiToolCallParser();

    private final JsonMapper json = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .build();

    AiToolConversationService(
            AiChatService.ChatTransport transport,
            AiToolRegistry registry) {

        this(transport, registry, () -> {
        });
    }

    AiToolConversationService(
            AiChatService.ChatTransport transport,
            AiToolRegistry registry,
            Runnable executionGuard) {

        if (transport == null
                || registry == null
                || executionGuard == null) {
            throw new IllegalArgumentException(
                    "Transport, registry and execution guard are required.");
        }

        this.transport = transport;
        this.registry = registry;
        this.executor = new AiToolCallExecutor(registry);
        this.executionGuard = executionGuard;
    }

    String chat(
            String modelId,
            List<Map<String, Object>> messages,
            Double temperature,
            String apiKey,
            Set<String> allowedFunctionNames) {

        return chatWithParameters(
                modelId,
                messages,
                new AiToolRequestParameters(temperature, null, 2048),
                apiKey,
                allowedFunctionNames);
    }

    String chatWithParameters(
            String modelId,
            List<Map<String, Object>> messages,
            AiToolRequestParameters parameters,
            String apiKey,
            Set<String> allowedFunctionNames) {

        if (modelId == null || modelId.isBlank()
                || apiKey == null || apiKey.isBlank()
                || messages == null || messages.isEmpty()
                || messages.stream().anyMatch(message -> message == null)
                || allowedFunctionNames == null
                || parameters == null) {

            throw new IllegalArgumentException(
                    "Model, messages, key, parameters and allowlist are required.");
        }

        // For this isolated flow, the registry must contain exactly
        // the tools allowed for this request.
        Set<String> advertisedNames = registry.definitions().stream()
                .map(definition -> definition.functionName())
                .collect(Collectors.toUnmodifiableSet());

        if (advertisedNames.isEmpty()
                || !advertisedNames.equals(allowedFunctionNames)) {
            throw new IllegalArgumentException(
                    "Registry must match this request's allowed tools.");
        }

        Set<String> allowed = Set.copyOf(allowedFunctionNames);

        try {
            // Use one snapshot for both requests.
            List<Map<String, Object>> original = json.readValue(
                    json.writeValueAsString(messages),
                    new TypeReference<List<Map<String, Object>>>() {
                    });

            String firstBody = send(
                    builder.buildForToolSelectionWithParameters(
                            modelId,
                            original,
                            parameters,
                            apiKey,
                            registry));

            var calls = parser.parse(firstBody);

            // A model may answer directly without selecting a tool.
            if (calls.isEmpty()) {
                return finalAnswer(firstBody);
            }

            executionGuard.run();
            var results = executor.execute(calls, allowed, executionGuard);

            if (results.stream().anyMatch(result -> !result.success())) {
                throw new Failure(
                        "tool_execution_failed",
                        "Tool execution failed. Conversation stopped.");
            }

            var secondRequest = builder.buildAfterToolExecutionWithParameters(
                    modelId,
                    original,
                    parameters,
                    apiKey,
                    registry,
                    firstBody,
                    results);

            String secondBody = send(secondRequest);

            // No loop: finalAnswer rejects further tool calls.
            return finalAnswer(secondBody);

        } catch (Failure error) {
            throw error;

        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new Failure(
                    "interrupted",
                    "Conversation was interrupted.");

        } catch (IOException error) {
            throw new Failure(
                    "transport_failed",
                    "Model request failed.");
        } catch (ResponseStatusException error) {
            throw error;

        } catch (RuntimeException error) {
            // Do not expose model bodies, keys or internal exception text.
            throw new Failure(
                    "invalid_tool_flow",
                    "Invalid model response or tool invocation.");
        }
    }

    private String send(HttpRequest request)
            throws IOException, InterruptedException {

        executionGuard.run();

        var response = transport.send(request);

        if (response == null || response.statusCode() != 200) {
            throw new Failure(
                    "upstream_http_error",
                    "Model request returned an unsuccessful status.");
        }

        return response.body();
    }

    private String finalAnswer(String body) {
        if (!parser.parse(body).isEmpty()) {
            throw new Failure(
                    "tool_round_limit",
                    "Additional tool calls are not allowed.");
        }

        var choice = json.readTree(body).path("choices").get(0);
        var message = choice.path("message");
        var content = message.path("content");
        var refusal = message.path("refusal");

        if (!"stop".equals(choice.path("finish_reason").asString(""))
                || (!refusal.isMissingNode() && !refusal.isNull())
                || !content.isString()
                || content.asString().isBlank()) {
            throw new Failure(
                    "invalid_final_answer",
                    "Model did not return a complete text answer.");
        }

        return content.asString();
    }
}
