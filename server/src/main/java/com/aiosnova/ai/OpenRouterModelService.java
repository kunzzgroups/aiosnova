package com.aiosnova.ai;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class OpenRouterModelService {

    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build();

    private final ObjectMapper jsonMapper = new ObjectMapper();

    public JsonNode fetchModels()
        throws IOException, InterruptedException {

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("https://openrouter.ai/api/v1/models"))
            .timeout(Duration.ofSeconds(30))
            .header("Accept", "application/json")
            .GET()
            .build();

        HttpResponse<String> response = httpClient.send(
            request,
            HttpResponse.BodyHandlers.ofString()
        );

        if (response.statusCode() != 200) {
            throw new IOException(
                "读取模型目录失败，HTTP 状态码：" + response.statusCode()
            );
        }

        JsonNode root = jsonMapper.readTree(response.body());
        JsonNode models = root.path("data");

        if (!models.isArray()) {
            throw new IOException("模型目录格式异常：缺少 data 数组");
        }

        return models;
    }

    public ModelCapabilities loadCapabilities(String modelId)
        throws IOException, InterruptedException {

        if (modelId == null || modelId.isBlank()) {
            throw new IllegalArgumentException("请填写模型 ID");
        }

        String targetId = modelId.trim();
        JsonNode models = fetchModels();

        for (JsonNode model : models) {
            String currentId = model.path("id").asString("");

            if (!targetId.equals(currentId)) {
                continue;
            }

            JsonNode architecture = model.path("architecture");
            JsonNode inputs = architecture.path("input_modalities");
            JsonNode outputs = architecture.path("output_modalities");
            JsonNode parameters = model.path("supported_parameters");

            boolean textInput = containsText(inputs, "text");
            boolean textOutput = containsText(outputs, "text");

            boolean chat = textInput && textOutput;
            boolean vision = containsText(inputs, "image");
            boolean toolCalling = containsText(parameters, "tools");

            Integer contextWindow = null;
            JsonNode context = model.path("context_length");

            if (!context.isMissingNode() && !context.isNull()) {
                if (!context.isIntegralNumber()) {
                    throw new IOException("上下文容量格式异常");
                }

                long value = context.longValue();

                if (value <= 0 || value > Integer.MAX_VALUE) {
                    throw new IOException("上下文容量超出有效范围");
                }

                contextWindow = (int) value;
            }

            return new ModelCapabilities(
                chat,
                vision,
                toolCalling,
                contextWindow
            );
        }

        throw new IllegalArgumentException(
            "OpenRouter 模型目录中未找到模型：" + targetId
        );
    }

    private boolean containsText(JsonNode array, String expected)
        throws IOException {

        if (!array.isArray()) {
            throw new IOException("模型能力格式异常：预期是数组");
        }

        for (JsonNode item : array) {
            if (!item.isTextual()) {
                throw new IOException("模型能力格式异常：预期是文字");
            }

            if (expected.equals(item.asString())) {
                return true;
            }
        }

        return false;
    }
}
