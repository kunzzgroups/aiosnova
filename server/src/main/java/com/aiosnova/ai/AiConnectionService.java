package com.aiosnova.ai;

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
                "message", "请填写模型服务地址"
            );
        }

        if (input.apiKey() == null || input.apiKey().isBlank()) {
            return Map.of(
                "ok", false,
                "message", "请填写 API Key"
            );
        }

        if (input.modelId() == null || input.modelId().isBlank()) {
            return Map.of(
                "ok", false,
                "message", "请填写模型 ID"
            );
        }

        // 2. 当前只允许请求 OpenRouter 官方接口。
        if (!"https://openrouter.ai/api/v1".equals(input.baseUrl().trim())) {
            return Map.of(
                "ok", false,
                "message", "当前测试仅支持 https://openrouter.ai/api/v1"
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
                    "message", "认证失败，请检查 OpenRouter API Key"
                );
            }

            if (response.statusCode() == 402) {
                return Map.of(
                    "ok", false,
                    "message", "OpenRouter 额度不足，请检查余额或密钥额度"
                );
            }

            if (response.statusCode() == 429) {
                return Map.of(
                    "ok", false,
                    "message", "请求达到频率限制，请稍后再试"
                );
            }

            if (response.statusCode() != 200) {
                return Map.of(
                    "ok", false,
                    "message",
                    "模型请求失败，HTTP 状态码：" + response.statusCode()
                );
            }

            // 7. 读取模型回答。
            var responseJson = jsonMapper.readTree(response.body());

            if (responseJson.has("error")) {
                return Map.of(
                    "ok", false,
                    "message", "OpenRouter 返回了错误，未获得模型回答"
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
                    "message", "模型没有返回有效的文字回答"
                );
            }

            return Map.of(
                "ok", true,
                "message", "模型连接成功",
                "reply", content.asString()
            );

        } catch (HttpTimeoutException error) {
            return Map.of(
                "ok", false,
                "message", "模型请求超时"
            );

        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();

            return Map.of(
                "ok", false,
                "message", "模型请求被中断"
            );

        } catch (IOException error) {
            return Map.of(
                "ok", false,
                "message", "无法连接模型服务"
            );

        } catch (RuntimeException error) {
            return Map.of(
                "ok", false,
                "message", "请求参数或模型响应格式异常"
            );
        }
    }
}
