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

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class OpenRouterModelService {

    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build();

    private final ObjectMapper jsonMapper = new ObjectMapper();

    public JsonNode fetchModels()
        throws IOException, InterruptedException {

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(
                "https://openrouter.ai/api/v1/models?output_modalities=all"
            ))
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
                "Unable to load the model catalog. HTTP status: " + response.statusCode()
            );
        }

        JsonNode root = jsonMapper.readTree(response.body());
        JsonNode models = root.path("data");

        if (!models.isArray()) {
            throw new IOException("Invalid model catalog: data array is missing.");
        }

        return models;
    }

    public ModelCapabilities loadCapabilities(String modelId)
        throws IOException, InterruptedException {
        return loadMetadata(modelId).capabilities();
    }

    public record ModelMetadata(ModelCapabilities capabilities, boolean supportsTemperature) {}

    public ModelMetadata loadMetadata(String modelId)
        throws IOException, InterruptedException {

        if (modelId == null || modelId.isBlank()) {
            throw new IllegalArgumentException("Enter a model ID.");
        }

        String targetId = modelId.trim();
        JsonNode models = fetchModels();

        for (JsonNode model : models) {
            String currentId = model.path("id").asString("");

            if (targetId.equals(currentId)) {
                boolean supportsTemperature = false;
                JsonNode parameters = model.path("supported_parameters");
                if (parameters.isArray()) {
                    for (JsonNode parameter : parameters) {
                        if ("temperature".equals(parameter.asString(""))) supportsTemperature = true;
                    }
                }
                return new ModelMetadata(parseCapabilities(model), supportsTemperature);
            }
        }

        throw new IllegalArgumentException(
            "Model not found in the OpenRouter catalog: " + targetId
        );
    }

    private ModelCapabilities parseCapabilities(JsonNode model)
        throws IOException {

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
                throw new IOException("Invalid context window format.");
            }

            long value = context.longValue();

            if (value <= 0 || value > Integer.MAX_VALUE) {
                throw new IOException("Context window is out of range.");
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

    private boolean containsText(JsonNode array, String expected)
        throws IOException {

        if (!array.isArray()) {
            throw new IOException("Invalid model capability format: expected an array.");
        }

        for (JsonNode item : array) {
            if (!item.isTextual()) {
                throw new IOException("Invalid model capability format: expected text.");
            }

            if (expected.equals(item.asString())) {
                return true;
            }
        }

        return false;
    }

    public record CatalogModel(
        String modelId,
        String name,
        String description,
        ModelCapabilities capabilities,
        String capabilityError
    ) {}

    public List<CatalogModel> loadModelCatalog()
        throws IOException, InterruptedException {

        JsonNode models = fetchModels();

        List<CatalogModel> result = new ArrayList<>();
        Set<String> seenIds = new HashSet<>();

        for (JsonNode model : models) {
            String modelId = model.path("id").asString("").trim();

            if (modelId.isBlank()) {
                throw new IOException("The model catalog contains an entry without an ID.");
            }

            if (!seenIds.add(modelId)) {
                throw new IOException("The model catalog contains a duplicate ID: " + modelId);
            }

            String name = model.path("name").asString(modelId);
            String description =
                model.path("description").asString("");

            ModelCapabilities capabilities = null;
            String capabilityError = null;

            try {
                capabilities = parseCapabilities(model);
            } catch (IOException | RuntimeException error) {
                capabilityError = "Capability metadata is missing or invalid.";
            }

            result.add(new CatalogModel(
                modelId,
                name,
                description,
                capabilities,
                capabilityError
            ));
        }

        return result;
    }
}
