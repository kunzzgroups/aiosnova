package com.aiosnova.ai.tool;

import com.aiosnova.ai.tool.builtin.CalculatorTool;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

class AiToolCallValidatorTest {

    private static class ValidationOnlyCalculator
            implements AiToolHandler {

        private final CalculatorTool calculator =
                new CalculatorTool();

        int validations;
        int executions;

        @Override
        public AiToolDefinition definition() {
            return calculator.definition();
        }

        @Override
        public void validateArguments(
                Map<String, Object> arguments) {

            validations++;
            calculator.validateArguments(arguments);
        }

        @Override
        public Map<String, Object> execute(
                Map<String, Object> arguments) {

            executions++;
            throw new AssertionError(
                    "Validator must never execute tools.");
        }
    }

    private final ValidationOnlyCalculator tool =
            new ValidationOnlyCalculator();

    private final AiToolRegistry registry =
            new AiToolRegistry(List.of(
                    new AiToolRegistry.Registration(
                            "calculator",
                            tool)));

    private final AiToolCallValidator validator =
            new AiToolCallValidator(registry);

    private Map<String, Object> validArguments() {
        return Map.of(
                "operation", "add",
                "a", 2,
                "b", 3);
    }

    @Test
    void acceptsAllowedRegisteredToolWithoutExecuting() {
        validator.validate(
                List.of(new AiToolCall(
                        "call_1",
                        "calc_run",
                        validArguments())),
                Set.of("calc_run"));

        assertEquals(1, tool.validations);
        assertEquals(0, tool.executions);
    }

    @Test
    void registeredToolStillRequiresRequestPermission() {
        var error = assertThrows(
                IllegalArgumentException.class,
                () -> validator.validate(
                        List.of(new AiToolCall(
                                "call_1",
                                "calc_run",
                                validArguments())),
                        Set.of()));

        assertEquals(
                "Tool is not allowed for this request.",
                error.getMessage());

        assertEquals(0, tool.validations);
        assertEquals(0, tool.executions);
    }

    @Test
    void allowedNameMustAlsoBeRegistered() {
        var error = assertThrows(
                IllegalArgumentException.class,
                () -> validator.validate(
                        List.of(new AiToolCall(
                                "call_1",
                                "unknown_tool",
                                Map.of())),
                        Set.of("unknown_tool")));

        assertEquals(
                "Unknown tool function.",
                error.getMessage());

        assertEquals(0, tool.executions);
    }

    @Test
    void rejectsInvalidCalculatorParameters() {
        List<Map<String, Object>> invalidArguments = List.of(
                Map.of("operation", "add", "a", 1),
                Map.of("operation", "power", "a", 1, "b", 2),
                Map.of("operation", "add", "a", "1", "b", 2),
                Map.of("operation", "divide", "a", 1, "b", 0),
                Map.of(
                        "operation", "add",
                        "a", 1,
                        "b", 2,
                        "extra", true));

        for (Map<String, Object> arguments : invalidArguments) {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> validator.validate(
                            List.of(new AiToolCall(
                                    "call_1",
                                    "calc_run",
                                    arguments)),
                            Set.of("calc_run")));
        }

        assertEquals(0, tool.executions);
    }

    @Test
    void invalidLaterCallDoesNotExecuteEarlierValidCall() {
        assertThrows(
                IllegalArgumentException.class,
                () -> validator.validate(
                        List.of(
                                new AiToolCall(
                                        "call_1",
                                        "calc_run",
                                        validArguments()),
                                new AiToolCall(
                                        "call_2",
                                        "calc_run",
                                        Map.of(
                                                "operation", "divide",
                                                "a", 5,
                                                "b", 0))),
                        Set.of("calc_run")));

        assertEquals(2, tool.validations);
        assertEquals(0, tool.executions);
    }

    @Test
    void handlesEmptyBatchAndRejectsInvalidInputs() {
        assertDoesNotThrow(
                () -> validator.validate(
                        List.of(),
                        Set.of()));

        assertThrows(
                IllegalArgumentException.class,
                () -> validator.validate(null, Set.of()));

        assertThrows(
                IllegalArgumentException.class,
                () -> validator.validate(List.of(), null));

        assertThrows(
                IllegalArgumentException.class,
                () -> validator.validate(
                        List.of(
                                new AiToolCall(
                                        "same",
                                        "calc_run",
                                        validArguments()),
                                new AiToolCall(
                                        "same",
                                        "calc_run",
                                        validArguments())),
                        Set.of("calc_run")));

        assertThrows(
                IllegalArgumentException.class,
                () -> validator.validate(
                        List.of(new AiToolCall(
                                "call_1",
                                "calc_run",
                                null)),
                        Set.of("calc_run")));

        assertEquals(0, tool.executions);
    }
}
