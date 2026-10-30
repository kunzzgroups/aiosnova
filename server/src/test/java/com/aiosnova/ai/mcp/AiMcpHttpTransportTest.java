package com.aiosnova.ai.mcp;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import com.sun.net.httpserver.HttpServer;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

class AiMcpHttpTransportTest {

    private record Captured(
            String method,
            String accept,
            String contentType,
            String sessionId,
            String protocolVersion,
            String authorization,
            JsonNode body) {
    }

    private static final class LocalUpstream implements AutoCloseable {

        final JsonMapper json = JsonMapper.builder().build();

        final List<Captured> requests = new CopyOnWriteArrayList<>();

        final HttpServer server;

        LocalUpstream(String assignedSession) throws IOException {
            server = HttpServer.create(
                    new InetSocketAddress("127.0.0.1", 0), 0);

            server.createContext("/mcp", exchange -> {
                try {
                    String text = new String(
                            exchange.getRequestBody().readAllBytes(),
                            StandardCharsets.UTF_8);

                    JsonNode request = json.readTree(text);
                    var headers = exchange.getRequestHeaders();

                    requests.add(new Captured(
                            exchange.getRequestMethod(),
                            headers.getFirst("Accept"),
                            headers.getFirst("Content-Type"),
                            headers.getFirst("MCP-Session-Id"),
                            headers.getFirst("MCP-Protocol-Version"),
                            headers.getFirst("Authorization"),
                            request));

                    String method = request.path("method").asString();

                    if ("notifications/initialized".equals(method)) {
                        exchange.sendResponseHeaders(202, -1);
                        return;
                    }

                    var response = json.createObjectNode();
                    response.put("jsonrpc", "2.0");
                    response.put("id", request.path("id").asString());

                    var result = response.putObject("result");

                    if ("initialize".equals(method)) {
                        result.put(
                                "protocolVersion",
                                AiMcpHandshake.PROTOCOL_VERSION);

                        result.putObject("capabilities").putObject("tools");

                        var info = result.putObject("serverInfo");
                        info.put("name", "本地 MCP");
                        info.put("version", "1.0.0");

                        if (assignedSession != null) {
                            exchange.getResponseHeaders().set(
                                    "MCP-Session-Id", assignedSession);
                        }
                    } else if ("tools/list".equals(method)) {
                        var tool = result.putArray("tools").addObject();
                        tool.put("name", "calculator.add");
                        tool.put("description", "计算加法");
                        tool.putObject("inputSchema")
                                .put("type", "object");
                    } else {
                        exchange.sendResponseHeaders(400, -1);
                        return;
                    }

                    byte[] bytes = json.writeValueAsString(response)
                            .getBytes(StandardCharsets.UTF_8);

                    exchange.getResponseHeaders().set(
                            "Content-Type",
                            "application/json; charset=utf-8");

                    exchange.sendResponseHeaders(200, bytes.length);
                    exchange.getResponseBody().write(bytes);
                } finally {
                    exchange.close();
                }
            });

            server.start();
        }

        URI endpoint() {
            return URI.create(
                    "http://127.0.0.1:"
                            + server.getAddress().getPort()
                            + "/mcp");
        }

        @Override
        public void close() {
            server.stop(0);
        }
    }

    private static final class FailureUpstream implements AutoCloseable {

        final HttpServer server;
        final AtomicInteger requests = new AtomicInteger();
        final AtomicInteger redirectRequests = new AtomicInteger();

        FailureUpstream(
                int status,
                String contentType,
                String body,
                boolean redirect) throws IOException {

            server = HttpServer.create(
                    new InetSocketAddress("127.0.0.1", 0), 0);

            server.createContext("/mcp", exchange -> {
                try {
                    requests.incrementAndGet();

                    // 读取请求，避免未消费请求体影响连接。
                    exchange.getRequestBody().readAllBytes();

                    if (contentType != null) {
                        exchange.getResponseHeaders().set(
                                "Content-Type", contentType);
                    }

                    if (redirect) {
                        exchange.getResponseHeaders().set(
                                "Location", "/redirect-target");
                    }

                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);

                    exchange.sendResponseHeaders(status, bytes.length);
                    exchange.getResponseBody().write(bytes);
                } finally {
                    exchange.close();
                }
            });

            server.createContext("/redirect-target", exchange -> {
                try {
                    redirectRequests.incrementAndGet();
                    exchange.getRequestBody().readAllBytes();

                    byte[] bytes = "{}".getBytes(StandardCharsets.UTF_8);

                    exchange.getResponseHeaders().set(
                            "Content-Type", "application/json");

                    exchange.sendResponseHeaders(200, bytes.length);
                    exchange.getResponseBody().write(bytes);
                } finally {
                    exchange.close();
                }
            });

            server.start();
        }

        URI endpoint() {
            return URI.create(
                    "http://127.0.0.1:"
                            + server.getAddress().getPort()
                            + "/mcp");
        }

        @Override
        public void close() {
            server.stop(0);
        }
    }

    private void verifyFlow(String assignedSession) throws Exception {
        try (var upstream = new LocalUpstream(assignedSession)) {
            var transport = new AiMcpHttpTransport(
                    upstream.endpoint(),
                    Duration.ofSeconds(5));

            var result = new AiMcpDiscoveryService(transport).discover();

            assertEquals(
                    List.of(
                            "initialize",
                            "notifications/initialized",
                            "tools/list"),
                    upstream.requests.stream()
                            .map(request -> request.body()
                                    .path("method").asString())
                            .toList());

            assertEquals(assignedSession, result.session().sessionId());
            assertEquals("本地 MCP", result.session().serverName());
            assertEquals(1, result.tools().size());
            assertEquals("calculator.add", result.tools().getFirst().name());
            assertEquals("计算加法", result.tools().getFirst().description());

            for (var request : upstream.requests) {
                assertEquals("POST", request.method());
                assertEquals("application/json", request.contentType());
                assertTrue(request.accept().contains("application/json"));
                assertTrue(request.accept().contains("text/event-stream"));
                assertNull(request.authorization());
            }

            var initialize = upstream.requests.get(0);

            assertNull(initialize.sessionId());
            assertNull(initialize.protocolVersion());
            assertEquals(
                    AiMcpHandshake.PROTOCOL_VERSION,
                    initialize.body().path("params")
                            .path("protocolVersion").asString());

            for (int index = 1; index < upstream.requests.size(); index++) {
                var request = upstream.requests.get(index);

                assertEquals(assignedSession, request.sessionId());
                assertEquals(
                        AiMcpHandshake.PROTOCOL_VERSION,
                        request.protocolVersion());
            }

            assertFalse(upstream.requests.get(1).body().has("id"));

            assertNotEquals(
                    initialize.body().path("id").asString(),
                    upstream.requests.get(2).body().path("id").asString());
        }
    }

    private void assertFlowFailure(
            FailureUpstream upstream,
            String expectedCode) {

        var transport = new AiMcpHttpTransport(
                upstream.endpoint(),
                Duration.ofSeconds(5));

        var error = assertThrows(
                IllegalStateException.class,
                () -> new AiMcpDiscoveryService(transport).discover());

        assertEquals(expectedCode, error.getMessage());

        // 只有第一次 initialize，没有通知、工具发现或自动重试。
        assertEquals(1, upstream.requests.get());

        assertEquals(0, upstream.redirectRequests.get());

        // 不透传上游响应内容。
        assertFalse(error.getMessage().contains("private-upstream-detail"));
        assertNull(error.getCause());
    }

    @Test
    void jsonFlowSendsHeadersAndPreservesServerSession() throws Exception {
        verifyFlow("local-http-session-123");
    }

    @Test
    void jsonFlowSupportsStatelessServer() throws Exception {
        verifyFlow(null);
    }

    @Test
    void httpFailuresStopFlowWithoutRetryOrLeakingResponse() throws Exception {
        int[] statuses = { 401, 403, 500, 502 };

        for (int status : statuses) {
            try (var upstream = new FailureUpstream(
                    status,
                    "text/plain",
                    "private-upstream-detail",
                    false)) {

                assertFlowFailure(
                        upstream,
                        "mcp_initialize_http_error");
            }
        }
    }

    @Test
    void unexpectedOrMissingContentTypeStopsFlow() throws Exception {
        String[] contentTypes = {
                "text/plain",
                "text/html; charset=utf-8",
                "application/octet-stream",
                null
        };

        for (String contentType : contentTypes) {
            try (var upstream = new FailureUpstream(
                    200,
                    contentType,
                    "{\"message\":\"private-upstream-detail\"}",
                    false)) {

                assertFlowFailure(
                        upstream,
                        "mcp_unexpected_content_type");
            }
        }
    }

    @Test
    void invalidJsonStopsFlowWithoutExposingParserDetails() throws Exception {
        String[] invalidBodies = {
                "",
                "private-upstream-detail",
                "{",
                "[]",
                "null",
                "\"private-upstream-detail\"",
                "{\"value\":1,\"value\":2}",
                "{} {}"
        };

        for (String body : invalidBodies) {
            try (var upstream = new FailureUpstream(
                    200,
                    "application/json; charset=utf-8",
                    body,
                    false)) {

                assertFlowFailure(
                        upstream,
                        "mcp_invalid_json_response");
            }
        }
    }

    @Test
    void redirectsAreNotFollowed() throws Exception {
        int[] statuses = { 301, 302, 303, 307, 308 };

        for (int status : statuses) {
            try (var upstream = new FailureUpstream(
                    status,
                    "text/plain",
                    "private-upstream-detail",
                    true)) {

                assertFlowFailure(
                        upstream,
                        "mcp_initialize_http_error");

                assertEquals(0, upstream.redirectRequests.get());
            }
        }
    }
}