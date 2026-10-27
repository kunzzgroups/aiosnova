package com.aiosnova.ai.tool.builtin;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class CalculatorToolTest {

    private final CalculatorTool tool = new CalculatorTool();

    private BigDecimal calculate(
            String operation,
            Number a,
            Number b) {

        return (BigDecimal) tool.execute(
                Map.of(
                        "operation", operation,
                        "a", a,
                        "b", b))
                .get("result");
    }

    private void assertNumber(
            String expected,
            BigDecimal actual) {

        assertEquals(
                0,
                new BigDecimal(expected).compareTo(actual));
    }

    @Test
    void supportsFourOperations() {
        assertNumber("12", calculate("add", 7, 5));
        assertNumber("2", calculate("subtract", 7, 5));
        assertNumber("35", calculate("multiply", 7, 5));
        assertNumber("1.4", calculate("divide", 7, 5));
    }

    @Test
    void handlesDecimalsNegativeNumbersAndZero() {
        assertNumber(
                "0.3",
                calculate(
                        "add",
                        new BigDecimal("0.1"),
                        new BigDecimal("0.2")));

        assertNumber("-12", calculate("multiply", -3, 4));
        assertNumber("0", calculate("add", 0, 0));
        assertNumber("0", calculate("divide", 0, 5));
    }

    @Test
    void roundsRepeatingDivisionPredictably() {
        assertNumber(
                "0.3333333333333333333333333333333333",
                calculate("divide", 1, 3));
    }

    @Test
    void rejectsZeroDivisors() {
        for (Number zero : List.<Number>of(
                0,
                0.0,
                new BigDecimal("-0.000"))) {

            var error = assertThrows(
                    IllegalArgumentException.class,
                    () -> calculate("divide", 5, zero));

            assertEquals("Cannot divide by zero.", error.getMessage());
        }
    }

    @Test
    void rejectsMissingExtraAndInvalidOperationArguments() {
        assertThrows(
                IllegalArgumentException.class,
                () -> tool.execute(null));

        assertThrows(
                IllegalArgumentException.class,
                () -> tool.execute(
                        Map.of("operation", "add", "a", 1)));

        assertThrows(
                IllegalArgumentException.class,
                () -> tool.execute(
                        Map.of(
                                "operation", "add",
                                "a", 1,
                                "b", 2,
                                "extra", true)));

        for (Object operation : List.of("power", "ADD", "", 123)) {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> tool.execute(
                            Map.of(
                                    "operation", operation,
                                    "a", 1,
                                    "b", 2)));
        }
    }

    @Test
    void rejectsInvalidNumbersInEitherOperand() {
        for (Object invalid : List.of(
                "12",
                true,
                Double.NaN,
                Double.POSITIVE_INFINITY,
                Double.NEGATIVE_INFINITY,
                new BigDecimal("1E+101"))) {

            assertThrows(
                    IllegalArgumentException.class,
                    () -> tool.execute(
                            Map.of(
                                    "operation", "add",
                                    "a", invalid,
                                    "b", 1)));

            assertThrows(
                    IllegalArgumentException.class,
                    () -> tool.execute(
                            Map.of(
                                    "operation", "add",
                                    "a", 1,
                                    "b", invalid)));
        }

        var arguments = new HashMap<String, Object>();
        arguments.put("operation", "add");
        arguments.put("a", null);
        arguments.put("b", 1);

        assertThrows(
                IllegalArgumentException.class,
                () -> tool.execute(arguments));
    }

    @Test
    void preservesInputAndReturnsStructuredResult() {
        var arguments = new HashMap<String, Object>(
                Map.of("operation", "add", "a", 2, "b", 3));
        var before = new HashMap<>(arguments);

        var result = tool.execute(arguments);

        assertEquals(before, arguments);
        assertEquals(1, result.size());
        assertNumber("5", (BigDecimal) result.get("result"));
    }

    @Test
    void exposesToolIdentityAndParameterSchema() {
        var definition = tool.definition();

        assertEquals("calc.run", definition.action());
        assertEquals("calc_run", definition.functionName());
        assertFalse(definition.description().isBlank());

        var schema = definition.parameters();

        assertEquals("object", schema.get("type"));
        assertEquals(
                List.of("operation", "a", "b"),
                schema.get("required"));
        assertEquals(false, schema.get("additionalProperties"));
    }
}