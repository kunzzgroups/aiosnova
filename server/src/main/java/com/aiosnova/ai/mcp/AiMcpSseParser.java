package com.aiosnova.ai.mcp;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.util.Objects;

import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

public class AiMcpSseParser {

    private static final int MAX_LINE_CHARS = 262144;
    private static final int MAX_TOTAL_CHARS = 2097152;
    private static final int MAX_EVENTS = 1024;

    private final JsonMapper json = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .build();

    public JsonNode read(
            InputStream input,
            String expectedRequestId) throws IOException {

        Objects.requireNonNull(input);

        if (expectedRequestId == null || expectedRequestId.isBlank()) {
            throw new IllegalArgumentException("Request ID is required.");
        }

        // 流的关闭由调用方负责。
        var reader = new LimitedLines(input);

        var data = new StringBuilder();
        String eventType = "message";
        int events = 0;

        String line;

        while ((line = reader.next()) != null) {
            if (line.isEmpty()) {
                if (++events > MAX_EVENTS) {
                    throw failure("mcp_sse_event_limit_exceeded");
                }

                if (!data.isEmpty() && (eventType.isEmpty() || "message".equals(eventType))) {
                    // data 的最后一个换行是字段拼接时添加的。
                    String text = data.substring(0, data.length() - 1);

                    if (!text.isBlank()) {
                        JsonNode response = parseMessage(
                                text, expectedRequestId);

                        if (response != null) {
                            return response;
                        }
                    }
                }

                data.setLength(0);
                eventType = "message";
                continue;
            }

            // SSE 注释和心跳。
            if (line.startsWith(":")) {
                continue;
            }

            int colon = line.indexOf(':');

            String field = colon < 0
                    ? line
                    : line.substring(0, colon);

            String value = colon < 0
                    ? ""
                    : line.substring(colon + 1);

            // 只去除冒号后的一个空格。
            if (value.startsWith(" ")) {
                value = value.substring(1);
            }

            switch (field) {
                case "data" -> data.append(value).append('\n');
                case "event" -> eventType = value;
                default -> {
                    // id、retry 暂不用于自动重连。
                }
            }
        }

        // 没有空行结束的最后一帧不当作完整事件。
        throw failure("mcp_sse_response_missing");
    }

    private JsonNode parseMessage(
            String text,
            String expectedRequestId) {

        final JsonNode message;

        try {
            message = json.readTree(text);
        } catch (RuntimeException error) {
            throw failure("mcp_invalid_sse_message");
        }

        if (message == null
                || !message.isObject()
                || !"2.0".equals(message.path("jsonrpc").asString())) {
            throw failure("mcp_invalid_sse_message");
        }

        if (message.has("method")) {
            if (!message.path("method").isString()) {
                throw failure("mcp_invalid_sse_message");
            }

            if (message.has("id")) {
                // 第一版尚未实现服务端向客户端发起请求。
                throw failure("mcp_server_request_not_supported");
            }

            if (message.has("result") || message.has("error")) {
                throw failure("mcp_invalid_sse_message");
            }

            // 合法通知不会被当成本次请求的结果。
            return null;
        }

        if (!message.path("id").isString()
                || message.has("result") == message.has("error")) {
            throw failure("mcp_invalid_sse_message");
        }

        if (!expectedRequestId.equals(message.path("id").asString())) {
            // 等待属于当前请求的响应。
            return null;
        }

        // JSON-RPC error 也交回握手／发现层检查。
        return message;
    }

    private static final class LimitedLines {

        private final Reader reader;
        private int total;
        private boolean firstCharacter = true;
        private boolean skipLf;

        LimitedLines(InputStream input) {
            reader = new InputStreamReader(input, StandardCharsets.UTF_8.newDecoder());
        }

        String next() throws IOException {
            var line = new StringBuilder();

            while (true) {
                int character = reader.read();

                if (character == -1) {
                    return line.isEmpty() ? null : line.toString();
                }

                if (++total > MAX_TOTAL_CHARS) {
                    throw failure("mcp_sse_size_limit_exceeded");
                }

                if (skipLf) {
                    skipLf = false;

                    if (character == '\n') {
                        continue;
                    }
                }

                if (firstCharacter) {
                    firstCharacter = false;

                    if (character == 0xFEFF) {
                        continue;
                    }
                }

                if (character == '\n') {
                    return line.toString();
                }

                if (character == '\r') {
                    skipLf = true;
                    return line.toString();
                }

                if (line.length() >= MAX_LINE_CHARS) {
                    throw failure("mcp_sse_size_limit_exceeded");
                }

                line.append((char) character);
            }
        }
    }

    private static IllegalStateException failure(String code) {
        return new IllegalStateException(code);
    }
}
