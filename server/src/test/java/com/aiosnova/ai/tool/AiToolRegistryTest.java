package com.aiosnova.ai.tool;

import com.aiosnova.ai.tool.builtin.CalculatorTool;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class AiToolRegistryTest {

    private AiToolRegistry calculatorRegistry() {
        return new AiToolRegistry(List.of(
                new AiToolRegistry.Registration(
                        "calculator",
                        new CalculatorTool())));
    }

    private static class CountingTool implements AiToolHandler {

        private final String action;
        private final String functionName;
        int calls;

        CountingTool(String action, String functionName) {
            this.action = action;
            this.functionName = functionName;
        }

        @Override
        public AiToolDefinition definition() {
            return new AiToolDefinition(
                    action,
                    functionName,
                    "Test tool.",
                    Map.of("type", "object"));
        }

        @Override
        public Map<String, Object> execute(
                Map<String, Object> arguments) {

            calls++;
            return Map.of("result", "test");
        }

        @Override
        public void validateArguments(
                Map<String, Object> arguments) {

            if (arguments == null) {
                throw new IllegalArgumentException(
                        "Tool arguments are required.");
            }
        }
    }

    @Test
    void listsRegisteredDefinitionAndExecutesFunction() {
        var registry = calculatorRegistry();

        assertEquals(1, registry.definitions().size());
        assertEquals(
                "calc_run",
                registry.definitions().getFirst().functionName());

        var result = registry.executeFunction(
                "calc_run",
                Map.of("operation", "add", "a", 2, "b", 3));

        assertEquals(
                0,
                new BigDecimal("5").compareTo(
                        (BigDecimal) result.get("result")));
    }

    @Test
    void reusesExecutorTypeForDifferentCalls() {
        var registry = calculatorRegistry();

        var first = registry.executeByType(
                "calculator",
                Map.of("operation", "multiply", "a", 3, "b", 4));

        var second = registry.executeByType(
                "calculator",
                Map.of("operation", "subtract", "a", 10, "b", 3));

        assertEquals(
                0,
                new BigDecimal("12").compareTo(
                        (BigDecimal) first.get("result")));

        assertEquals(
                0,
                new BigDecimal("7").compareTo(
                        (BigDecimal) second.get("result")));
    }

    @Test
    void rejectsDuplicateExecutorType() {
        var error = assertThrows(
                IllegalArgumentException.class,
                () -> new AiToolRegistry(List.of(
                        new AiToolRegistry.Registration(
                                "calculator",
                                new CalculatorTool()),
                        new AiToolRegistry.Registration(
                                "calculator",
                                new CountingTool(
                                        "other.run",
                                        "other_run")))));

        assertTrue(error.getMessage().contains(
                "Duplicate executor type"));
    }

    @Test
    void rejectsDuplicateFunctionName() {
        var error = assertThrows(
                IllegalArgumentException.class,
                () -> new AiToolRegistry(List.of(
                        new AiToolRegistry.Registration(
                                "calculator",
                                new CalculatorTool()),
                        new AiToolRegistry.Registration(
                                "other",
                                new CountingTool(
                                        "other.run",
                                        "calc_run")))));

        assertTrue(error.getMessage().contains(
                "Duplicate tool function"));
    }

    @Test
    void rejectsDuplicateAction() {
        var error = assertThrows(
                IllegalArgumentException.class,
                () -> new AiToolRegistry(List.of(
                        new AiToolRegistry.Registration(
                                "calculator",
                                new CalculatorTool()),
                        new AiToolRegistry.Registration(
                                "other",
                                new CountingTool(
                                        "calc.run",
                                        "other_run")))));

        assertTrue(error.getMessage().contains(
                "Duplicate tool action"));
    }

    @Test
    void unknownCallsNeverExecuteRegisteredHandler() {
        var tool = new CountingTool("test.run", "test_run");

        var registry = new AiToolRegistry(List.of(
                new AiToolRegistry.Registration("test", tool)));

        for (String unknown : List.of(
                "missing",
                "TEST_RUN",
                "java.lang.Runtime")) {

            assertThrows(
                    IllegalArgumentException.class,
                    () -> registry.executeFunction(
                            unknown,
                            Map.of()));

            assertThrows(
                    IllegalArgumentException.class,
                    () -> registry.executeByType(
                            unknown,
                            Map.of()));
        }

        assertThrows(
                IllegalArgumentException.class,
                () -> registry.executeFunction(null, Map.of()));

        assertThrows(
                IllegalArgumentException.class,
                () -> registry.executeByType(null, Map.of()));

        assertEquals(0, tool.calls);
    }

    @Test
    void definitionListCannotBeModified() {
        var registry = calculatorRegistry();

        assertThrows(
                UnsupportedOperationException.class,
                () -> registry.definitions().clear());

        assertEquals(1, registry.definitions().size());
    }

    @Test
    void preservesCalculatorParameterValidation() {
        var registry = calculatorRegistry();

        assertThrows(
                IllegalArgumentException.class,
                () -> registry.executeFunction(
                        "calc_run",
                        Map.of(
                                "operation", "divide",
                                "a", 5,
                                "b", 0)));

        assertThrows(
                IllegalArgumentException.class,
                () -> registry.executeFunction(
                        "calc_run",
                        Map.of("operation", "add", "a", 1)));

        assertThrows(
                IllegalArgumentException.class,
                () -> registry.executeByType(
                        "calculator",
                        null));
    }

    @Test
    void rejectsInvalidRegistrationAndDefinition() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new AiToolRegistry(null));

        assertThrows(
                IllegalArgumentException.class,
                () -> new AiToolRegistry(List.of(
                        new AiToolRegistry.Registration(
                                "",
                                new CalculatorTool()))));

        assertThrows(
                IllegalArgumentException.class,
                () -> new AiToolRegistry(List.of(
                        new AiToolRegistry.Registration(
                                "invalid",
                                new CountingTool(
                                        "invalid-action",
                                        "invalid function")))));
    }
}
