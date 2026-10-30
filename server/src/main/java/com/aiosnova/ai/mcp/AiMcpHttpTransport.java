package com.aiosnova.ai.mcp;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.io.InputStream;
import java.net.http.HttpTimeoutException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Local development transport supporting JSON and SSE responses.
 */
public class AiMcpHttpTransport implements AiMcpTransport {

    private final URI endpoint;
    private final Duration timeout;
    private final HttpClient client;

    private final JsonMapper json = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .build();

    public AiMcpHttpTransport(URI endpoint, Duration timeout) {
        if (endpoint == null
                || !"http".equalsIgnoreCase(endpoint.getScheme())
                || !"127.0.0.1".equals(endpoint.getHost())
                || endpoint.getPort() < 1
                || endpoint.getPort() > 65535
                || endpoint.getRawUserInfo() != null
                || endpoint.getRawFragment() != null) {
            throw new IllegalArgumentException(
                    "Local MCP transport requires an HTTP loopback endpoint.");
        }

        if (timeout == null
                || timeout.compareTo(Duration.ofSeconds(1)) < 0
                || timeout.compareTo(Duration.ofSeconds(120)) > 0) {
            throw new IllegalArgumentException(
                    "Timeout must be between 1 and 120 seconds.");
        }

        this.endpoint = endpoint;
        this.timeout = timeout;
        this.client = HttpClient.newBuilder()
                .connectTimeout(timeout)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    @Override
    public Response exchange(
            JsonNode message,
            String sessionId,
            String protocolVersion) {

        if (message == null || !message.isObject()) {
            throw failure("mcp_invalid_outgoing_message");
        }

        validateHeaderValue(sessionId);

        if (protocolVersion != null
                && !AiMcpHandshake.PROTOCOL_VERSION.equals(protocolVersion)) {
            throw failure("mcp_unsupported_protocol_version");
        }

        var builder = HttpRequest.newBuilder(endpoint)
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json, text/event-stream");

        if (sessionId != null) {
            builder.header("MCP-Session-Id", sessionId);
        }

        if (protocolVersion != null) {
            builder.header("MCP-Protocol-Version", protocolVersion);
        }

        var request = builder.POST(
                HttpRequest.BodyPublishers.ofString(
                        json.writeValueAsString(message),
                        StandardCharsets.UTF_8))
                .build();

        long started = System.nanoTime();

        final HttpResponse<InputStream> response;

        try {
            response = client.send(
                    request,
                    HttpResponse.BodyHandlers.ofInputStream());
        } catch (HttpTimeoutException error) {
            throw failure("mcp_http_timeout");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw failure("mcp_http_interrupted");
        } catch (IOException error) {
            throw failure("mcp_http_transport_error");
        }

        var executor = Executors.newVirtualThreadPerTaskExecutor();

        try {
            var reading = executor.submit(
                    () -> readResponse(response, message));

            try {
                long remaining = timeout.toNanos()
                        - (System.nanoTime() - started);

                if (remaining <= 0) {
                    throw new TimeoutException();
                }

                return reading.get(remaining, TimeUnit.NANOSECONDS);
            } catch (TimeoutException error) {
                throw failure("mcp_http_timeout");
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw failure("mcp_http_interrupted");
            } catch (ExecutionException error) {
                if (error.getCause() instanceof IllegalStateException safeError) {
                    throw safeError;
                }

                throw failure("mcp_http_transport_error");
            } finally {
                reading.cancel(true);
            }
        } finally {
            closeQuietly(response.body());
            executor.shutdownNow();
        }
    }

    private static void validateHeaderValue(String value) {
        if (value != null
                && (value.isEmpty()
                        || value.chars().anyMatch(
                                character -> character < 0x21
                                        || character > 0x7E))) {
            throw failure("mcp_invalid_session_id");
        }
    }

    private static IllegalStateException failure(String code) {
        return new IllegalStateException(code);
    }

    private Response readResponse(
            HttpResponse<InputStream> response,
            JsonNode request) throws IOException {

        try (InputStream input = response.body()) {
            int status = response.statusCode();

            String responseSession = response.headers()
                    .firstValue("MCP-Session-Id")
                    .orElse(null);

            validateHeaderValue(responseSession);

            // 不读取、解析或返回上游错误内容。
            if (status < 200 || status >= 300) {
                return new Response(status, responseSession, null);
            }

            String contentType = response.headers()
                    .firstValue("Content-Type")
                    .orElse("")
                    .split(";", 2)[0]
                    .trim()
                    .toLowerCase(Locale.ROOT);

            if (status == 202) {
                String text = readText(input);

                if (!text.isBlank()) {
                    throw failure("mcp_unexpected_notification_body");
                }

                return new Response(status, responseSession, null);
            }

            if ("text/event-stream".equals(contentType)) {
                if (!request.path("id").isString()) {
                    throw failure("mcp_invalid_outgoing_message");
                }

                JsonNode body = new AiMcpSseParser().read(
                        input,
                        request.path("id").asString());

                return new Response(status, responseSession, body);
            }

            if (!"application/json".equals(contentType)) {
                throw failure("mcp_unexpected_content_type");
            }

            String text = readText(input);

            if (text.isBlank()) {
                throw failure("mcp_invalid_json_response");
            }

            final JsonNode body;

            try {
                body = json.readTree(text);
            } catch (RuntimeException error) {
                throw failure("mcp_invalid_json_response");
            }

            if (body == null || !body.isObject()) {
                throw failure("mcp_invalid_json_response");
            }

            return new Response(status, responseSession, body);
        }
    }

    private static String readText(InputStream input) throws IOException {
        int maxBytes = 2 * 1024 * 1024;

        byte[] bytes = input.readNBytes(maxBytes + 1);

        if (bytes.length > maxBytes) {
            throw failure("mcp_http_body_limit_exceeded");
        }

        return new String(bytes, StandardCharsets.UTF_8);
    }

    private static void closeQuietly(InputStream input) {
        try {
            input.close();
        } catch (IOException ignored) {
            // 不让清理错误覆盖原来的请求结果。
        }
    }
}
