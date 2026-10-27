package com.aiosnova.ai.tool;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class AiToolCallValidator {

    private final AiToolRegistry registry;

    public AiToolCallValidator(AiToolRegistry registry) {
        if (registry == null) {
            throw new IllegalArgumentException(
                    "Tool registry is required.");
        }

        this.registry = registry;
    }

    public void validate(
            List<AiToolCall> calls,
            Set<String> allowedFunctionNames) {

        if (calls == null
                || allowedFunctionNames == null
                || allowedFunctionNames.stream().anyMatch(
                        name -> name == null || name.isBlank())) {
            throw new IllegalArgumentException(
                    "Tool calls and allowed function names are required.");
        }

        Set<String> allowed = Set.copyOf(allowedFunctionNames);
        Set<String> ids = new HashSet<>();

        // Check every call's identity and allowlist before parameter validation.
        for (AiToolCall call : calls) {
            if (call == null
                    || call.id() == null
                    || !call.id().matches("[!-~]{1,200}")
                    || !ids.add(call.id())
                    || call.functionName() == null
                    || !call.functionName().matches(
                            "[A-Za-z][A-Za-z0-9_-]{0,63}")) {

                throw new IllegalArgumentException(
                        "Invalid tool-call identity.");
            }

            if (!allowed.contains(call.functionName())) {
                throw new IllegalArgumentException(
                        "Tool is not allowed for this request.");
            }
        }

        // Validate the entire batch. Never execute any tool here.
        for (AiToolCall call : calls) {
            registry.validateFunctionArguments(
                    call.functionName(),
                    call.arguments());
        }
    }
}
