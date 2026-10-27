package com.aiosnova.ai.chat;

import com.aiosnova.ai.tool.AiToolDefinition;
import com.aiosnova.ai.tool.AiToolHandler;
import com.aiosnova.ai.tool.AiToolRegistry;
import com.aiosnova.ai.tool.builtin.CalculatorTool;
import com.aiosnova.ai.tool.AiToolCallExecutor;
import com.aiosnova.ai.tool.AiToolCallParser;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayOutputStream;
import java.net.http.HttpRequest;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.Set;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;

class AiChatToolRequestTest {

        private static final String FAKE_KEY = "fake-request-test-key";

        private final AiChatRequestBuilder builder = new AiChatRequestBuilder();

        private final ObjectMapper json = new ObjectMapper();

        private static class CapturingTransport
                        implements AiChatService.ChatTransport {

                HttpRequest captured;
                int calls;

                @Override
                public AiChatService.ChatHttpResult send(
                                HttpRequest request) {

                        captured = request;
                        calls++;

                        return new AiChatService.ChatHttpResult(
                                        200,
                                        """
                                                        {
                                                          "choices": [
                                                            {
                                                              "message": {
                                                                "content": "Mock response"
                                                              }
                                                            }
                                                          ]
                                                        }
                                                        """);
                }
        }

        private List<Map<String, Object>> messages() {
                return List.of(
                                Map.of(
                                                "role", "user",
                                                "content", "计算 2 加 3"));
        }

        private AiToolRegistry calculatorRegistry() {
                return new AiToolRegistry(List.of(
                                new AiToolRegistry.Registration(
                                                "calculator",
                                                new CalculatorTool())));
        }

        @Test
        void ordinaryChatRequestStillHasNoTools()
                        throws Exception {

                var transport = new CapturingTransport();

                transport.send(builder.build(
                                "test/model",
                                messages(),
                                0.3,
                                FAKE_KEY));

                var root = json.readTree(
                                readBody(transport.captured));

                assertEquals(1, transport.calls);
                assertFalse(root.has("tools"));
                assertFalse(root.has("tool_choice"));

                assertEquals("test/model", root.path("model").asString());
                assertEquals(0.3, root.path("temperature").asDouble());
                assertEquals(2048, root.path("max_tokens").asInt());
                assertFalse(root.path("stream").asBoolean());

                assertEquals(
                                "计算 2 加 3",
                                root.path("messages")
                                                .get(0)
                                                .path("content")
                                                .asString());
        }

        @Test
        void capturesToolDefinitionsInActualHttpRequest()
                        throws Exception {

                var transport = new CapturingTransport();

                transport.send(builder.buildWithToolDefinitions(
                                "test/model",
                                messages(),
                                null,
                                FAKE_KEY,
                                calculatorRegistry()));

                HttpRequest request = transport.captured;

                assertEquals(1, transport.calls);
                assertEquals("POST", request.method());

                assertEquals(
                                "https://openrouter.ai/api/v1/chat/completions",
                                request.uri().toString());

                assertEquals(
                                Duration.ofSeconds(60),
                                request.timeout().orElseThrow());

                assertEquals(
                                "Bearer " + FAKE_KEY,
                                request.headers()
                                                .firstValue("Authorization")
                                                .orElseThrow());

                assertEquals(
                                "application/json",
                                request.headers()
                                                .firstValue("Content-Type")
                                                .orElseThrow());

                String body = readBody(request);
                var root = json.readTree(body);

                assertFalse(body.contains(FAKE_KEY));
                assertFalse(root.has("temperature"));
                assertEquals("none", root.path("tool_choice").asString());
                assertFalse(root.path("stream").asBoolean());

                var tools = root.path("tools");

                assertEquals(1, tools.size());
                assertEquals("function", tools.get(0).path("type").asString());

                var function = tools.get(0).path("function");

                assertEquals("calc_run", function.path("name").asString());
                assertFalse(function.path("description").asString().isBlank());

                var parameters = function.path("parameters");

                assertEquals("object", parameters.path("type").asString());
                assertEquals(
                                "number",
                                parameters.path("properties")
                                                .path("a")
                                                .path("type")
                                                .asString());

                assertEquals(3, parameters.path("required").size());
                assertFalse(parameters.path("additionalProperties").asBoolean());

                assertFalse(function.has("action"));
                assertFalse(function.has("executorType"));
                assertFalse(function.has("handler"));
        }

        @Test
        void requestConstructionAndTransportNeverExecuteTool()
                        throws Exception {

                int[] executions = { 0 };

                AiToolHandler handler = new AiToolHandler() {

                        @Override
                        public AiToolDefinition definition() {
                                return new AiToolDefinition(
                                                "test.run",
                                                "test_run",
                                                "Test-only definition.",
                                                Map.of("type", "object"));
                        }

                        @Override
                        public void validateArguments(Map<String, Object> arguments) {
                                if (arguments == null) {
                                        throw new IllegalArgumentException("Tool arguments are required.");
                                }
                        }

                        @Override
                        public Map<String, Object> execute(
                                        Map<String, Object> arguments) {

                                executions[0]++;
                                throw new AssertionError(
                                                "Tools must not execute in this test.");
                        }
                };

                var registry = new AiToolRegistry(List.of(
                                new AiToolRegistry.Registration(
                                                "test",
                                                handler)));

                var transport = new CapturingTransport();

                transport.send(builder.buildWithToolDefinitions(
                                "test/model",
                                messages(),
                                null,
                                FAKE_KEY,
                                registry));

                var root = json.readTree(
                                readBody(transport.captured));

                assertEquals(1, transport.calls);
                assertEquals("none", root.path("tool_choice").asString());
                assertEquals(0, executions[0]);
        }

        @Test
        void emptyRegistryOmitsToolParameters()
                        throws Exception {

                var request = builder.buildWithToolDefinitions(
                                "test/model",
                                messages(),
                                null,
                                FAKE_KEY,
                                new AiToolRegistry(List.of()));

                var root = json.readTree(readBody(request));

                assertFalse(root.has("tools"));
                assertFalse(root.has("tool_choice"));
        }

        @Test
        void rejectsMissingRegistry() {
                assertThrows(
                                IllegalArgumentException.class,
                                () -> builder.buildWithToolDefinitions(
                                                "test/model",
                                                messages(),
                                                null,
                                                FAKE_KEY,
                                                null));
        }

        private String simulatedToolResponse() {
                String arguments = json.writeValueAsString(
                                Map.of(
                                                "operation", "add",
                                                "a", 2,
                                                "b", 3));

                return json.writeValueAsString(
                                Map.of(
                                                "choices", List.of(
                                                                Map.of(
                                                                                "finish_reason", "tool_calls",
                                                                                "message", Map.of(
                                                                                                "role", "assistant",
                                                                                                "content",
                                                                                                "I will calculate it.",
                                                                                                "tool_calls", List.of(
                                                                                                                Map.of(
                                                                                                                                "id",
                                                                                                                                "call_add",
                                                                                                                                "type",
                                                                                                                                "function",
                                                                                                                                "function",
                                                                                                                                Map.of(
                                                                                                                                                "name",
                                                                                                                                                "calc_run",
                                                                                                                                                "arguments",
                                                                                                                                                arguments))))))));
        }

        @Test
        void capturesFollowUpRequestWithToolResult() throws Exception {
                var registry = calculatorRegistry();
                String firstResponse = simulatedToolResponse();

                var calls = new AiToolCallParser().parse(firstResponse);
                var results = new AiToolCallExecutor(registry).execute(
                                calls, Set.of("calc_run"));

                var transport = new CapturingTransport();

                transport.send(builder.buildAfterToolExecution(
                                "test/model",
                                messages(),
                                0.3,
                                FAKE_KEY,
                                registry,
                                firstResponse,
                                results));

                assertEquals(1, transport.calls);

                var request = transport.captured;
                String body = readBody(request);
                var root = json.readTree(body);

                assertEquals("POST", request.method());
                assertEquals(
                                "https://openrouter.ai/api/v1/chat/completions",
                                request.uri().toString());
                assertEquals(
                                "Bearer " + FAKE_KEY,
                                request.headers().firstValue("Authorization").orElseThrow());
                assertFalse(body.contains(FAKE_KEY));

                assertEquals("test/model", root.path("model").asString());
                assertEquals(0.3, root.path("temperature").asDouble());
                assertFalse(root.path("stream").asBoolean());
                assertEquals(2048, root.path("max_tokens").asInt());

                // Final answer only: no further tool selection.
                assertEquals("none", root.path("tool_choice").asString());
                assertEquals(1, root.path("tools").size());

                var sentMessages = root.path("messages");

                assertEquals(3, sentMessages.size());

                assertEquals(
                                "user",
                                sentMessages.get(0).path("role").asString());
                assertEquals(
                                "计算 2 加 3",
                                sentMessages.get(0).path("content").asString());

                var assistant = sentMessages.get(1);

                assertEquals("assistant", assistant.path("role").asString());
                assertEquals(
                                "I will calculate it.",
                                assistant.path("content").asString());

                assertEquals(
                                json.readTree(firstResponse).path("choices")
                                                .get(0).path("message").path("tool_calls"),
                                assistant.path("tool_calls"));

                var tool = sentMessages.get(2);

                assertEquals("tool", tool.path("role").asString());
                assertEquals(
                                "call_add",
                                tool.path("tool_call_id").asString());
                assertTrue(tool.path("content").isString());

                var output = json.readTree(tool.path("content").asString());

                assertTrue(output.path("ok").asBoolean());
                assertEquals(
                                5,
                                output.path("output").path("result").asInt());

                // Existing fake transport returns a simulated final answer.
                // No actual HTTP connection or paid model call is made.
        }

        @Test
        void executionFailureSendsNoFollowUpRequest() {
                var registry = calculatorRegistry();
                var transport = new CapturingTransport();

                var failure = new AiToolCallExecutor.Result(
                                "call_add",
                                "calc_run",
                                null,
                                new AiToolCallExecutor.Failure(
                                                "tool_execution_failed",
                                                "Tool execution failed."));

                assertThrows(
                                IllegalArgumentException.class,
                                () -> transport.send(
                                                builder.buildAfterToolExecution(
                                                                "test/model",
                                                                messages(),
                                                                null,
                                                                FAKE_KEY,
                                                                registry,
                                                                simulatedToolResponse(),
                                                                List.of(failure))));

                assertEquals(0, transport.calls);
                assertNull(transport.captured);
        }

        @Test
        void mismatchedResultSendsNoFollowUpRequest() {
                var transport = new CapturingTransport();

                var wrongResult = new AiToolCallExecutor.Result(
                                "different_call_id",
                                "calc_run",
                                Map.of("result", 5),
                                null);

                assertThrows(
                                IllegalArgumentException.class,
                                () -> transport.send(
                                                builder.buildAfterToolExecution(
                                                                "test/model",
                                                                messages(),
                                                                null,
                                                                FAKE_KEY,
                                                                calculatorRegistry(),
                                                                simulatedToolResponse(),
                                                                List.of(wrongResult))));

                assertEquals(0, transport.calls);
                assertNull(transport.captured);
        }

        private static String readBody(
                        HttpRequest request) throws Exception {

                var result = new CompletableFuture<String>();
                var bytes = new ByteArrayOutputStream();

                request.bodyPublisher()
                                .orElseThrow()
                                .subscribe(new Flow.Subscriber<ByteBuffer>() {

                                        @Override
                                        public void onSubscribe(
                                                        Flow.Subscription subscription) {

                                                subscription.request(Long.MAX_VALUE);
                                        }

                                        @Override
                                        public void onNext(ByteBuffer buffer) {
                                                byte[] chunk = new byte[buffer.remaining()];
                                                buffer.get(chunk);
                                                bytes.writeBytes(chunk);
                                        }

                                        @Override
                                        public void onError(Throwable error) {
                                                result.completeExceptionally(error);
                                        }

                                        @Override
                                        public void onComplete() {
                                                result.complete(
                                                                bytes.toString(StandardCharsets.UTF_8));
                                        }
                                });

                return result.get(2, TimeUnit.SECONDS);
        }
}
