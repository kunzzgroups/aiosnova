package com.aiosnova.ai.mcp;

import java.io.ByteArrayInputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import com.sun.net.httpserver.HttpServer;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.*;

class AiMcpSseParserTest {

    @Test
    void handlesBomAndAllLineEndingsWithoutWaitingForClose() throws Exception {
        for (String newline : new String[]{"\n", "\r\n", "\r"}) {
            var response = readLocal(
                    "\uFEFF: heartbeat" + newline + newline
                            + "event:" + newline
                            + "data: {\"jsonrpc\":\"2.0\",\"id\":\"request-1\",\"result\":{}}"
                            + newline + newline,
                    true);
            assertEquals("request-1", response.path("id").asString());
        }
    }

    @Test
    void unterminatedFrameIsNotDispatchedAtEof() {
        var error = assertThrows(IllegalStateException.class,
                () -> readLocal("data: {\"jsonrpc\":\"2.0\",\"id\":\"request-1\",\"result\":{}}\n", false));
        assertEquals("mcp_sse_response_missing", error.getMessage());
    }

    @Test
    void enforcesLineTotalAndEventLimits() {
        String[] streams = {
                ":" + "a".repeat(262144) + "\n\n",
                (":" + "a".repeat(200000) + "\n").repeat(11),
                ": heartbeat\n\n".repeat(1025)
        };
        String[] codes = {
                "mcp_sse_size_limit_exceeded",
                "mcp_sse_size_limit_exceeded",
                "mcp_sse_event_limit_exceeded"
        };
        for (int index = 0; index < streams.length; index++) {
            var input = new ByteArrayInputStream(streams[index].getBytes(StandardCharsets.UTF_8));
            var error = assertThrows(IllegalStateException.class,
                    () -> new AiMcpSseParser().read(input, "request-1"));
            assertEquals(codes[index], error.getMessage());
        }
    }

    private JsonNode readLocal(
            String events,
            boolean keepOpen) throws Exception {

        var release = new CountDownLatch(1);

        var server = HttpServer.create(
                new InetSocketAddress("127.0.0.1", 0), 0);

        server.createContext("/mcp", exchange -> {
            try {
                exchange.getRequestBody().readAllBytes();

                exchange.getResponseHeaders().set(
                        "Content-Type", "text/event-stream");

                exchange.sendResponseHeaders(200, 0);

                exchange.getResponseBody().write(
                        events.getBytes(StandardCharsets.UTF_8));

                exchange.getResponseBody().flush();

                if (keepOpen) {
                    try {
                        release.await(5, TimeUnit.SECONDS);
                    } catch (InterruptedException error) {
                        Thread.currentThread().interrupt();
                    }
                }
            } finally {
                exchange.close();
            }
        });

        server.start();

        try {
            var endpoint = URI.create(
                    "http://127.0.0.1:"
                            + server.getAddress().getPort()
                            + "/mcp");

            var request = HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofSeconds(3))
                    .header("Accept", "application/json, text/event-stream")
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString("{}"))
                    .build();

            var response = HttpClient.newHttpClient().send(
                    request,
                    HttpResponse.BodyHandlers.ofInputStream());

            assertEquals(200, response.statusCode());

            try (var input = response.body();
                 var executor = Executors.newVirtualThreadPerTaskExecutor()) {

                var result = executor.submit(
                        () -> new AiMcpSseParser().read(input, "request-1"));

                try {
                    return result.get(2, TimeUnit.SECONDS);
                } catch (java.util.concurrent.ExecutionException error) {
                    if (error.getCause() instanceof RuntimeException runtime) {
                        throw runtime;
                    }

                    throw error;
                } finally {
                    release.countDown();
                }
            }
        } finally {
            release.countDown();
            server.stop(0);
        }
    }

    @Test
    void parsesCommentsMultilineDataAndMatchingResponse() throws Exception {
        String events = """
                : heartbeat

                event: message
                data: {"jsonrpc":"2.0","method":"notifications/tools/list_changed"}

                data: {"jsonrpc":"2.0","id":"other-request","result":{}}

                event: message
                data: {"jsonrpc":"2.0",
                data: "id":"request-1",
                data: "result":{"tools":[],"description":"中文测试"}}

                """;

        var response = readLocal(events, false);

        assertEquals("request-1", response.path("id").asString());
        assertTrue(response.path("result").path("tools").isArray());
        assertEquals(
                "中文测试",
                response.path("result").path("description").asString());
    }

    @Test
    void returnsMatchingResponseBeforeServerClosesStream() throws Exception {
        var response = readLocal(
                "data: {\"jsonrpc\":\"2.0\","
                        + "\"id\":\"request-1\",\"result\":{}}\n\n",
                true);

        assertEquals("request-1", response.path("id").asString());
    }

    @Test
    void invalidJsonProducesSafeError() {
        var error = assertThrows(
                IllegalStateException.class,
                () -> readLocal(
                        "data: private-upstream-detail\n\n",
                        false));

        assertEquals("mcp_invalid_sse_message", error.getMessage());
        assertFalse(error.getMessage().contains("private-upstream-detail"));
        assertNull(error.getCause());
    }

    @Test
    void streamWithoutMatchingResponseFails() {
        var error = assertThrows(
                IllegalStateException.class,
                () -> readLocal(
                        "data: {\"jsonrpc\":\"2.0\","
                                + "\"id\":\"other-request\",\"result\":{}}\n\n",
                        false));

        assertEquals("mcp_sse_response_missing", error.getMessage());
    }
}
