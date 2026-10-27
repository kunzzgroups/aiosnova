package com.aiosnova.ai.provider;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import tools.jackson.databind.ObjectMapper;

@Service
public class AiConnectionService {

    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build();

    private final ObjectMapper jsonMapper = new ObjectMapper();

    public record ConnectionTestRequest(
        String baseUrl,
        String apiKey,
        String modelId
    ) {}

    public Map<String, Object> testConnection(
        ConnectionTestRequest input
    ) {
        // 1. 检查输入。
        if (input.baseUrl() == null || input.baseUrl().isBlank()) {
            return Map.of(
                "ok", false,
                "message", "Enter the model service URL."
            );
        }

        if (input.apiKey() == null || input.apiKey().isBlank()) {
            return Map.of(
                "ok", false,
                "message", "Enter an API Key."
            );
        }

        if (input.modelId() == null || input.modelId().isBlank()) {
            return Map.of(
                "ok", false,
                "message", "Enter a model ID."
            );
        }

        // 2. 当前只允许请求 OpenRouter 官方接口。
        if (!"https://openrouter.ai/api/v1".equals(input.baseUrl().trim())) {
            return Map.of(
                "ok", false,
                "message", "Connection tests currently support https://openrouter.ai/api/v1 only."
            );
        }

        // 3. 准备模型请求的数据。
        var requestBody = Map.of(
            "model", input.modelId().trim(),
            "messages", List.of(
                Map.of(
                    "role", "user",
                    "content", "Reply with OK only."
                )
            ),
            "reasoning", Map.of("effort", "none"),
            "stream", false,
            "max_tokens", 32
        );

        try {
            // 4. 将数据转换成 JSON，创建 HTTP 请求。
            String requestJson = jsonMapper.writeValueAsString(requestBody);

            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(
                    "https://openrouter.ai/api/v1/chat/completions"
                ))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .header(
                    "Authorization",
                    "Bearer " + input.apiKey().trim()
                )
                .POST(HttpRequest.BodyPublishers.ofString(requestJson))
                .build();

            // 5. 发送请求并等待响应。
            HttpResponse<String> response = httpClient.send(
                request,
                HttpResponse.BodyHandlers.ofString()
            );

            // 6. 处理模型服务返回的错误。
            if (response.statusCode() == 401) {
                return Map.of(
                    "ok", false,
                    "message", "Authentication failed. Check the OpenRouter API Key."
                );
            }

            if (response.statusCode() == 402) {
                return Map.of(
                    "ok", false,
                    "message", "Insufficient OpenRouter credits. Check your balance or key limits."
                );
            }

            if (response.statusCode() == 429) {
                return Map.of(
                    "ok", false,
                    "message", "Rate limit reached. Try again later."
                );
            }

            if (response.statusCode() != 200) {
                return Map.of(
                    "ok", false,
                    "message",
                    "Model request failed. HTTP status: " + response.statusCode()
                );
            }

            // 7. 读取模型回答。
            var responseJson = jsonMapper.readTree(response.body());

            if (responseJson.has("error")) {
                return Map.of(
                    "ok", false,
                    "message", "OpenRouter returned an error instead of a model reply."
                );
            }

            var content = responseJson
                .path("choices")
                .path(0)
                .path("message")
                .path("content");

            if (!content.isTextual() || content.asString().isBlank()) {
                return Map.of(
                    "ok", false,
                    "message", "The model returned no valid text reply."
                );
            }

            return Map.of(
                "ok", true,
                "message", "Model connection successful.",
                "reply", content.asString()
            );

        } catch (HttpTimeoutException error) {
            return Map.of(
                "ok", false,
                "message", "Model request timed out."
            );

        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();

            return Map.of(
                "ok", false,
                "message", "Model request was interrupted."
            );

        } catch (IOException error) {
            return Map.of(
                "ok", false,
                "message", "Unable to connect to the model service."
            );

        } catch (RuntimeException error) {
            return Map.of(
                "ok", false,
                "message", "Invalid request parameters or model response format."
            );
        }
    }
}
