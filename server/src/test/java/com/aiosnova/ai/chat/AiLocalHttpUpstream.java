package com.aiosnova.ai.chat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import com.sun.net.httpserver.HttpServer;

import static org.junit.jupiter.api.Assertions.*;

final class AiLocalHttpUpstream implements AutoCloseable {

    record Reply(int status, String body) {
    }

    record CapturedRequest(
            String method,
            String authorization,
            String body) {
    }

    private final HttpServer server;
    private final List<Reply> replies;

    private final List<CapturedRequest> requests = new CopyOnWriteArrayList<>();

    AiLocalHttpUpstream(List<Reply> replies) throws IOException {
        this.replies = List.copyOf(replies);

        server = HttpServer.create(
                new InetSocketAddress("127.0.0.1", 0), 0);

        server.createContext("/chat/completions", exchange -> {
            try {
                requests.add(new CapturedRequest(
                        exchange.getRequestMethod(),
                        exchange.getRequestHeaders()
                                .getFirst("Authorization"),
                        new String(
                                exchange.getRequestBody().readAllBytes(),
                                StandardCharsets.UTF_8)));

                int index = requests.size() - 1;

                Reply reply = index < this.replies.size()
                        ? this.replies.get(index)
                        : new Reply(
                                500,
                                "{\"error\":\"Unexpected extra request\"}");

                byte[] bytes = reply.body()
                        .getBytes(StandardCharsets.UTF_8);

                exchange.getResponseHeaders().set(
                        "Content-Type",
                        "application/json;charset=UTF-8");

                exchange.sendResponseHeaders(
                        reply.status(), bytes.length);

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
                        + "/chat/completions");
    }

    List<CapturedRequest> requests() {
        return List.copyOf(requests);
    }

    AiChatService.ChatTransport forwardingTransport() {
        return forwardingTransport("fake-test-key");
    }

    AiChatService.ChatTransport forwardingTransport(String expectedKey) {
        if (!List.of(
                "fake-test-key",
                "fake-integration-key").contains(expectedKey)) {

            throw new IllegalArgumentException(
                    "Only known fake test keys are allowed.");
        }

        var realTransport = AiChatService.defaultTransport();

        return original -> {
            assertEquals(
                    URI.create(
                            "https://openrouter.ai/api/v1/chat/completions"),
                    original.uri());

            assertEquals("POST", original.method());

            assertEquals(
                    "Bearer " + expectedKey,
                    original.headers()
                            .firstValue("Authorization")
                            .orElseThrow());

            var localRequest = HttpRequest.newBuilder(endpoint())
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + expectedKey)
                    .POST(original.bodyPublisher().orElseThrow())
                    .build();

            return realTransport.send(localRequest);
        };
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
