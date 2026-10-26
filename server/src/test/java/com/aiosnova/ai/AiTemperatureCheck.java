package com.aiosnova.ai;

import java.util.List;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Fake catalog only: no external requests, credentials or database. */
public class AiTemperatureCheck {
    public static void main(String[] args) throws Exception {
        var json = new ObjectMapper();
        var catalog = json.readTree("""
            [{"id":"test/adjustable","architecture":{"input_modalities":["text"],"output_modalities":["text"]},"supported_parameters":["temperature"]},
             {"id":"test/default","architecture":{"input_modalities":["text"],"output_modalities":["text"]},"supported_parameters":[]}]
            """);
        var models = new OpenRouterModelService() {
            @Override public JsonNode fetchModels() { return catalog; }
        };
        if (!models.loadMetadata("test/adjustable").supportsTemperature() || models.loadMetadata("test/default").supportsTemperature())
            throw new AssertionError("Temperature support must come from supported_parameters");
        var validator = new AiChatMessageValidator(models);
        var messages = List.of(new AiChatMessagesRequest.Message("user", json.readTree("\"Hello\"")));
        var defaults = validator.validate(new AiChatMessagesRequest("company-j1", "p", "test/default", null, messages));
        if (defaults.temperature() != null || AiChatService.streamRequestBody(defaults).containsKey("temperature"))
            throw new AssertionError("Model default must omit temperature from the upstream payload");
        for (double value : new double[] {0.2, 0.7, 1.1}) {
            var explicit = validator.validate(new AiChatMessagesRequest("company-j1", "p", "test/adjustable", value, messages));
            if (!Double.valueOf(value).equals(AiChatService.streamRequestBody(explicit).get("temperature")))
                throw new AssertionError("Explicit preset must reach the upstream payload");
        }
        try {
            validator.validate(new AiChatMessagesRequest("company-j1", "p", "test/adjustable", Double.NaN, messages));
            throw new AssertionError("Non-finite temperature must be rejected");
        } catch (ResponseStatusException expected) {
            if (expected.getStatusCode().value() != 400) throw expected;
        }
        System.out.println("PASS: real metadata detection, default omission, all three presets and invalid-temperature rejection");
    }
}
