package com.aiosnova.ai.chat;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.net.URI;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class AiToolLiveAcceptanceCheckTest {

    @Test
    void preparesBoundedCalculatorPlan() {
        var plan = AiToolLiveAcceptanceCheck.prepare(
                "--prepare", "test/model");

        assertEquals("test/model", plan.modelId());
        assertEquals(2, plan.maxModelRequests());
        assertEquals(1, plan.maxToolExecutions());
    }

    @Test
    void rejectsLiveMode() {
        assertThrows(
                IllegalArgumentException.class,
                () -> AiToolLiveAcceptanceCheck.prepare(
                        "--run", "test/model"));
    }

    @Test
    void rejectsMissingModel() {
        assertThrows(
                IllegalArgumentException.class,
                () -> AiToolLiveAcceptanceCheck.prepare(
                        "--prepare", null));
    }

    @Test
    void rejectsInvalidModel() {
        assertThrows(
                IllegalArgumentException.class,
                () -> AiToolLiveAcceptanceCheck.prepare(
                        "--prepare", "model\ninvalid"));
    }

    @Test
    void runsExistingServiceWithSimulatedTransportAndEnforcesBudgets()
            throws Exception {
        var transport = new AiChatToolIntegrationTest.FakeTransport();
        var budget = new AiToolLiveAcceptanceCheck.Budget(transport);

        String reply = AiToolLiveAcceptanceCheck.runWithTransport(
                "test/model", "fake-acceptance-key", budget);

        assertEquals("The answer is 5.", reply);
        assertTrue(budget.calculatorVerified());
        assertEquals(2, budget.modelRequests());
        assertEquals(1, budget.toolExecutions());
        assertEquals(2, transport.requests.size());

        // Reject before forwarding to the Transport or executing Calculator.
        assertThrows(IllegalStateException.class,
                () -> budget.send(transport.requests.getFirst()));
        assertEquals(2, transport.requests.size());
        assertEquals(2, budget.modelRequests());
        // Even a newly obtained wrapper shares the same run's execution budget.
        assertThrows(IllegalStateException.class,
                () -> budget.calculator().execute(java.util.Map.of(
                        "operation", "add", "a", 2, "b", 3)));
        assertEquals(1, budget.toolExecutions());
    }

    @Test
    void upstreamFailureStopsWithoutRetryOrToolExecution() {
        var delegateCalls = new java.util.concurrent.atomic.AtomicInteger();
        var budget = new AiToolLiveAcceptanceCheck.Budget(request -> {
            delegateCalls.incrementAndGet();
            return new AiChatService.ChatHttpResult(502, "{}");
        });

        var error = assertThrows(AiToolConversationService.Failure.class,
                () -> AiToolLiveAcceptanceCheck.runWithTransport(
                        "test/model", "fake-acceptance-key", budget));

        assertEquals("upstream_http_error", error.code());
        assertEquals(1, delegateCalls.get());
        assertEquals(1, budget.modelRequests());
        assertEquals(0, budget.toolExecutions());
    }

    @Test
    void missingOptInOrKeyNeverCreatesTransport() {
        var factories = new AtomicInteger();
        var bytes = new ByteArrayOutputStream();
        var output = new PrintStream(
                bytes, true, StandardCharsets.UTF_8);

        for (var environment : java.util.List.of(
                Map.<String, String>of(),
                Map.of(
                        "AI_RUN_TOOL_LIVE_ACCEPTANCE", "false",
                        "AI_TOOL_LIVE_API_KEY", "fake-key"),
                Map.of(
                        "AI_RUN_TOOL_LIVE_ACCEPTANCE", "true"),
                Map.of(
                        "AI_RUN_TOOL_LIVE_ACCEPTANCE", "TRUE",
                        "AI_TOOL_LIVE_API_KEY", "fake-key"),
                Map.of(
                        "AI_RUN_TOOL_LIVE_ACCEPTANCE", "true",
                        "AI_TOOL_LIVE_API_KEY", " "),
                Map.of(
                        "AI_RUN_TOOL_LIVE_ACCEPTANCE", "true",
                        "AI_TOOL_LIVE_API_KEY", "fake\nkey"))) {

            int exit = AiToolLiveAcceptanceCheck.runOptIn(
                    "test/model",
                    environment,
                    () -> {
                        factories.incrementAndGet();
                        throw new AssertionError(
                                "Transport must not be created.");
                    },
                    output);

            assertEquals(2, exit);
        }

        assertEquals(0, factories.get());
    }

    @Test
    void rejectsOtherEndpointsBeforeSending() {
        var sends = new AtomicInteger();

        var transport = AiToolLiveAcceptanceCheck.checkedTransport(
                request -> {
                    sends.incrementAndGet();
                    return new AiChatService.ChatHttpResult(200, "{}");
                });

        for (String address : java.util.List.of(
                "http://openrouter.ai/api/v1/chat/completions",
                "https://example.com/api/v1/chat/completions",
                "https://openrouter.ai:8443/api/v1/chat/completions",
                "https://openrouter.ai/api/v1/chat/completions?extra=1",
                "https://openrouter.ai/api/v1/models")) {

            var request = HttpRequest.newBuilder(URI.create(address))
                    .POST(HttpRequest.BodyPublishers.ofString("{}"))
                    .build();

            assertThrows(
                    IllegalArgumentException.class,
                    () -> transport.send(request));
        }

        var wrongMethod = HttpRequest.newBuilder(
                AiToolLiveAcceptanceCheck.ALLOWED_ENDPOINT)
                .GET()
                .build();

        assertThrows(
                IllegalArgumentException.class,
                () -> transport.send(wrongMethod));

        assertEquals(0, sends.get());
    }

    @Test
    void optedInSimulationProducesSafeSummary() {
        var transport = new AiChatToolIntegrationTest.FakeTransport();

        var bytes = new ByteArrayOutputStream();
        var output = new PrintStream(
                bytes, true, StandardCharsets.UTF_8);

        int exit = AiToolLiveAcceptanceCheck.runOptIn(
                "test/model",
                Map.of(
                        "AI_RUN_TOOL_LIVE_ACCEPTANCE", "true",
                        "AI_TOOL_LIVE_API_KEY", "fake-acceptance-key"),
                () -> transport,
                output);

        String text = bytes.toString(StandardCharsets.UTF_8);

        assertEquals(0, exit);
        assertEquals(2, transport.requests.size());
        assertTrue(text.contains(
                "PASS: modelRequests=2, toolExecutions=1."));
        assertFalse(text.contains("fake-acceptance-key"));
        assertFalse(text.contains("The answer is 5."));
        assertFalse(text.contains("Authorization"));
    }

    @Test
    void failureDoesNotExposeSensitiveDetailsOrRetry() {
        var sends = new AtomicInteger();
        var bytes = new ByteArrayOutputStream();
        var output = new PrintStream(
                bytes, true, StandardCharsets.UTF_8);

        int exit = AiToolLiveAcceptanceCheck.runOptIn(
                "test/model",
                Map.of(
                        "AI_RUN_TOOL_LIVE_ACCEPTANCE", "true",
                        "AI_TOOL_LIVE_API_KEY", "fake-secret-key"),
                () -> request -> {
                    sends.incrementAndGet();
                    throw new IllegalStateException(
                            "SECRET upstream details fake-secret-key");
                },
                output);

        String text = bytes.toString(StandardCharsets.UTF_8);

        assertEquals(1, exit);
        assertEquals(1, sends.get());
        assertTrue(text.contains("FAIL: acceptance stopped"));
        assertFalse(text.contains("SECRET"));
        assertFalse(text.contains("fake-secret-key"));
        assertFalse(text.contains("IllegalStateException"));
    }

    @Test
    void prepareNeverCreatesTransportEvenWhenOptedIn() {
        var bytes = new ByteArrayOutputStream();
        var output = new PrintStream(bytes, true, StandardCharsets.UTF_8);
        int exit = AiToolLiveAcceptanceCheck.execute(
                new String[] { "--prepare", "test/model" },
                Map.of("AI_RUN_TOOL_LIVE_ACCEPTANCE", "true",
                        "AI_TOOL_LIVE_API_KEY", "fake-key"),
                () -> { throw new AssertionError("Prepare created Transport."); },
                output);
        assertEquals(0, exit);
        assertTrue(bytes.toString(StandardCharsets.UTF_8).contains("PREPARATION ONLY"));
        assertFalse(bytes.toString(StandardCharsets.UTF_8).contains("fake-key"));
    }

    @Test
    void runWithoutOptInIsBlockedBeforeTransportCreation() {
        var output = new PrintStream(new ByteArrayOutputStream());
        int exit = AiToolLiveAcceptanceCheck.execute(
                new String[] { "--run", "test/model" }, Map.of(),
                () -> { throw new AssertionError("Blocked run created Transport."); },
                output);
        assertEquals(2, exit);
    }

    @Test
    void runEntryUsesInjectedSimulation() {
        var transport = new AiChatToolIntegrationTest.FakeTransport();
        var bytes = new ByteArrayOutputStream();
        var output = new PrintStream(bytes, true, StandardCharsets.UTF_8);
        int exit = AiToolLiveAcceptanceCheck.execute(
                new String[] { "--run", "test/model" },
                Map.of("AI_RUN_TOOL_LIVE_ACCEPTANCE", "true",
                        "AI_TOOL_LIVE_API_KEY", "fake-key"),
                () -> transport, output);
        assertEquals(0, exit);
        assertEquals(2, transport.requests.size());
        assertTrue(bytes.toString(StandardCharsets.UTF_8)
                .contains("PASS: modelRequests=2, toolExecutions=1."));
    }

    @Test
    void invalidArgumentsDoNotCreateTransportOrLeakInput() {
        var outputBytes = new ByteArrayOutputStream();
        var output = new PrintStream(outputBytes, true, StandardCharsets.UTF_8);
        for (var args : new String[][] {
                null, {}, { "--run" }, { "--run", "test/model", "extra" },
                { "--unknown", "test/model" },
                { "--prepare", "invalid\nSECRET" },
                { "--run", "invalid\nSECRET" } }) {
            int exit = AiToolLiveAcceptanceCheck.execute(args,
                    Map.of("AI_RUN_TOOL_LIVE_ACCEPTANCE", "true",
                            "AI_TOOL_LIVE_API_KEY", "fake-key"),
                    () -> { throw new AssertionError("Invalid arguments created Transport."); },
                    output);
            assertNotEquals(0, exit);
        }
        String text = outputBytes.toString(StandardCharsets.UTF_8);
        assertFalse(text.contains("SECRET"));
        assertFalse(text.contains("fake-key"));
    }

    @Test
    void calculatorVerifiesDecimalOperandsAndResult() {
        var budget = new AiToolLiveAcceptanceCheck.Budget(request -> {
            throw new AssertionError("No model request expected.");
        });
        var result = budget.calculator().execute(Map.of(
                "operation", "add",
                "a", new java.math.BigDecimal("2.0"),
                "b", new java.math.BigDecimal("3.00")));
        assertTrue(AiToolLiveAcceptanceCheck.sameNumber(result.get("result"), "5"));
        assertFalse(AiToolLiveAcceptanceCheck.sameNumber("5", "5"));
        assertFalse(AiToolLiveAcceptanceCheck.sameNumber(Double.NaN, "5"));
        assertFalse(AiToolLiveAcceptanceCheck.sameNumber(15, "5"));
        assertTrue(budget.calculatorVerified());
        assertEquals(1, budget.toolExecutions());
        assertEquals(0, budget.modelRequests());
    }

    @Test
    void wrongCalculationIsRejectedBeforeExecution() throws Exception {
        var json = new tools.jackson.databind.ObjectMapper();
        for (var arguments : java.util.List.of(
                Map.<String, Object>of("operation", "multiply", "a", 2, "b", 3),
                Map.<String, Object>of("operation", "add", "a", 3, "b", 2),
                Map.<String, Object>of("operation", "add", "a", 2, "b", 4))) {
            var transport = new AiChatToolIntegrationTest.FakeTransport();
            transport.firstResponseOverride = json.writeValueAsString(Map.of(
                    "choices", java.util.List.of(Map.of(
                            "finish_reason", "tool_calls",
                            "message", Map.of("role", "assistant",
                                    "tool_calls", java.util.List.of(Map.of(
                                            "id", "call_wrong", "type", "function",
                                            "function", Map.of(
                                                    "name", "calc_run",
                                                    "arguments", json.writeValueAsString(arguments)))))))));
            var budget = new AiToolLiveAcceptanceCheck.Budget(transport);
            assertThrows(IllegalArgumentException.class,
                    () -> budget.calculator().execute(arguments));
            assertThrows(AiToolConversationService.Failure.class,
                    () -> AiToolLiveAcceptanceCheck.runWithTransport(
                            "test/model", "fake-key", budget));
            assertEquals(1, budget.modelRequests());
            assertEquals(1, transport.requests.size());
            assertEquals(0, budget.toolExecutions());
            assertFalse(budget.calculatorVerified());
        }
    }

    @Test
    void directAnswerWithoutCalculatorDoesNotPass() {
        var budget = new AiToolLiveAcceptanceCheck.Budget(request ->
                new AiChatService.ChatHttpResult(200, """
                        {"choices":[{"finish_reason":"stop",
                        "message":{"role":"assistant","content":"5"}}]}
                        """));
        assertThrows(IllegalStateException.class,
                () -> AiToolLiveAcceptanceCheck.runWithTransport(
                        "test/model", "fake-key", budget));
        assertEquals(1, budget.modelRequests());
        assertEquals(0, budget.toolExecutions());
        assertFalse(budget.calculatorVerified());
    }

    @Test
    void wrongFinalAnswerDoesNotPass() {
        for (String answer : java.util.List.of("15", "50", "The answer is not 5.")) {
            var firstRound = new AiChatToolIntegrationTest.FakeTransport();
            var sends = new AtomicInteger();
            var budget = new AiToolLiveAcceptanceCheck.Budget(request -> {
                if (sends.incrementAndGet() == 1) {
                    return firstRound.send(request);
                }
                return new AiChatService.ChatHttpResult(200,
                        "{\"choices\":[{\"finish_reason\":\"stop\","
                                + "\"message\":{\"role\":\"assistant\",\"content\":\""
                                + answer + "\"}}]}");
            });
            assertThrows(IllegalStateException.class,
                    () -> AiToolLiveAcceptanceCheck.runWithTransport(
                            "test/model", "fake-key", budget));
            assertTrue(budget.calculatorVerified());
            assertEquals(2, budget.modelRequests());
            assertEquals(2, sends.get());
            assertEquals(1, budget.toolExecutions());
        }
    }

    @Test
    void diagnosticsShowHttpStatusWithoutUpstreamBody() {
        for (int status : new int[] { 400, 401, 402, 429, 500, 502 }) {
            var calls = new AtomicInteger();
            var bytes = new ByteArrayOutputStream();
            var output = new PrintStream(bytes, true, StandardCharsets.UTF_8);
            int exit = AiToolLiveAcceptanceCheck.runOptIn("test/model",
                    Map.of("AI_RUN_TOOL_LIVE_ACCEPTANCE", "true",
                            "AI_TOOL_LIVE_API_KEY", "fake-secret-key"),
                    () -> request -> {
                        calls.incrementAndGet();
                        return new AiChatService.ChatHttpResult(
                                status, "SECRET upstream response fake-secret-key");
                    }, output);
            String text = bytes.toString(StandardCharsets.UTF_8);
            assertEquals(1, exit);
            assertEquals(1, calls.get());
            assertTrue(text.contains("modelRequests=1, toolExecutions=0"));
            assertTrue(text.contains("httpStatus=" + status + ", code=upstream_http_error"));
            assertFalse(text.contains("SECRET"));
            assertFalse(text.contains("fake-secret-key"));
        }
        assertEquals("acceptance_failed", AiToolLiveAcceptanceCheck.safeFailureCode(
                new AiToolConversationService.Failure("SECRET-code", "SECRET-message")));
        assertEquals("acceptance_failed", AiToolLiveAcceptanceCheck.safeFailureCode(
                new IllegalStateException("SECRET-exception")));
    }

    @Test
    void diagnosticsDistinguishInvalidResponseFromHttpFailure() {
        var bytes = new ByteArrayOutputStream();
        var output = new PrintStream(bytes, true, StandardCharsets.UTF_8);
        int exit = AiToolLiveAcceptanceCheck.runOptIn("test/model",
                Map.of("AI_RUN_TOOL_LIVE_ACCEPTANCE", "true",
                        "AI_TOOL_LIVE_API_KEY", "fake-key"),
                () -> request -> new AiChatService.ChatHttpResult(
                        200, "SECRET invalid JSON"), output);
        String text = bytes.toString(StandardCharsets.UTF_8);
        assertEquals(1, exit);
        assertTrue(text.contains("httpStatus=200, code=invalid_tool_flow"));
        assertFalse(text.contains("SECRET"));
        assertFalse(text.contains("fake-key"));
    }

    @Test
    void secondRoundNetworkFailureDoesNotReuseFirstStatus() {
        var firstRound = new AiChatToolIntegrationTest.FakeTransport();
        var sends = new AtomicInteger();
        var bytes = new ByteArrayOutputStream();
        var output = new PrintStream(bytes, true, StandardCharsets.UTF_8);
        int exit = AiToolLiveAcceptanceCheck.runOptIn("test/model",
                Map.of("AI_RUN_TOOL_LIVE_ACCEPTANCE", "true",
                        "AI_TOOL_LIVE_API_KEY", "fake-key"),
                () -> request -> {
                    if (sends.incrementAndGet() == 1) {
                        return firstRound.send(request);
                    }
                    throw new java.io.IOException("SECRET connection details fake-key");
                }, output);
        String text = bytes.toString(StandardCharsets.UTF_8);
        assertEquals(1, exit);
        assertEquals(2, sends.get());
        assertTrue(text.contains("modelRequests=2, toolExecutions=1"));
        assertTrue(text.contains("httpStatus=none, code=transport_failed"));
        assertFalse(text.contains("httpStatus=200"));
        assertFalse(text.contains("SECRET"));
        assertFalse(text.contains("fake-key"));
    }
}
