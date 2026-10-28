package com.aiosnova.ai.model;

import java.io.IOException;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.*;

class OpenRouterModelMetadataTest {

    private final ObjectMapper json = new ObjectMapper();

    private OpenRouterModelService catalog(
            String supportedParametersField) {

        var models = json.readTree("""
                [{
                  "id": "test/model",
                  "architecture": {
                    "input_modalities": ["text"],
                    "output_modalities": ["text"]
                  },
                  "context_length": 32000
                  %s
                }]
                """.formatted(supportedParametersField));

        return new OpenRouterModelService() {
            @Override
            public JsonNode fetchModels() {
                return models;
            }
        };
    }

    @Test
    void topPIsSupportedWhenExplicitlyListed() throws Exception {
        var service = catalog("""
                , "supported_parameters": ["tools", "top_p"]
                """);

        var metadata = service.loadMetadata("test/model");

        assertTrue(metadata.supportsTopP());
        assertFalse(metadata.supportsTemperature());
        assertTrue(metadata.capabilities().toolCalling());
        assertEquals(
                Integer.valueOf(32000),
                metadata.capabilities().contextWindow());
    }

    @Test
    void topPIsUnsupportedWhenNotListed() throws Exception {
        var service = catalog("""
                , "supported_parameters": ["tools", "temperature"]
                """);

        var metadata = service.loadMetadata("test/model");

        assertFalse(metadata.supportsTopP());
        assertTrue(metadata.supportsTemperature());
    }

    @Test
    void emptyParameterListSupportsNeitherSetting() throws Exception {
        var service = catalog("""
                , "supported_parameters": []
                """);

        var metadata = service.loadMetadata("test/model");

        assertFalse(metadata.supportsTopP());
        assertFalse(metadata.supportsTemperature());
        assertFalse(metadata.capabilities().toolCalling());
    }

    @Test
    void missingParameterFieldIsRejected() {
        var service = catalog("");

        assertThrows(
                IOException.class,
                () -> service.loadMetadata("test/model"));
    }

    @Test
    void nullOrWrongParameterTypeIsRejected() {
        for (String field : new String[] {
                ", \"supported_parameters\": null",
                ", \"supported_parameters\": \"top_p\"",
                ", \"supported_parameters\": {}"
        }) {
            var service = catalog(field);

            assertThrows(
                    IOException.class,
                    () -> service.loadMetadata("test/model"),
                    field);
        }
    }

    @Test
    void nonTextParameterEntryIsRejected() {
        // 非法元素放在前面，确保解析会检查到它。
        for (String field : new String[] {
                ", \"supported_parameters\": [123, \"tools\", \"top_p\"]",
                ", \"supported_parameters\": [null, \"tools\", \"top_p\"]",
                ", \"supported_parameters\": [{}, \"tools\", \"top_p\"]"
        }) {
            var service = catalog(field);

            assertThrows(
                    IOException.class,
                    () -> service.loadMetadata("test/model"),
                    field);
        }
    }

    @Test
    void unknownModelIsRejected() {
        var service = catalog("""
                , "supported_parameters": ["top_p"]
                """);

        assertThrows(
                IllegalArgumentException.class,
                () -> service.loadMetadata("test/missing"));
    }
}