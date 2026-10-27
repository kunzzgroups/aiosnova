package com.aiosnova.ai.tool;

import com.aiosnova.ai.tool.builtin.CalculatorTool;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class AiToolCallExecutorTest {

    private static final class CountingCalculator
            implements AiToolHandler {

        private final CalculatorTool calculator =
                new CalculatorTool();

        private int executions;

        @Override
        public AiToolDefinition definition() {
            return calculator.definition();
        }

        @Override
        public void validateArguments(
                Map<String, Object> arguments) {
            calculator.validateArguments(arguments);
        }

        @Override
        public Map<String, Object> execute(
                Map<String, Object> arguments) {
            executions++;
            return calculator.execute(arguments);
        }
    }

    private final CountingCalculator calculator =
            new CountingCalculator();

    private final AiToolRegistry registry =
            new AiToolRegistry(List.of(
                    new AiToolRegistry.Registration(
                            "calculator", calculator)));

    private final AiToolCallExecutor executor =
            new AiToolCallExecutor(registry);

    private AiToolCall call(
            String id, String operation, int a, int b) {
        return new AiToolCall(
                id,
                "calc_run",
                Map.of(
                        "operation", operation,
                        "a", a,
                        "b", b));
    }

    @Test
    void simulatedResponseParsesAndExecutes() {
        String response = """
                {
                  "choices": [{
                    "finish_reason": "tool_calls",
                    "message": {
                      "role": "assistant",
                      "content": null,
                      "tool_calls": [{
                        "id": "call_add",
                        "type": "function",
                        "function": {
                          "name": "calc_run",
                          "arguments":
                            "{\\"operation\\":\\"add\\",\\"a\\":2,\\"b\\":3}"
                        }
                      }]
                    }
                  }]
                }
                """;

        var calls = new AiToolCallParser().parse(response);

        // Parsing alone must not execute anything.
        assertEquals(0, calculator.executions);

        var results = executor.execute(
                calls, Set.of("calc_run"));

        assertEquals(1, results.size());
        assertEquals("call_add", results.getFirst().toolCallId());
        assertEquals("calc_run", results.getFirst().functionName());
        assertEquals(
                0,
                new BigDecimal("5").compareTo(
                        (BigDecimal) results.getFirst()
                                .output().get("result")));
        assertEquals(1, calculator.executions);
    }

    @Test
    void executesInOrderAndPreservesCallIds() {
        var results = executor.execute(
                List.of(
                        call("first", "multiply", 3, 4),
                        call("second", "subtract", 9, 2)),
                Set.of("calc_run"));

        assertEquals(
                List.of("first", "second"),
                results.stream()
                        .map(AiToolCallExecutor.Result::toolCallId)
                        .toList());

        assertEquals(
                new BigDecimal("12"),
                results.get(0).output().get("result"));
        assertEquals(
                new BigDecimal("7"),
                results.get(1).output().get("result"));
        assertEquals(2, calculator.executions);
    }

    @Test
    void invalidLaterCallPreventsAllExecution() {
        assertThrows(
                IllegalArgumentException.class,
                () -> executor.execute(
                        List.of(
                                call("first", "add", 2, 3),
                                call("second", "divide", 1, 0)),
                        Set.of("calc_run")));

        assertEquals(0, calculator.executions);
    }

    @Test
    void disallowedToolDoesNotExecute() {
        assertThrows(
                IllegalArgumentException.class,
                () -> executor.execute(
                        List.of(call("first", "add", 2, 3)),
                        Set.of()));

        assertEquals(0, calculator.executions);
    }

    @Test
    void unknownToolDoesNotExecute() {
        var unknown = new AiToolCall(
                "unknown",
                "missing_tool",
                Map.of());

        assertThrows(
                IllegalArgumentException.class,
                () -> executor.execute(
                        List.of(unknown),
                        Set.of("missing_tool")));

        assertEquals(0, calculator.executions);
    }

    @Test
    void duplicateIdsPreventAllExecution() {
        assertThrows(
                IllegalArgumentException.class,
                () -> executor.execute(
                        List.of(
                                call("same", "add", 2, 3),
                                call("same", "multiply", 2, 3)),
                        Set.of("calc_run")));

        assertEquals(0, calculator.executions);
    }

    @Test
    void emptyCallsReturnEmptyResults() {
        assertTrue(executor.execute(
                List.of(), Set.of("calc_run")).isEmpty());

        assertEquals(0, calculator.executions);
    }
}