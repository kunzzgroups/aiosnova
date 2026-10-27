package com.aiosnova.ai.tool;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class AiToolCallExecutor {

    public record Failure(
            String code,
            String message) {
    }

    public record Result(
            String toolCallId,
            String functionName,
            Map<String, Object> output,
            Failure error) {

        public Result {
            if (toolCallId == null || toolCallId.isBlank() || functionName == null || functionName.isBlank()) {
                throw new IllegalArgumentException("Tool-call identity is required.");
            }

            // Exactly one of output or error must be present.
            if ((output == null) == (error == null)) {
                throw new IllegalArgumentException("Provide either output or error.");
            }

            if (output != null) {
                output = Map.copyOf(output);
            }
        }

        public boolean success() {
            return error == null;
        }
    }

    private final AiToolRegistry registry;
    private final AiToolCallValidator validator;

    public AiToolCallExecutor(AiToolRegistry registry) {
        if (registry == null) {
            throw new IllegalArgumentException(
                    "Tool registry is required.");
        }

        this.registry = registry;
        this.validator = new AiToolCallValidator(registry);
    }

    public List<Result> execute(
            List<AiToolCall> calls,
            Set<String> allowedFunctionNames) {

        return execute(calls, allowedFunctionNames, () -> {});
    }

    public List<Result> execute(
            List<AiToolCall> calls,
            Set<String> allowedFunctionNames,
            Runnable beforeEachExecution) {

        if (calls == null || calls.size() > 8 || beforeEachExecution == null) {
            throw new IllegalArgumentException(
                    "Provide at most eight tool calls.");
        }

        List<AiToolCall> batch = List.copyOf(calls);

        // Validate every call before executing the first one.
        validator.validate(batch, allowedFunctionNames);

        List<Result> results = new ArrayList<>();
        boolean stopped = false;

        for (AiToolCall call : batch) {
            if (stopped) {
                results.add(new Result(
                        call.id(),
                        call.functionName(),
                        null,
                        new Failure(
                                "execution_skipped",
                                "Not executed because an earlier tool failed.")));
                continue;
            }

            // Authorization failures must escape without becoming tool errors.
            beforeEachExecution.run();

            try {
                Map<String, Object> output = registry.executeFunction(
                        call.functionName(),
                        call.arguments());

                results.add(new Result(
                        call.id(),
                        call.functionName(),
                        output,
                        null));

            } catch (RuntimeException error) {
                results.add(new Result(
                        call.id(),
                        call.functionName(),
                        null,
                        new Failure(
                                "tool_execution_failed",
                                "Tool execution failed.")));

                stopped = true;
            }
        }

        return List.copyOf(results);
    }
}
