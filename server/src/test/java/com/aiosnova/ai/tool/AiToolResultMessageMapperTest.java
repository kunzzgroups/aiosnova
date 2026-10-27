package com.aiosnova.ai.tool;

import com.aiosnova.ai.tool.builtin.CalculatorTool;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

class AiToolResultMessageMapperTest {

    private final JsonMapper json = JsonMapper.builder().build();

    private static final class SimulatedCalculator
            implements AiToolHandler {

        private final CalculatorTool calculator =
                new CalculatorTool();

        private final boolean fail;
        private int executions;

        private SimulatedCalculator(boolean fail) {
            this.fail = fail;
        }

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

            if (fail) {
                throw new IllegalStateException(
                        "SECRET_KEY_AND_INTERNAL_DETAILS");
            }

            return calculator.execute(arguments);
        }
    }

    private AiToolCallExecutor executor(
            SimulatedCalculator calculator) {
        return new AiToolCallExecutor(
                new AiToolRegistry(List.of(
                        new AiToolRegistry.Registration(
                                "calculator", calculator))));
    }

    private List<AiToolCall> simulatedCalls() {
        String arguments = json.writeValueAsString(
                Map.of(
                        "operation", "add",
                        "a", 2,
                        "b", 3));

        String response = json.writeValueAsString(
                Map.of(
                        "choices", List.of(
                                Map.of(
                                        "finish_reason", "tool_calls",
                                        "message", Map.of(
                                                "role", "assistant",
                                                "tool_calls", List.of(
                                                        Map.of(
                                                                "id", "call_add",
                                                                "type", "function",
                                                                "function", Map.of(
                                                                        "name", "calc_run",
                                                                        "arguments", arguments))))))));

        return new AiToolCallParser().parse(response);
    }

    @Test
    void simulatedSuccessBecomesToolMessage() {
        var calculator = new SimulatedCalculator(false);

        var results = executor(calculator).execute(
                simulatedCalls(), Set.of("calc_run"));

        assertTrue(results.getFirst().success());
        assertNull(results.getFirst().error());

        var messages =
                new AiToolResultMessageMapper().toMessages(results);

        assertEquals(1, messages.size());

        var message = messages.getFirst();

        assertEquals(
                Set.of("role", "tool_call_id", "content"),
                message.keySet());
        assertEquals("tool", message.get("role"));
        assertEquals("call_add", message.get("tool_call_id"));
        assertInstanceOf(String.class, message.get("content"));

        var content = json.readTree(
                (String) message.get("content"));

        assertTrue(content.path("ok").asBoolean());
        assertEquals(
                5,
                content.path("output").path("result").asInt());
        assertEquals(1, calculator.executions);
    }

    @Test
    void executionFailureIsStructuredAndSanitized() {
        var calculator = new SimulatedCalculator(true);

        var results = executor(calculator).execute(
                simulatedCalls(), Set.of("calc_run"));

        var result = results.getFirst();

        assertFalse(result.success());
        assertNull(result.output());
        assertEquals(
                "tool_execution_failed",
                result.error().code());

        var message = new AiToolResultMessageMapper()
                .toMessages(results).getFirst();

        String text = (String) message.get("content");
        var content = json.readTree(text);

        assertFalse(content.path("ok").asBoolean());
        assertEquals(
                "tool_execution_failed",
                content.path("error").path("code").asString());
        assertFalse(text.contains("SECRET_KEY"));
        assertFalse(text.contains("IllegalStateException"));
        assertEquals(1, calculator.executions);
    }

    @Test
    void failureStopsLaterCallsWithoutRetry() {
        var calculator = new SimulatedCalculator(true);
        var first = simulatedCalls().getFirst();

        var second = new AiToolCall(
                "call_second",
                first.functionName(),
                first.arguments());

        var results = executor(calculator).execute(
                List.of(first, second),
                Set.of("calc_run"));

        assertEquals(2, results.size());
        assertEquals(
                "tool_execution_failed",
                results.get(0).error().code());
        assertEquals(
                "execution_skipped",
                results.get(1).error().code());
        assertEquals(1, calculator.executions);

        var messages =
                new AiToolResultMessageMapper().toMessages(results);

        assertEquals(
                List.of("call_add", "call_second"),
                messages.stream()
                        .map(message -> message.get("tool_call_id"))
                        .toList());
    }

    @Test
    void validationFailureStillPreventsExecution() {
        var calculator = new SimulatedCalculator(false);

        assertThrows(
                IllegalArgumentException.class,
                () -> executor(calculator).execute(
                        simulatedCalls(), Set.of()));

        assertEquals(0, calculator.executions);
    }

    @Test
    void duplicateResultIdsAreRejected() {
        var result = new AiToolCallExecutor.Result(
                "same",
                "calc_run",
                Map.of("result", 5),
                null);

        assertThrows(
                IllegalArgumentException.class,
                () -> new AiToolResultMessageMapper()
                        .toMessages(List.of(result, result)));
    }
}