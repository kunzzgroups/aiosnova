package com.aiosnova.ai.tool;

import com.aiosnova.ai.tool.builtin.CalculatorTool;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;

class AiToolRequestMapperTest {

    private final AiToolRequestMapper mapper =
            new AiToolRequestMapper();

    private final ObjectMapper json = new ObjectMapper();

    private AiToolRegistry calculatorRegistry() {
        return new AiToolRegistry(List.of(
                new AiToolRegistry.Registration(
                        "calculator",
                        new CalculatorTool())));


    }



    @Test
    void convertsCalculatorDefinition() {
        var tools = mapper.toRequestTools(
                calculatorRegistry());

        assertEquals(1, tools.size());

        var tool = tools.getFirst();

        assertEquals(2, tool.size());
        assertEquals("function", tool.get("type"));

        assertInstanceOf(Map.class, tool.get("function"));

        Map<?, ?> function =
                (Map<?, ?>) tool.get("function");

        assertEquals(3, function.size());
        assertEquals("calc_run", function.get("name"));
        assertInstanceOf(String.class, function.get("description"));
        assertInstanceOf(Map.class, function.get("parameters"));

        assertFalse(function.containsKey("action"));
        assertFalse(function.containsKey("executorType"));
        assertFalse(function.containsKey("handler"));
    }

    @Test
    void preservesParameterSchemaAfterJsonSerialization()
            throws Exception {

        var tools = mapper.toRequestTools(
                calculatorRegistry());

        var root = json.readTree(
                json.writeValueAsString(tools));

        var parameters = root.get(0)
                .path("function")
                .path("parameters");

        assertEquals(
                "object",
                parameters.path("type").asString());

        var operation = parameters
                .path("properties")
                .path("operation");

        assertEquals("string", operation.path("type").asString());
        assertEquals(4, operation.path("enum").size());
        assertEquals("add", operation.path("enum").get(0).asString());
        assertEquals("divide", operation.path("enum").get(3).asString());

        assertEquals(
                "number",
                parameters.path("properties")
                        .path("a")
                        .path("type")
                        .asString());

        assertEquals(
                "number",
                parameters.path("properties")
                        .path("b")
                        .path("type")
                        .asString());

        var required = parameters.path("required");

        assertEquals(3, required.size());
        assertEquals("operation", required.get(0).asString());
        assertEquals("a", required.get(1).asString());
        assertEquals("b", required.get(2).asString());

        assertTrue(parameters.has("additionalProperties"));
        assertFalse(parameters.path("additionalProperties").asBoolean());
    }

    @Test
    void serializesAnInspectionRequestWithoutAllowingToolCalls()
            throws Exception {

        var request = Map.of(
                "model", "test/model",
                "messages", List.of(
                        Map.of(
                                "role", "user",
                                "content", "What is 2 plus 3?")),
                "tools", mapper.toRequestTools(
                        calculatorRegistry()),
                "tool_choice", "none",
                "stream", false);

        var root = json.readTree(
                json.writeValueAsString(request));

        assertEquals("test/model", root.path("model").asString());
        assertEquals("none", root.path("tool_choice").asString());
        assertFalse(root.path("stream").asBoolean());

        assertEquals(
                "What is 2 plus 3?",
                root.path("messages")
                        .get(0)
                        .path("content")
                        .asString());

        assertEquals(
                "calc_run",
                root.path("tools")
                        .get(0)
                        .path("function")
                        .path("name")
                        .asString());

        assertFalse(root.has("apiKey"));
        assertFalse(root.has("executorType"));
    }

    @Test
    void emptyRegistryProducesEmptyDefinitions() {
        var registry = new AiToolRegistry(List.of());

        assertTrue(mapper.toRequestTools(registry).isEmpty());
    }

    @Test
    void rejectsMissingRegistry() {
        assertThrows(
                IllegalArgumentException.class,
                () -> mapper.toRequestTools(null));
    }

    @Test
    void mappingAndSerializationNeverExecuteTools()
            throws Exception {

        int[] executions = {0};

        AiToolHandler handler = new AiToolHandler() {

            @Override
            public AiToolDefinition definition() {
                return new AiToolDefinition(
                        "test.run",
                        "test_run",
                        "A test-only tool.",
                        Map.of("type", "object"));
            }

            @Override
            public void validateArguments(Map<String, Object> arguments) {
                if (arguments == null) {
                    throw new IllegalArgumentException("Tool arguments are required.");
                }
            }

            @Override
            public Map<String, Object> execute(
                    Map<String, Object> arguments) {

                executions[0]++;
                throw new AssertionError(
                        "Tool execution must not happen.");
            }
        };

        var registry = new AiToolRegistry(List.of(
                new AiToolRegistry.Registration(
                        "test",
                        handler)));

        var tools = mapper.toRequestTools(registry);

        json.writeValueAsString(
                Map.of(
                        "tools", tools,
                        "tool_choice", "none"));

        assertEquals(0, executions[0]);
    }

}
