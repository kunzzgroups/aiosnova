package com.aiosnova.ai.chat;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;

import tools.jackson.databind.ObjectMapper;

import com.sun.net.httpserver.HttpServer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class AiChatHttpTransportTest {

    @Test
    void defaultTransportSendsRequestToLocalSimulatedUpstream()
            throws Exception {

        var requests = new AtomicInteger();
        var capturedBody = new AtomicReference<String>();
        var capturedAuthorization = new AtomicReference<String>();

        var server = HttpServer.create(
                new InetSocketAddress("127.0.0.1", 0), 0);

        server.createContext("/chat/completions", exchange -> {
            try {
                requests.incrementAndGet();

                capturedAuthorization.set(
                        exchange.getRequestHeaders()
                                .getFirst("Authorization"));

                capturedBody.set(new String(
                        exchange.getRequestBody().readAllBytes(),
                        StandardCharsets.UTF_8));

                byte[] response = """
                        {
                          "choices": [{
                            "finish_reason": "stop",
                            "message": {
                              "role": "assistant",
                              "content": "Local simulation OK."
                            }
                          }]
                        }
                        """.getBytes(StandardCharsets.UTF_8);

                exchange.getResponseHeaders().set(
                        "Content-Type",
                        "application/json;charset=UTF-8");

                exchange.sendResponseHeaders(200, response.length);
                exchange.getResponseBody().write(response);
            } finally {
                exchange.close();
            }
        });

        try {
            server.start();

            var endpoint = URI.create(
                    "http://127.0.0.1:"
                            + server.getAddress().getPort()
                            + "/chat/completions");

            var request = HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer fake-test-key")
                    .POST(HttpRequest.BodyPublishers.ofString(
                            """
                                    {
                                      "model": "test/model",
                                      "stream": false,
                                      "messages": [{
                                        "role": "user",
                                        "content": "Hello"
                                      }]
                                    }
                                    """,
                            StandardCharsets.UTF_8))
                    .build();

            var response = AiChatService.defaultTransport().send(request);

            assertEquals(200, response.statusCode());
            assertTrue(response.body().contains("Local simulation OK."));

            assertEquals(1, requests.get());
            assertEquals(
                    "Bearer fake-test-key",
                    capturedAuthorization.get());

            var body = new tools.jackson.databind.ObjectMapper()
                    .readTree(capturedBody.get());

            assertEquals(
                    "test/model",
                    body.path("model").asString());

            assertFalse(body.path("stream").asBoolean());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void twoRoundToolFlowUsesLocalHttpUpstream() throws Exception {
        var capturedBodies = Collections.synchronizedList(new ArrayList<String>());

        var requests = new AtomicInteger();
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var json = new ObjectMapper();

        var server = HttpServer.create(
                new InetSocketAddress("127.0.0.1", 0), 0);

        String firstResponse = """
                {
                  "choices": [{
                    "finish_reason": "tool_calls",
                    "message": {
                      "role": "assistant",
                      "content": null,
                      "tool_calls": [{
                        "id": "call_local_add",
                        "type": "function",
                        "function": {
                          "name": "calc_run",
                          "arguments": "{\\"operation\\":\\"add\\",\\"a\\":2,\\"b\\":3}"
                        }
                      }]
                    }
                  }]
                }
                """;

        String finalResponse = """
                {
                  "choices": [{
                    "finish_reason": "stop",
                    "message": {
                      "role": "assistant",
                      "content": "The answer is 5."
                    }
                  }]
                }
                """;

        server.createContext("/chat/completions", exchange -> {
            try {
                capturedBodies.add(new String(
                        exchange.getRequestBody().readAllBytes(),
                        StandardCharsets.UTF_8));

                int number = requests.incrementAndGet();

                int status = number <= 2 ? 200 : 500;
                String body = number == 1
                        ? firstResponse
                        : number == 2
                                ? finalResponse
                                : "{\"error\":\"Unexpected extra request\"}";

                byte[] response = body.getBytes(StandardCharsets.UTF_8);

                exchange.getResponseHeaders().set(
                        "Content-Type",
                        "application/json;charset=UTF-8");

                exchange.sendResponseHeaders(status, response.length);
                exchange.getResponseBody().write(response);
            } finally {
                exchange.close();
            }
        });

        try {
            server.start();

            var endpoint = URI.create(
                    "http://127.0.0.1:"
                            + server.getAddress().getPort()
                            + "/chat/completions");

            var realTransport = AiChatService.defaultTransport();

            AiChatService.ChatTransport localTransport = original -> {
                // 检查业务构建器生成的原始目标，但绝不向它发送。
                assertEquals(
                        URI.create(
                                "https://openrouter.ai/api/v1/chat/completions"),
                        original.uri());

                assertEquals("POST", original.method());

                assertEquals(
                        "Bearer fake-test-key",
                        original.headers()
                                .firstValue("Authorization")
                                .orElseThrow());

                // 仅在测试中替换 URI，复用原请求的 body publisher。
                var localRequest = HttpRequest.newBuilder(endpoint)
                        .timeout(Duration.ofSeconds(5))
                        .header("Content-Type", "application/json")
                        .header("Authorization", "Bearer fake-test-key")
                        .POST(original.bodyPublisher().orElseThrow())
                        .build();

                return realTransport.send(localRequest);
            };

            var conversation = new AiToolConversationService(
                    localTransport,
                    fixture.registry);

            List<Map<String, Object>> messages = List.of(
                    Map.of(
                            "role", "user",
                            "content", "Calculate 2 + 3."));

            String reply = conversation.chatWithParameters(
                    "test/model",
                    messages,
                    new AiToolRequestParameters(0.4, 0.75, 512),
                    "fake-test-key",
                    Set.of("calc_run"));

            assertEquals("The answer is 5.", reply);
            assertEquals(2, requests.get());
            assertEquals(2, capturedBodies.size());
            assertEquals(1, fixture.calculator.executions);

            var first = json.readTree(capturedBodies.get(0));
            var second = json.readTree(capturedBodies.get(1));

            // 两轮模型与参数一致。
            for (var body : List.of(first, second)) {
                assertEquals("test/model", body.path("model").asString());
                assertFalse(body.path("stream").asBoolean());
                assertEquals(0.4, body.path("temperature").asDouble());
                assertEquals(0.75, body.path("top_p").asDouble());
                assertEquals(512, body.path("max_tokens").asInt());
            }

            // 第一轮提供 Calculator 定义并允许选择工具。
            assertEquals("auto", first.path("tool_choice").asString());
            assertEquals(1, first.path("tools").size());

            var definition = first.path("tools").get(0);
            assertEquals("function", definition.path("type").asString());
            assertEquals(
                    "calc_run",
                    definition.path("function").path("name").asString());

            assertEquals(
                    "object",
                    definition.path("function")
                            .path("parameters").path("type").asString());

            // 第二轮保留工具定义，但不允许继续选工具。
            assertEquals("none", second.path("tool_choice").asString());
            assertEquals(first.path("tools"), second.path("tools"));

            var originalMessages = first.path("messages");
            var followUpMessages = second.path("messages");

            assertEquals(1, originalMessages.size());
            assertEquals(3, followUpMessages.size());
            assertEquals(
                    originalMessages.get(0),
                    followUpMessages.get(0));

            // assistant 消息保留模型返回的 tool_calls。
            var assistant = followUpMessages.get(1);
            assertEquals("assistant", assistant.path("role").asString());

            var expectedAssistant = json.readTree(firstResponse)
                    .path("choices").get(0).path("message");

            assertEquals(
                    expectedAssistant.path("tool_calls"),
                    assistant.path("tool_calls"));

            // tool 消息通过同一个 ID 对应原工具调用。
            var toolMessage = followUpMessages.get(2);
            assertEquals("tool", toolMessage.path("role").asString());
            assertEquals(
                    "call_local_add",
                    toolMessage.path("tool_call_id").asString());

            var result = json.readTree(
                    toolMessage.path("content").asString());

            assertTrue(result.path("ok").asBoolean());
            assertEquals(
                    5.0,
                    result.path("output").path("result").asDouble());

        } finally {
            server.stop(0);
        }
    }

    @Test
    void firstRoundHttpFailureStopsWithoutToolExecutionOrRetry()
            throws Exception {

        var requests = new AtomicInteger();
        var fixture = new AiChatToolIntegrationTest.Fixture();

        var server = HttpServer.create(
                new InetSocketAddress("127.0.0.1", 0), 0);

        server.createContext("/chat/completions", exchange -> {
            try {
                requests.incrementAndGet();

                exchange.getRequestBody().readAllBytes();

                byte[] response = """
                        {
                          "error": {
                            "message": "SECRET_UPSTREAM_FAILURE_DETAILS"
                          }
                        }
                        """.getBytes(StandardCharsets.UTF_8);

                exchange.getResponseHeaders().set(
                        "Content-Type",
                        "application/json;charset=UTF-8");

                exchange.sendResponseHeaders(500, response.length);
                exchange.getResponseBody().write(response);
            } finally {
                exchange.close();
            }
        });

        try {
            server.start();

            var endpoint = URI.create(
                    "http://127.0.0.1:"
                            + server.getAddress().getPort()
                            + "/chat/completions");

            var realTransport = AiChatService.defaultTransport();

            AiChatService.ChatTransport localTransport = original -> {
                assertEquals(
                        URI.create(
                                "https://openrouter.ai/api/v1/chat/completions"),
                        original.uri());

                var localRequest = HttpRequest.newBuilder(endpoint)
                        .timeout(Duration.ofSeconds(5))
                        .header("Content-Type", "application/json")
                        .header("Authorization", "Bearer fake-test-key")
                        .POST(original.bodyPublisher().orElseThrow())
                        .build();

                return realTransport.send(localRequest);
            };

            var conversation = new AiToolConversationService(
                    localTransport,
                    fixture.registry);

            List<Map<String, Object>> messages = List.of(
                    Map.of(
                            "role", "user",
                            "content", "Calculate 2 + 3."));

            var error = assertThrows(
                    AiToolConversationService.Failure.class,
                    () -> conversation.chatWithParameters(
                            "test/model",
                            messages,
                            new AiToolRequestParameters(0.4, 0.75, 512),
                            "fake-test-key",
                            Set.of("calc_run")));

            assertEquals("upstream_http_error", error.code());

            assertEquals(
                    "Model request returned an unsuccessful status.",
                    error.getMessage());

            assertFalse(
                    error.getMessage()
                            .contains("SECRET_UPSTREAM_FAILURE_DETAILS"));

            assertEquals(1, requests.get());
            assertEquals(0, fixture.calculator.executions);

        } finally {
            server.stop(0);
        }
    }

    @Test
    void secondRoundHttpFailureDoesNotRepeatToolOrSendThirdRequest()
            throws Exception {

        var requests = new AtomicInteger();
        var capturedBodies = Collections.synchronizedList(new ArrayList<String>());

        var fixture = new AiChatToolIntegrationTest.Fixture();
        var json = new ObjectMapper();

        String firstResponse = """
                {
                  "choices": [{
                    "finish_reason": "tool_calls",
                    "message": {
                      "role": "assistant",
                      "content": null,
                      "tool_calls": [{
                        "id": "call_local_add",
                        "type": "function",
                        "function": {
                          "name": "calc_run",
                          "arguments": "{\\"operation\\":\\"add\\",\\"a\\":2,\\"b\\":3}"
                        }
                      }]
                    }
                  }]
                }
                """;

        var server = HttpServer.create(
                new InetSocketAddress("127.0.0.1", 0), 0);

        server.createContext("/chat/completions", exchange -> {
            try {
                capturedBodies.add(new String(
                        exchange.getRequestBody().readAllBytes(),
                        StandardCharsets.UTF_8));

                int number = requests.incrementAndGet();

                int status = number == 1 ? 200 : 500;
                String body = number == 1
                        ? firstResponse
                        : """
                                {
                                  "error": {
                                    "message": "SECRET_SECOND_ROUND_FAILURE"
                                  }
                                }
                                """;

                byte[] response = body.getBytes(StandardCharsets.UTF_8);

                exchange.getResponseHeaders().set(
                        "Content-Type",
                        "application/json;charset=UTF-8");

                exchange.sendResponseHeaders(status, response.length);
                exchange.getResponseBody().write(response);
            } finally {
                exchange.close();
            }
        });

        try {
            server.start();

            var endpoint = URI.create(
                    "http://127.0.0.1:"
                            + server.getAddress().getPort()
                            + "/chat/completions");

            var realTransport = AiChatService.defaultTransport();

            AiChatService.ChatTransport localTransport = original -> {
                assertEquals(
                        URI.create(
                                "https://openrouter.ai/api/v1/chat/completions"),
                        original.uri());

                var localRequest = HttpRequest.newBuilder(endpoint)
                        .timeout(Duration.ofSeconds(5))
                        .header("Content-Type", "application/json")
                        .header("Authorization", "Bearer fake-test-key")
                        .POST(original.bodyPublisher().orElseThrow())
                        .build();

                return realTransport.send(localRequest);
            };

            var conversation = new AiToolConversationService(
                    localTransport,
                    fixture.registry);

            List<Map<String, Object>> messages = List.of(
                    Map.of(
                            "role", "user",
                            "content", "Calculate 2 + 3."));

            var error = assertThrows(
                    AiToolConversationService.Failure.class,
                    () -> conversation.chatWithParameters(
                            "test/model",
                            messages,
                            new AiToolRequestParameters(0.4, 0.75, 512),
                            "fake-test-key",
                            Set.of("calc_run")));

            assertEquals("upstream_http_error", error.code());

            assertEquals(
                    "Model request returned an unsuccessful status.",
                    error.getMessage());

            assertFalse(
                    error.getMessage()
                            .contains("SECRET_SECOND_ROUND_FAILURE"));

            assertEquals(2, requests.get());
            assertEquals(2, capturedBodies.size());
            assertEquals(1, fixture.calculator.executions);

            var first = json.readTree(capturedBodies.get(0));
            var second = json.readTree(capturedBodies.get(1));

            assertEquals("auto", first.path("tool_choice").asString());
            assertEquals("none", second.path("tool_choice").asString());

            var followUpMessages = second.path("messages");
            assertEquals(3, followUpMessages.size());

            var assistant = followUpMessages.get(1);
            assertEquals("assistant", assistant.path("role").asString());

            var expectedAssistant = json.readTree(firstResponse)
                    .path("choices").get(0).path("message");

            assertEquals(
                    expectedAssistant.path("tool_calls"),
                    assistant.path("tool_calls"));

            var toolMessage = followUpMessages.get(2);

            assertEquals("tool", toolMessage.path("role").asString());
            assertEquals(
                    "call_local_add",
                    toolMessage.path("tool_call_id").asString());

            var toolResult = json.readTree(
                    toolMessage.path("content").asString());

            assertTrue(toolResult.path("ok").asBoolean());
            assertEquals(
                    5.0,
                    toolResult.path("output").path("result").asDouble());

        } finally {
            server.stop(0);
        }
    }
}
