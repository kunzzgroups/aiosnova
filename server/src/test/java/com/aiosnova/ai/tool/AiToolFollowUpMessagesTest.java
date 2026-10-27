package com.aiosnova.ai.tool;

import com.aiosnova.ai.tool.builtin.CalculatorTool;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

class AiToolFollowUpMessagesTest {

    private final JsonMapper json = JsonMapper.builder().build();
    private final AiToolFollowUpMessages assembler =
            new AiToolFollowUpMessages();

    private final AiToolCallExecutor executor =
            new AiToolCallExecutor(
                    new AiToolRegistry(List.of(
                            new AiToolRegistry.Registration(
                                    "calculator",
                                    new CalculatorTool()))));

    private Map<String, Object> toolCall(String id) {
        return Map.of(
                "id", id,
                "type", "function",
                "function", Map.of(
                        "name", "calc_run",
                        "arguments",
                        "{\"operation\":\"add\",\"a\":2,\"b\":3}"));
    }

    private String response(String... ids) {
        var calls = new ArrayList<Map<String, Object>>();

        for (String id : ids) {
            calls.add(toolCall(id));
        }

        var assistant = new HashMap<String, Object>();
        assistant.put("role", "assistant");
        assistant.put("content", null);
        assistant.put("tool_calls", calls);

        return json.writeValueAsString(
                Map.of(
                        "choices", List.of(
                                Map.of(
                                        "finish_reason", "tool_calls",
                                        "message", assistant))));
    }

    private List<Map<String, Object>> originalMessages() {
        return List.of(
                Map.of(
                        "role", "system",
                        "content", "Use the calculator when needed."),
                Map.of(
                        "role", "user",
                        "content", "What is 2 + 3?"));
    }

    private List<AiToolCallExecutor.Result> execute(
            String responseBody) {
        return executor.execute(
                new AiToolCallParser().parse(responseBody),
                Set.of("calc_run"));
    }

    @Test
    void assemblesOriginalAssistantAndToolMessages() {
        String body = response("call_add");

        var messages = assembler.assemble(
                originalMessages(), body, execute(body));

        assertEquals(4, messages.size());
        assertEquals(originalMessages(), messages.subList(0, 2));

        var assistant = messages.get(2);

        assertEquals("assistant", assistant.get("role"));
        assertTrue(assistant.containsKey("content"));
        assertNull(assistant.get("content"));

        // Original tool_calls are preserved, including arguments as a string.
        assertEquals(
                json.readTree(body).path("choices")
                        .get(0).path("message").path("tool_calls"),
                json.readTree(json.writeValueAsString(
                        assistant.get("tool_calls"))));

        var tool = messages.get(3);

        assertEquals("tool", tool.get("role"));
        assertEquals("call_add", tool.get("tool_call_id"));

        var payload = json.readTree(
                (String) tool.get("content"));

        assertTrue(payload.path("ok").asBoolean());
        assertEquals(
                5,
                payload.path("output").path("result").asInt());
    }

    @Test
    void ordersResultsByOriginalCalls() {
        String body = response("first", "second");
        var results = execute(body);

        var messages = assembler.assemble(
                originalMessages(),
                body,
                List.of(results.get(1), results.get(0)));

        assertEquals("first", messages.get(3).get("tool_call_id"));
        assertEquals("second", messages.get(4).get("tool_call_id"));
    }

    @Test
    void failurePreventsSecondRequest() {
        String body = response("call_add");

        var failure = new AiToolCallExecutor.Result(
                "call_add",
                "calc_run",
                null,
                new AiToolCallExecutor.Failure(
                        "tool_execution_failed",
                        "Tool execution failed."));

        var secondRequests = new AtomicInteger();

        assertThrows(
                IllegalArgumentException.class,
                () -> {
                    var messages = assembler.assemble(
                            originalMessages(),
                            body,
                            List.of(failure));

                    // Simulated second request: reached only after assembly.
                    assertFalse(messages.isEmpty());
                    secondRequests.incrementAndGet();
                });

        assertEquals(0, secondRequests.get());
    }

    @Test
    void missingOrMismatchedResultsAreRejected() {
        String body = response("call_add");

        assertThrows(
                IllegalArgumentException.class,
                () -> assembler.assemble(
                        originalMessages(), body, List.of()));

        var wrongId = new AiToolCallExecutor.Result(
                "other_id", "calc_run", Map.of("result", 5), null);

        assertThrows(
                IllegalArgumentException.class,
                () -> assembler.assemble(
                        originalMessages(), body, List.of(wrongId)));

        var wrongFunction = new AiToolCallExecutor.Result(
                "call_add", "other_tool", Map.of("result", 5), null);

        assertThrows(
                IllegalArgumentException.class,
                () -> assembler.assemble(
                        originalMessages(),
                        body,
                        List.of(wrongFunction)));
    }

    @Test
    void duplicateResultsAreRejected() {
        String body = response("first", "second");
        var result = execute(body).getFirst();

        assertThrows(
                IllegalArgumentException.class,
                () -> assembler.assemble(
                        originalMessages(),
                        body,
                        List.of(result, result)));
    }

    @Test
    void assemblyDoesNotMutateOrShareOriginalMessages() {
        var user = new HashMap<String, Object>();
        user.put("role", "user");
        user.put("content", "What is 2 + 3?");

        var original = new ArrayList<Map<String, Object>>();
        original.add(user);

        String before = json.writeValueAsString(original);
        String body = response("call_add");

        var messages = assembler.assemble(
                original, body, execute(body));

        assertEquals(before, json.writeValueAsString(original));

        user.put("content", "Changed later");

        assertEquals(
                "What is 2 + 3?",
                messages.getFirst().get("content"));
    }
}
