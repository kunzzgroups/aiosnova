package com.aiosnova.ai.tool;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class AiToolRegistry {

    public record Registration(
            String executorType,
            AiToolHandler handler) {
    }

    private final Map<String, AiToolHandler> handlersByType;
    private final Map<String, String> typesByFunction;
    private final List<AiToolDefinition> definitions;

    public AiToolRegistry(List<Registration> registrations) {

        if (registrations == null) {
            throw new IllegalArgumentException(
                    "Tool registrations are required.");
        }

        Map<String, AiToolHandler> handlers = new HashMap<>();
        Map<String, String> functions = new HashMap<>();
        Set<String> actions = new HashSet<>();
        List<AiToolDefinition> entries = new ArrayList<>();

        for (Registration registration : registrations) {
            if (registration == null
                    || registration.executorType() == null
                    || !registration.executorType()
                            .matches("[a-z][a-z0-9_]{0,63}")
                    || registration.handler() == null) {

                throw new IllegalArgumentException(
                        "Invalid tool registration.");
            }

            String executorType = registration.executorType();
            AiToolHandler handler = registration.handler();
            AiToolDefinition definition = handler.definition();

            validateDefinition(definition);

            if (handlers.putIfAbsent(executorType, handler) != null) {
                throw new IllegalArgumentException(
                        "Duplicate executor type: " + executorType);
            }

            if (functions.putIfAbsent(
                    definition.functionName(),
                    executorType) != null) {

                throw new IllegalArgumentException(
                        "Duplicate tool function: "
                                + definition.functionName());
            }

            if (!actions.add(definition.action())) {
                throw new IllegalArgumentException(
                        "Duplicate tool action: " + definition.action());
            }

            entries.add(definition);
        }

        handlersByType = Map.copyOf(handlers);
        typesByFunction = Map.copyOf(functions);
        definitions = List.copyOf(entries);
    }

    public List<AiToolDefinition> definitions() {
        return definitions;
    }

    public void validateFunctionArguments(
            String functionName,
            Map<String, Object> arguments) {

        String executorType = functionName == null
                ? null
                : typesByFunction.get(functionName);

        if (executorType == null) {
            throw new IllegalArgumentException(
                    "Unknown tool function.");
        }

        if (arguments == null) {
            throw new IllegalArgumentException(
                    "Tool arguments are required.");
        }

        handlersByType.get(executorType)
                .validateArguments(arguments);
    }

    public Map<String, Object> executeFunction(
            String functionName,
            Map<String, Object> arguments) {

        String executorType = functionName == null
                ? null
                : typesByFunction.get(functionName);

        if (executorType == null) {
            throw new IllegalArgumentException(
                    "Unknown tool function.");
        }

        return executeByType(executorType, arguments);
    }

    public Map<String, Object> executeByType(
            String executorType,
            Map<String, Object> arguments) {

        AiToolHandler handler = executorType == null
                ? null
                : handlersByType.get(executorType);

        if (handler == null) {
            throw new IllegalArgumentException(
                    "Unknown tool executor type.");
        }

        if (arguments == null) {
            throw new IllegalArgumentException(
                    "Tool arguments are required.");
        }

        return handler.execute(arguments);
    }

    private static void validateDefinition(
            AiToolDefinition definition) {

        if (definition == null
                || definition.action() == null
                || !definition.action().matches(
                        "[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+")
                || definition.functionName() == null
                || !definition.functionName().matches(
                        "[A-Za-z][A-Za-z0-9_-]{0,63}")
                || definition.description() == null
                || definition.description().isBlank()
                || definition.parameters() == null
                || !"object".equals(
                        definition.parameters().get("type"))) {

            throw new IllegalArgumentException(
                    "Invalid tool definition.");
        }
    }
}
