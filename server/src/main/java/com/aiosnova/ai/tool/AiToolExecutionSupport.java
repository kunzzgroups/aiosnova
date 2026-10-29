package com.aiosnova.ai.tool;

import tools.jackson.databind.json.JsonMapper;

final class AiToolExecutionSupport {

    record Support(String state, String reason) {
    }

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private AiToolExecutionSupport() {
    }

    static Support inspect(AiToolRepository.ToolRow tool) {
        if (!"calculator".equals(tool.executorType())
                || !"calc.run".equals(tool.action())) {
            return new Support(
                    "not_implemented",
                    "No executable handler is available for this tool.");
        }

        if (!"low".equals(tool.risk())
                || tool.requiresConfirmation()
                || tool.timeoutSeconds() != 30) {
            return unsupportedConfiguration();
        }

        try {
            var configuration = tool.configuration() == null
                    ? null
                    : JSON.readTree(tool.configuration());

            if (configuration == null
                    || !configuration.isObject()
                    || !configuration.isEmpty()) {
                return unsupportedConfiguration();
            }
        } catch (RuntimeException error) {
            return unsupportedConfiguration();
        }

        return new Support(
                "supported",
                "Calculator execution is supported. "
                        + "Tool status and Agent authorization still apply.");
    }

    private static Support unsupportedConfiguration() {
        return new Support(
                "unsupported_configuration",
                "This configuration is not supported by the Calculator executor.");
    }
}