package com.aiosnova.ai.tool;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;

class AiToolCallParserTest {

    private final AiToolCallParser parser =
            new AiToolCallParser();

    private final ObjectMapper json = new ObjectMapper();

    private Map<String, Object> call(
            String id,
            String name,
            Object arguments) {

        return Map.of(
                "id", id,
                "type", "function",
                "function", Map.of(
                        "name", name,
                        "arguments", arguments));
    }

    private String response(
            String finishReason,
            Object calls) {

        return json.writeValueAsString(
                Map.of(
                        "choices", List.of(
                                Map.of(
                                        "finish_reason", finishReason,
                                        "message", Map.of(
                                                "role", "assistant",
                                                "content", "",
                                                "tool_calls", calls)))));
    }

    @Test
    void parsesSingleCalculatorCall() {
        var calls = parser.parse(response(
                "tool_calls",
                List.of(call(
                        "call_1",
                        "calc_run",
                        """
                        {"operation":"add","a":0.1,"b":0.2}
                        """))));

        assertEquals(1, calls.size());

        var parsed = calls.getFirst();

        assertEquals("call_1", parsed.id());
        assertEquals("calc_run", parsed.functionName());
        assertEquals("add", parsed.arguments().get("operation"));

        assertInstanceOf(
                BigDecimal.class,
                parsed.arguments().get("a"));

        assertEquals(
                0,
                new BigDecimal("0.1").compareTo(
                        (BigDecimal) parsed.arguments().get("a")));
    }

    @Test
    void preservesMultipleCallsAndTheirOrder() {
        var calls = parser.parse(response(
                "tool_calls",
                List.of(
                        call("call_1", "calc_run", "{\"a\":1}"),
                        call("call_2", "calc_run", "{\"a\":2}"))));

        assertEquals(
                List.of("call_1", "call_2"),
                calls.stream().map(AiToolCall::id).toList());
    }

    @Test
    void ordinaryTextResponseHasNoToolCalls() {
        var calls = parser.parse("""
                {
                  "choices": [{
                    "finish_reason": "stop",
                    "message": {
                      "role": "assistant",
                      "content": "Hello"
                    }
                  }]
                }
                """);

        assertTrue(calls.isEmpty());
    }

    @Test
    void rejectsInvalidOuterResponses() {
        for (String body : List.of(
                "",
                "not-json",
                "[]",
                "{}",
                "{\"error\":{\"message\":\"upstream failed\"}}",
                "{\"choices\":[]}")) {

            assertThrows(
                    IllegalArgumentException.class,
                    () -> parser.parse(body));
        }

        assertThrows(
                IllegalArgumentException.class,
                () -> parser.parse(null));
    }

    @Test
    void rejectsMissingOrInvalidToolCallArrays() {
        assertThrows(
                IllegalArgumentException.class,
                () -> parser.parse(response(
                        "tool_calls",
                        List.of())));

        assertThrows(
                IllegalArgumentException.class,
                () -> parser.parse(response(
                        "tool_calls",
                        "invalid")));
    }

    @Test
    void rejectsDuplicateCallIds() {
        assertThrows(
                IllegalArgumentException.class,
                () -> parser.parse(response(
                        "tool_calls",
                        List.of(
                                call("same", "calc_run", "{}"),
                                call("same", "calc_run", "{}")))));
    }

    @Test
    void rejectsMalformedOrNonObjectArguments() {
        for (Object arguments : List.of(
                "{",
                "[]",
                "\"text\"",
                "123",
                "null",
                Map.of("a", 1))) {

            assertThrows(
                    IllegalArgumentException.class,
                    () -> parser.parse(response(
                            "tool_calls",
                            List.of(call(
                                    "call_1",
                                    "calc_run",
                                    arguments)))));
        }
    }

    @Test
    void rejectsDuplicateFieldsAndTrailingJson() {
        for (String arguments : List.of(
                "{\"a\":1,\"a\":2}",
                "{} {}")) {

            assertThrows(
                    IllegalArgumentException.class,
                    () -> parser.parse(response(
                            "tool_calls",
                            List.of(call(
                                    "call_1",
                                    "calc_run",
                                    arguments)))));
        }
    }

    @Test
    void rejectsInvalidNamesAndIds() {
        assertThrows(
                IllegalArgumentException.class,
                () -> parser.parse(response(
                        "tool_calls",
                        List.of(call(
                                "call_1",
                                "invalid function",
                                "{}")))));

        assertThrows(
                IllegalArgumentException.class,
                () -> parser.parse(response(
                        "tool_calls",
                        List.of(call(
                                " ",
                                "calc_run",
                                "{}")))));
    }

    @Test
    void rejectsIncompleteToolCallResponses() {
        for (String reason : List.of(
                "length",
                "content_filter",
                "stop")) {

            assertThrows(
                    IllegalArgumentException.class,
                    () -> parser.parse(response(
                            reason,
                            List.of(call(
                                    "call_1",
                                    "calc_run",
                                    "{}")))));
        }
    }

    @Test
    void rejectsOversizedBatchesAndArguments() {
        var calls = java.util.stream.IntStream.range(0, 9)
                .mapToObj(index -> call(
                        "call_" + index,
                        "calc_run",
                        "{}"))
                .toList();

        assertThrows(
                IllegalArgumentException.class,
                () -> parser.parse(response(
                        "tool_calls",
                        calls)));

        assertThrows(
                IllegalArgumentException.class,
                () -> parser.parse(response(
                        "tool_calls",
                        List.of(call(
                                "call_1",
                                "calc_run",
                                "{\"text\":\""
                                        + "x".repeat(17000)
                                        + "\"}")))));
    }

    @Test
    void parsingNeverExecutesToolsOrResolvesUnknownNames() {
        var executions = new AtomicInteger();

        AiToolHandler handler = new AiToolHandler() {
            @Override
            public AiToolDefinition definition() {
                return new AiToolDefinition(
                        "test.run",
                        "test_run",
                        "Test tool.",
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

                executions.incrementAndGet();
                throw new AssertionError("Must not execute.");
            }
        };

        var registry = new AiToolRegistry(List.of(
                new AiToolRegistry.Registration("test", handler)));

        var calls = parser.parse(response(
                "tool_calls",
                List.of(call(
                        "call_1",
                        "unknown_tool",
                        "{}"))));

        assertEquals("unknown_tool", calls.getFirst().functionName());
        assertEquals(0, executions.get());

        // Parsing a name does not mean that it is registered or allowed.
        assertThrows(
                IllegalArgumentException.class,
                () -> registry.executeFunction(
                        calls.getFirst().functionName(),
                        calls.getFirst().arguments()));

        assertEquals(0, executions.get());
    }
}
