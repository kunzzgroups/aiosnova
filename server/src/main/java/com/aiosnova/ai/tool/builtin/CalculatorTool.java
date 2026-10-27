package com.aiosnova.ai.tool.builtin;

import com.aiosnova.ai.tool.AiToolDefinition;
import com.aiosnova.ai.tool.AiToolHandler;

import java.math.BigDecimal;
import java.math.MathContext;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class CalculatorTool implements AiToolHandler {

    private static final Set<String> ARGUMENTS = Set.of("operation", "a", "b");

    private static final AiToolDefinition DEFINITION = new AiToolDefinition(
            "calc.run",
            "calc_run",
            """
                    Calculate two numbers using add, subtract, multiply,
                    or divide. Division uses 34 significant digits.
                    """.strip(),
            Map.of(
                    "type", "object",
                    "properties", Map.of(
                            "operation", Map.of(
                                    "type", "string",
                                    "enum", List.of(
                                            "add",
                                            "subtract",
                                            "multiply",
                                            "divide")),
                            "a", Map.of(
                                    "type", "number",
                                    "description", "First operand."),
                            "b", Map.of(
                                    "type", "number",
                                    "description", "Second operand.")),
                    "required", List.of("operation", "a", "b"),
                    "additionalProperties", false));

    @Override
    public AiToolDefinition definition() {
        return DEFINITION;
    }

    @Override
    public void validateArguments(
            Map<String, Object> arguments) {

        if (arguments == null
                || !ARGUMENTS.equals(arguments.keySet())) {
            throw new IllegalArgumentException(
                    "Provide exactly operation, a and b.");
        }

        Object operationValue = arguments.get("operation");

        if (!(operationValue instanceof String operation)
                || !Set.of(
                        "add",
                        "subtract",
                        "multiply",
                        "divide").contains(operation)) {
            throw new IllegalArgumentException(
                    "Operation must be add, subtract, multiply or divide.");
        }

        readNumber(arguments.get("a"), "a");
        BigDecimal b = readNumber(arguments.get("b"), "b");

        if ("divide".equals(operation) && b.signum() == 0) {
            throw new IllegalArgumentException(
                    "Cannot divide by zero.");
        }
    }

    @Override
    public Map<String, Object> execute(
            Map<String, Object> arguments) {

        // Keep validation here too, so direct calls cannot bypass it.
        validateArguments(arguments);

        String operation = (String) arguments.get("operation");
        BigDecimal a = readNumber(arguments.get("a"), "a");
        BigDecimal b = readNumber(arguments.get("b"), "b");

        BigDecimal result = switch (operation) {
            case "add" -> a.add(b);
            case "subtract" -> a.subtract(b);
            case "multiply" -> a.multiply(b);
            case "divide" -> a.divide(b, MathContext.DECIMAL128);
            default -> throw new IllegalStateException(
                    "Unexpected validated operation.");
        };

        return Map.of("result", result);
    }

    private static BigDecimal readNumber(
            Object value,
            String name) {

        if (!(value instanceof Number number)) {
            throw new IllegalArgumentException(
                    name + " must be a finite number.");
        }

        String text = number.toString();

        if (text.length() > 128) {
            throw new IllegalArgumentException(
                    name + " exceeds the supported numeric range.");
        }

        BigDecimal decimal;

        try {
            decimal = new BigDecimal(text);
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException(
                    name + " must be a finite number.");
        }

        if (decimal.precision() > 100
                || Math.abs((long) decimal.scale()) > 100) {
            throw new IllegalArgumentException(
                    name + " exceeds the supported numeric range.");
        }

        return decimal;
    }
}
