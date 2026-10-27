package com.aiosnova.ai.chat;

import com.aiosnova.ai.tool.AiToolDefinition;
import com.aiosnova.ai.tool.AiToolHandler;
import com.aiosnova.ai.tool.AiToolRegistry;
import com.aiosnova.ai.tool.builtin.CalculatorTool;

import java.io.IOException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

class AiToolConversationServiceTest {

    private static final String FAKE_KEY = "fake-tool-flow-key";

    private final JsonMapper json = JsonMapper.builder().build();

    private static final class FakeTransport
            implements AiChatService.ChatTransport {

        final List<HttpRequest> requests = new ArrayList<>();
        final List<AiChatService.ChatHttpResult> responses;

        FakeTransport(AiChatService.ChatHttpResult... responses) {
            this.responses = List.of(responses);
        }

        @Override
        public AiChatService.ChatHttpResult send(HttpRequest request) {
            requests.add(request);

            if (requests.size() > responses.size()) {
                throw new AssertionError("Unexpected extra request.");
            }

            return responses.get(requests.size() - 1);
        }
    }

    private static final class CountingCalculator
            implements AiToolHandler {

        private final CalculatorTool calculator = new CalculatorTool();
        private final boolean fail;
        int executions;

        CountingCalculator(boolean fail) {
            this.fail = fail;
        }

        @Override
        public AiToolDefinition definition() {
            return calculator.definition();
        }

        @Override
        public void validateArguments(Map<String, Object> arguments) {
            calculator.validateArguments(arguments);
        }

        @Override
        public Map<String, Object> execute(Map<String, Object> arguments) {
            executions++;

            if (fail) {
                throw new IllegalStateException(
                        "SECRET_INTERNAL_EXECUTION_DETAILS");
            }

            return calculator.execute(arguments);
        }
    }

    private AiToolConversationService service(
            AiChatService.ChatTransport transport,
            CountingCalculator calculator) {

        return new AiToolConversationService(
                transport,
                new AiToolRegistry(List.of(
                        new AiToolRegistry.Registration(
                                "calculator", calculator))));
    }

    private List<Map<String, Object>> messages() {
        return List.of(Map.of(
                "role", "user",
                "content", "Calculate 2 + 3."));
    }

    private String run(AiToolConversationService service) {
        return service.chat(
                "test/model",
                messages(),
                0.3,
                FAKE_KEY,
                Set.of("calc_run"));
    }

    private String toolResponse(String name, String operation, int b) {
        String arguments = json.writeValueAsString(
                Map.of("operation", operation, "a", 2, "b", b));

        return json.writeValueAsString(
                Map.of("choices", List.of(
                        Map.of(
                                "finish_reason", "tool_calls",
                                "message", Map.of(
                                        "role", "assistant",
                                        "tool_calls", List.of(
                                                Map.of(
                                                        "id", "call_add",
                                                        "type", "function",
                                                        "function", Map.of(
                                                                "name", name,
                                                                "arguments",
                                                                arguments))))))));
    }

    private String finalResponse() {
        return json.writeValueAsString(
                Map.of("choices", List.of(
                        Map.of(
                                "finish_reason", "stop",
                                "message", Map.of(
                                        "role", "assistant",
                                        "content", "The answer is 5.")))));
    }

    private AiChatService.ChatHttpResult ok(String body) {
        return new AiChatService.ChatHttpResult(200, body);
    }

    @Test
    void executesCalculatorAndGetsFinalAnswer() throws Exception {
        String firstBody = toolResponse("calc_run", "add", 3);

        var transport = new FakeTransport(
                ok(firstBody), ok(finalResponse()));
        var calculator = new CountingCalculator(false);

        assertEquals(
                "The answer is 5.",
                run(service(transport, calculator)));

        assertEquals(2, transport.requests.size());
        assertEquals(1, calculator.executions);

        var first = json.readTree(readBody(transport.requests.get(0)));
        var second = json.readTree(readBody(transport.requests.get(1)));

        assertEquals("auto", first.path("tool_choice").asString());
        assertEquals("none", second.path("tool_choice").asString());
        assertEquals(first.path("model"), second.path("model"));
        assertEquals(first.path("tools"), second.path("tools"));

        var sentMessages = second.path("messages");

        assertEquals(3, sentMessages.size());
        assertEquals(first.path("messages").get(0), sentMessages.get(0));

        assertEquals(
                json.readTree(firstBody).path("choices")
                        .get(0).path("message").path("tool_calls"),
                sentMessages.get(1).path("tool_calls"));

        assertEquals("tool", sentMessages.get(2).path("role").asString());
        assertEquals(
                "call_add",
                sentMessages.get(2).path("tool_call_id").asString());

        var payload = json.readTree(
                sentMessages.get(2).path("content").asString());

        assertTrue(payload.path("ok").asBoolean());
        assertEquals(5, payload.path("output").path("result").asInt());
    }

    @Test
    void directAnswerUsesOnlyOneRequest() {
        var transport = new FakeTransport(ok(finalResponse()));
        var calculator = new CountingCalculator(false);

        assertEquals(
                "The answer is 5.",
                run(service(transport, calculator)));

        assertEquals(1, transport.requests.size());
        assertEquals(0, calculator.executions);
    }

    @Test
    void toolFailureStopsBeforeSecondRequest() {
        var transport = new FakeTransport(
                ok(toolResponse("calc_run", "add", 3)));
        var calculator = new CountingCalculator(true);

        var error = assertThrows(
                AiToolConversationService.Failure.class,
                () -> run(service(transport, calculator)));

        assertEquals("tool_execution_failed", error.code());
        assertFalse(error.getMessage().contains("SECRET"));
        assertEquals(1, transport.requests.size());
        assertEquals(1, calculator.executions);
    }

    @Test
    void invalidArgumentsStopWithoutExecution() {
        var transport = new FakeTransport(
                ok(toolResponse("calc_run", "divide", 0)));
        var calculator = new CountingCalculator(false);

        assertThrows(
                AiToolConversationService.Failure.class,
                () -> run(service(transport, calculator)));

        assertEquals(1, transport.requests.size());
        assertEquals(0, calculator.executions);
    }

    @Test
    void unknownToolStopsWithoutExecution() {
        var transport = new FakeTransport(
                ok(toolResponse("unknown_tool", "add", 3)));
        var calculator = new CountingCalculator(false);

        assertThrows(
                AiToolConversationService.Failure.class,
                () -> run(service(transport, calculator)));

        assertEquals(1, transport.requests.size());
        assertEquals(0, calculator.executions);
    }

    @Test
    void httpFailureIsNotRetried() {
        var transport = new FakeTransport(
                new AiChatService.ChatHttpResult(
                        503, "SECRET_UPSTREAM_BODY"));
        var calculator = new CountingCalculator(false);

        var error = assertThrows(
                AiToolConversationService.Failure.class,
                () -> run(service(transport, calculator)));

        assertEquals("upstream_http_error", error.code());
        assertFalse(error.getMessage().contains("SECRET"));
        assertEquals(1, transport.requests.size());
        assertEquals(0, calculator.executions);
    }

    @Test
    void secondHttpFailureIsNotRetried() {
        var transport = new FakeTransport(
                ok(toolResponse("calc_run", "add", 3)),
                new AiChatService.ChatHttpResult(503, "Unavailable"));
        var calculator = new CountingCalculator(false);

        assertThrows(
                AiToolConversationService.Failure.class,
                () -> run(service(transport, calculator)));

        assertEquals(2, transport.requests.size());
        assertEquals(1, calculator.executions);
    }

    @Test
    void secondToolCallDoesNotStartThirdRound() {
        String body = toolResponse("calc_run", "add", 3);
        var transport = new FakeTransport(ok(body), ok(body));
        var calculator = new CountingCalculator(false);

        var error = assertThrows(
                AiToolConversationService.Failure.class,
                () -> run(service(transport, calculator)));

        assertEquals("tool_round_limit", error.code());
        assertEquals(2, transport.requests.size());
        assertEquals(1, calculator.executions);
    }

    @Test
    void transportFailureIsNotRetried() {
        int[] attempts = {0};

        AiChatService.ChatTransport transport = request -> {
            attempts[0]++;
            throw new IOException("SECRET_CONNECTION_DETAILS");
        };

        var calculator = new CountingCalculator(false);

        var error = assertThrows(
                AiToolConversationService.Failure.class,
                () -> run(service(transport, calculator)));

        assertEquals("transport_failed", error.code());
        assertFalse(error.getMessage().contains("SECRET"));
        assertEquals(1, attempts[0]);
        assertEquals(0, calculator.executions);
    }

    private static String readBody(HttpRequest request) throws Exception {
        var subscriber = HttpResponse.BodySubscribers.ofString(
                StandardCharsets.UTF_8);

        request.bodyPublisher().orElseThrow().subscribe(
                new Flow.Subscriber<ByteBuffer>() {
                    @Override
                    public void onSubscribe(Flow.Subscription subscription) {
                        subscriber.onSubscribe(subscription);
                    }

                    @Override
                    public void onNext(ByteBuffer item) {
                        subscriber.onNext(List.of(item));
                    }

                    @Override
                    public void onError(Throwable error) {
                        subscriber.onError(error);
                    }

                    @Override
                    public void onComplete() {
                        subscriber.onComplete();
                    }
                });

        return subscriber.getBody().toCompletableFuture()
                .get(2, TimeUnit.SECONDS);
    }
}
