package com.aiosnova.ai.mcp;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

class AiMcpHandshakeTest {

    private record Sent(
            JsonNode message,
            String sessionId,
            String protocolVersion) {
    }

    private static final class FakeTransport implements AiMcpTransport {

        final List<Sent> sent = new ArrayList<>();
        final JsonMapper json = JsonMapper.builder().build();

        String assignedSession = "mock-session-123";
        int notificationStatus = 202;
        boolean initializeError;
        boolean mismatchedResponseId;
        String responseProtocolVersion = AiMcpHandshake.PROTOCOL_VERSION;

        @Override
        public Response exchange(
                JsonNode message,
                String sessionId,
                String protocolVersion) {

            sent.add(new Sent(message, sessionId, protocolVersion));

            if ("initialize".equals(message.path("method").asString())) {
                var body = json.createObjectNode();
                body.put("jsonrpc", "2.0");
                body.put(
                        "id",
                        mismatchedResponseId
                                ? "different-response-id"
                                : message.path("id").asString());

                if (initializeError) {
                    var error = body.putObject("error");
                    error.put("code", -32603);
                    error.put("message", "mock upstream private detail");

                    return new Response(200, assignedSession, body);
                }

                var result = body.putObject("result");
                result.put("protocolVersion", responseProtocolVersion);

                result.putObject("capabilities").putObject("tools");

                var server = result.putObject("serverInfo");
                server.put("name", "mock-mcp");
                server.put("version", "1.0.0");

                return new Response(200, assignedSession, body);
            }

            assertEquals(
                    "notifications/initialized",
                    message.path("method").asString());

            return new Response(notificationStatus, null, null);
        }
    }

    private void assertInitializeRejected(
            FakeTransport transport,
            String expectedCode) {

        var error = assertThrows(
                IllegalStateException.class,
                () -> new AiMcpHandshake(transport).initialize());

        assertEquals(expectedCode, error.getMessage());

        // 没有重试，也没有发送 initialized 通知。
        assertEquals(1, transport.sent.size());

        var onlyRequest = transport.sent.get(0);

        assertEquals(
                "initialize",
                onlyRequest.message().path("method").asString());

        assertNull(onlyRequest.sessionId());
        assertNull(onlyRequest.protocolVersion());

        assertFalse(transport.sent.stream().anyMatch(sent -> "notifications/initialized".equals(
                sent.message().path("method").asString())));

        // 错误消息不透传上游内容。
        assertFalse(error.getMessage().contains(
                "mock upstream private detail"));
    }

    @Test
    void initializeErrorResponseStopsBeforeNotification() {
        var transport = new FakeTransport();
        transport.initializeError = true;

        assertInitializeRejected(
                transport,
                "mcp_invalid_initialize_response");
    }

    @Test
    void mismatchedResponseIdStopsBeforeNotification() {
        var transport = new FakeTransport();
        transport.mismatchedResponseId = true;

        assertInitializeRejected(
                transport,
                "mcp_invalid_initialize_response");
    }

    @Test
    void unsupportedProtocolVersionStopsBeforeNotification() {
        var transport = new FakeTransport();
        transport.responseProtocolVersion = "unsupported-test-version";

        assertInitializeRejected(
                transport,
                "mcp_unsupported_protocol_version");
    }

    @Test
    void initializesThenSendsNotificationWithNegotiatedSession() {
        var transport = new FakeTransport();

        var session = new AiMcpHandshake(transport).initialize();

        assertEquals(2, transport.sent.size());

        var first = transport.sent.get(0);

        assertEquals(
                "initialize",
                first.message().path("method").asString());
        assertEquals("2.0", first.message().path("jsonrpc").asString());
        assertTrue(first.message().path("id").isString());
        assertFalse(first.message().path("id").asString().isBlank());

        assertNull(first.sessionId());
        assertNull(first.protocolVersion());

        var params = first.message().path("params");

        assertEquals(
                AiMcpHandshake.PROTOCOL_VERSION,
                params.path("protocolVersion").asString());
        assertTrue(params.path("capabilities").isObject());
        assertEquals(0, params.path("capabilities").size());
        assertEquals(
                "aiosnova",
                params.path("clientInfo").path("name").asString());

        var second = transport.sent.get(1);

        assertEquals(
                "notifications/initialized",
                second.message().path("method").asString());
        assertFalse(second.message().has("id"));
        assertEquals("mock-session-123", second.sessionId());
        assertEquals(
                AiMcpHandshake.PROTOCOL_VERSION,
                second.protocolVersion());

        assertEquals("mock-session-123", session.sessionId());
        assertEquals("mock-mcp", session.serverName());
        assertEquals("1.0.0", session.serverVersion());
        assertTrue(session.supportsTools());
    }

    @Test
    void supportsServerWithoutSessionId() {
        var transport = new FakeTransport();
        transport.assignedSession = null;

        var session = new AiMcpHandshake(transport).initialize();

        assertNull(session.sessionId());
        assertNull(transport.sent.get(1).sessionId());
        assertEquals(
                AiMcpHandshake.PROTOCOL_VERSION,
                transport.sent.get(1).protocolVersion());
        assertEquals(2, transport.sent.size());
    }

    @Test
    void rejectedNotificationDoesNotReturnSuccessfulSession() {
        var transport = new FakeTransport();
        transport.notificationStatus = 400;

        var error = assertThrows(
                IllegalStateException.class,
                () -> new AiMcpHandshake(transport).initialize());

        assertEquals(
                "mcp_initialized_notification_failed",
                error.getMessage());
        assertEquals(2, transport.sent.size());
    }
}
