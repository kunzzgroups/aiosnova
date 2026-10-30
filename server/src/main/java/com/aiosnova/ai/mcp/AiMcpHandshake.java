package com.aiosnova.ai.mcp;

import java.util.Objects;
import java.util.UUID;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

public class AiMcpHandshake {

    public static final String PROTOCOL_VERSION = "2025-11-25";

    public record Session(
            String protocolVersion,
            String sessionId,
            String serverName,
            String serverVersion,
            boolean supportsTools) {
    }

    private final AiMcpTransport transport;
    private final JsonMapper json = JsonMapper.builder().build();

    public AiMcpHandshake(AiMcpTransport transport) {
        this.transport = Objects.requireNonNull(transport);
    }

    public Session initialize() {
        String requestId = UUID.randomUUID().toString();

        var request = json.createObjectNode();
        request.put("jsonrpc", "2.0");
        request.put("id", requestId);
        request.put("method", "initialize");

        var params = request.putObject("params");
        params.put("protocolVersion", PROTOCOL_VERSION);

        // 不声明尚未实现的 sampling、roots 等客户端能力。
        params.putObject("capabilities");

        var clientInfo = params.putObject("clientInfo");
        clientInfo.put("name", "aiosnova");
        clientInfo.put("version", "0.1.0");

        var response = transport.exchange(request, null, null);

        if (response == null || response.httpStatus() != 200) {
            throw failure("mcp_initialize_http_error");
        }

        JsonNode body = response.body();

        if (body == null
                || !body.isObject()
                || !"2.0".equals(body.path("jsonrpc").asString())
                || !body.path("id").isString()
                || !requestId.equals(body.path("id").asString())
                || body.has("error")
                || !body.path("result").isObject()) {
            throw failure("mcp_invalid_initialize_response");
        }

        JsonNode result = body.path("result");

        if (!PROTOCOL_VERSION.equals(
                result.path("protocolVersion").asString())) {
            throw failure("mcp_unsupported_protocol_version");
        }

        JsonNode capabilities = result.path("capabilities");
        JsonNode serverInfo = result.path("serverInfo");

        if (!capabilities.isObject()
                || !serverInfo.isObject()
                || !nonBlankString(serverInfo.path("name"))
                || !nonBlankString(serverInfo.path("version"))
                || (capabilities.has("tools")
                    && !capabilities.path("tools").isObject())) {
            throw failure("mcp_invalid_initialize_response");
        }

        String sessionId = response.sessionId();
        validateSessionId(sessionId);

        var notification = json.createObjectNode();
        notification.put("jsonrpc", "2.0");
        notification.put("method", "notifications/initialized");

        var accepted = transport.exchange(
                notification, sessionId, PROTOCOL_VERSION);

        if (accepted == null
                || accepted.httpStatus() != 202
                || (accepted.body() != null
                    && !accepted.body().isNull())) {
            throw failure("mcp_initialized_notification_failed");
        }

        return new Session(
                PROTOCOL_VERSION,
                sessionId,
                serverInfo.path("name").asString(),
                serverInfo.path("version").asString(),
                capabilities.has("tools"));
    }

    private static boolean nonBlankString(JsonNode value) {
        return value.isString() && !value.asString().isBlank();
    }

    private static void validateSessionId(String sessionId) {
        // 服务器可以不创建 Session，此时保持 null。
        if (sessionId != null
                && (sessionId.isEmpty()
                    || sessionId.chars().anyMatch(
                            character -> character < 0x21
                                    || character > 0x7E))) {
            throw failure("mcp_invalid_session_id");
        }
    }

    private static IllegalStateException failure(String code) {
        // 不把上游响应或认证内容放进错误消息。
        return new IllegalStateException(code);
    }
}
