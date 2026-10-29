package com.aiosnova.ai.tool;

import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AiToolExecutionSupportTest {
    private AiToolRepository.ToolRow row(String status, String action,
            String executor, String risk, int timeout, boolean confirmation, String config) {
        return new AiToolRepository.ToolRow("tool-test", "company-test", "Calculator",
                "Test", "Utility", action, executor, risk, status,
                timeout, confirmation, config, 0L);
    }

    @Test
    void supportIsIndependentOfStatus() {
        for (String status : List.of("active", "disabled", "error")) {
            var support = AiToolExecutionSupport.inspect(row(
                    status, "calc.run", "calculator", "low", 30, false, "{}"));
            assertEquals("supported", support.state());
            assertFalse(support.reason().isBlank());
        }
    }

    @Test
    void actionAndExecutorMustBothBeImplemented() {
        assertEquals("not_implemented", AiToolExecutionSupport.inspect(row(
                "active", "calc.run", "http", "low", 30, false, "{}")).state());
        assertEquals("not_implemented", AiToolExecutionSupport.inspect(row(
                "active", "email.send", "calculator", "low", 30, false, "{}")).state());
    }

    @Test
    void unsupportedSettingsAndInvalidConfigurationFailClosed() {
        for (var tool : List.of(
                row("active", "calc.run", "calculator", "high", 30, false, "{}"),
                row("active", "calc.run", "calculator", "low", 60, false, "{}"),
                row("active", "calc.run", "calculator", "low", 30, true, "{}"))) {
            assertEquals("unsupported_configuration", AiToolExecutionSupport.inspect(tool).state());
        }
        for (String config : new String[] { null, "{invalid", "[]", "null", "{\"x\":1}" }) {
            var support = AiToolExecutionSupport.inspect(row(
                    "active", "calc.run", "calculator", "low", 30, false, config));
            assertEquals("unsupported_configuration", support.state());
            assertFalse(support.reason().contains("{invalid"));
        }
    }
}
