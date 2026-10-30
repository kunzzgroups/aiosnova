package com.aiosnova.ai.mcp;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import com.sun.net.httpserver.HttpServer;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

class AiMcpSseTransportTest {

    private record Captured(
            String method,
            String sessionId,
            String protocolVersion) {
    }

    private static final class LocalSseUpstream implements AutoCloseable {

        final JsonMapper json = JsonMapper.builder().build();

        final List<Captured> requests = new CopyOnWriteArrayList<>();
        final CountDownLatch release = new CountDownLatch(1);
        final AtomicBoolean stallNextInitialize = new AtomicBoolean();

        final ExecutorService executor =
                Executors.newVirtualThreadPerTaskExecutor();

        final HttpServer server;

        LocalSseUpstream(String assignedSession) throws IOException {
            server = HttpServer.create(
                    new InetSocketAddress("127.0.0.1", 0), 0);

            // SSE 响应保持打开时，后续请求仍须能处理。
            server.setExecutor(executor);

            server.createContext("/mcp", exchange -> {
                try {
                    JsonNode request = json.readTree(new String(
                            exchange.getRequestBody().readAllBytes(),
                            StandardCharsets.UTF_8));

                    String method = request.path("method").asString();

                    requests.add(new Captured(
                            method,
                            exchange.getRequestHeaders()
                                    .getFirst("MCP-Session-Id"),
                            exchange.getRequestHeaders()
                                    .getFirst("MCP-Protocol-Version")));

                    if ("notifications/initialized".equals(method)) {
                        exchange.sendResponseHeaders(202, -1);
                        return;
                    }

                    exchange.getResponseHeaders().set(
                            "Content-Type",
                            "text/event-stream; charset=utf-8");

                    if ("initialize".equals(method)
                            && assignedSession != null) {
                        exchange.getResponseHeaders().set(
                                "MCP-Session-Id", assignedSession);
                    }

                    exchange.sendResponseHeaders(200, 0);

                    if ("initialize".equals(method)
                            && stallNextInitialize.getAndSet(false)) {
                        exchange.getResponseBody().write(
                                ": waiting\n\n".getBytes(StandardCharsets.UTF_8));
                        exchange.getResponseBody().flush();
                        awaitRelease();
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
                        info.put("name", "本地 SSE MCP");
                        info.put("version", "1.0.0");
                    } else if ("tools/list".equals(method)) {
                        var tool = result.putArray("tools").addObject();
                        tool.put("name", "calculator.add");
                        tool.put("description", "SSE 加法工具");
                        tool.putObject("inputSchema").put("type", "object");
                    } else {
                        return;
                    }

                    String events = ": heartbeat\n\n"
                            + "event: message\n"
                            + "data: " + json.writeValueAsString(response)
                            + "\n\n";

                    exchange.getResponseBody().write(
                            events.getBytes(StandardCharsets.UTF_8));
                    exchange.getResponseBody().flush();

                    // 不主动关闭，让客户端收到匹配响应后自行结束读取。
                    awaitRelease();
                } finally {
                    exchange.close();
                }
            });

            server.start();
        }

        private void awaitRelease() {
            try {
                release.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
        }

        URI endpoint() {
            return URI.create(
                    "http://127.0.0.1:"
                            + server.getAddress().getPort()
                            + "/mcp");
        }

        @Override
        public void close() {
            release.countDown();
            server.stop(0);
            executor.shutdownNow();
        }
    }

    private void verifyFlow(String sessionId) throws Exception {
        try (var upstream = new LocalSseUpstream(sessionId)) {
            var transport = new AiMcpHttpTransport(
                    upstream.endpoint(), Duration.ofSeconds(3));

            var result = new AiMcpDiscoveryService(transport).discover();

            assertEquals(
                    List.of(
                            "initialize",
                            "notifications/initialized",
                            "tools/list"),
                    upstream.requests.stream()
                            .map(Captured::method)
                            .toList());

            assertEquals(sessionId, result.session().sessionId());
            assertEquals("本地 SSE MCP", result.session().serverName());
            assertEquals(1, result.tools().size());
            assertEquals(
                    "SSE 加法工具",
                    result.tools().getFirst().description());

            assertNull(upstream.requests.getFirst().sessionId());
            assertNull(upstream.requests.getFirst().protocolVersion());

            for (int index = 1; index < upstream.requests.size(); index++) {
                var request = upstream.requests.get(index);

                assertEquals(sessionId, request.sessionId());
                assertEquals(
                        AiMcpHandshake.PROTOCOL_VERSION,
                        request.protocolVersion());
            }

            // 服务端还未主动释放长连接，完整流程已经返回。
            assertEquals(1L, upstream.release.getCount());
        }
    }

    @Test
    void completeSseFlowPreservesSession() throws Exception {
        verifyFlow("sse-session-123");
    }

    @Test
    void completeSseFlowSupportsStatelessServer() throws Exception {
        verifyFlow(null);
    }

    @Test
    void stalledBodyTimesOutAndNextDiscoveryStillWorks() throws Exception {
        try (var upstream = new LocalSseUpstream("sse-session-123")) {
            upstream.stallNextInitialize.set(true);

            var transport = new AiMcpHttpTransport(
                    upstream.endpoint(), Duration.ofSeconds(1));

            var service = new AiMcpDiscoveryService(transport);

            var error = assertThrows(
                    IllegalStateException.class,
                    service::discover);

            assertEquals("mcp_http_timeout", error.getMessage());
            assertEquals(1, upstream.requests.size());

            // 同一个 Transport 在超时后仍能完成下一次发现。
            var recovered = service.discover();

            assertEquals(1, recovered.tools().size());
            assertEquals(4, upstream.requests.size());

            assertEquals(
                    List.of(
                            "initialize",
                            "initialize",
                            "notifications/initialized",
                            "tools/list"),
                    upstream.requests.stream()
                            .map(Captured::method)
                            .toList());
        }
    }
}
