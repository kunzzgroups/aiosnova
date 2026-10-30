package com.aiosnova.ai.mcp;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.junit.jupiter.api.Assertions.*;

class AiMcpDiscoveryServiceTest {

    private record Sent(
            JsonNode message,
            String sessionId,
            String protocolVersion) {
    }

    private static final class FakeTransport implements AiMcpTransport {

        final JsonMapper json = JsonMapper.builder().build();
        final List<Sent> sent = new ArrayList<>();

        String assignedSession = "flow-session-123";
        boolean failInitialize;
        boolean failSecondPage;
        int listRequests;

        @Override
        public Response exchange(
                JsonNode message,
                String sessionId,
                String protocolVersion) {

            sent.add(new Sent(message, sessionId, protocolVersion));

            String method = message.path("method").asString();

            if ("initialize".equals(method)) {
                assertEquals(1, sent.size());
                assertNull(sessionId);
                assertNull(protocolVersion);

                if (failInitialize) {
                    return new Response(502, null, null);
                }

                var result = json.createObjectNode();
                result.put(
                        "protocolVersion",
                        AiMcpHandshake.PROTOCOL_VERSION);

                result.putObject("capabilities").putObject("tools");

                var server = result.putObject("serverInfo");
                server.put("name", "flow-test-mcp");
                server.put("version", "1.0.0");

                return success(message, result, assignedSession);
            }

            // 握手后的每一次调用，都必须沿用协商信息。
            assertEquals(assignedSession, sessionId);
            assertEquals(
                    AiMcpHandshake.PROTOCOL_VERSION,
                    protocolVersion);

            if ("notifications/initialized".equals(method)) {
                assertEquals(2, sent.size());
                assertFalse(message.has("id"));

                return new Response(202, null, null);
            }

            assertEquals("tools/list", method);

            listRequests++;

            // 确保 tools/list 发生在 initialized 通知之后。
            assertEquals(
                    "notifications/initialized",
                    sent.get(1).message().path("method").asString());

            if (listRequests == 1) {
                assertEquals(3, sent.size());
                assertFalse(message.path("params").has("cursor"));

                var result = toolPage("calculator.add");
                result.put("nextCursor", "opaque/+== page-two");

                return success(message, result, null);
            }

            assertEquals(2, listRequests);
            assertEquals(4, sent.size());
            assertEquals(
                    "opaque/+== page-two",
                    message.path("params").path("cursor").asString());

            if (failSecondPage) {
                return new Response(502, null, null);
            }

            return success(
                    message,
                    toolPage("calculator.subtract"),
                    null);
        }

        private ObjectNode toolPage(String name) {
            var result = json.createObjectNode();
            var tool = result.putArray("tools").addObject();

            tool.put("name", name);
            tool.putObject("inputSchema").put("type", "object");

            return result;
        }

        private Response success(
                JsonNode request,
                JsonNode result,
                String sessionId) {

            var response = json.createObjectNode();
            response.put("jsonrpc", "2.0");
            response.put("id", request.path("id").asString());
            response.set("result", result);

            return new Response(200, sessionId, response);
        }
    }

    private void assertFullSequence(FakeTransport transport) {
        assertEquals(
                List.of(
                        "initialize",
                        "notifications/initialized",
                        "tools/list",
                        "tools/list"),
                transport.sent.stream()
                        .map(item -> item.message()
                                .path("method").asString())
                        .toList());

        var requestIds = transport.sent.stream()
                .map(Sent::message)
                .filter(message -> message.has("id"))
                .map(message -> message.path("id").asString())
                .toList();

        assertEquals(3, requestIds.size());
        assertEquals(3L, requestIds.stream().distinct().count());
    }

    @Test
    void sameTransportAndSessionAreUsedForCompleteDiscovery() {
        var transport = new FakeTransport();

        var result = new AiMcpDiscoveryService(transport).discover();

        assertFullSequence(transport);

        assertEquals(
                "flow-session-123",
                result.session().sessionId());

        assertEquals(
                "flow-test-mcp",
                result.session().serverName());

        assertEquals(
                List.of("calculator.add", "calculator.subtract"),
                result.tools().stream()
                        .map(AiMcpToolDiscovery.DiscoveredTool::name)
                        .toList());

        assertThrows(
                UnsupportedOperationException.class,
                () -> result.tools().clear());
    }

    @Test
    void statelessServerStillUsesNegotiatedProtocolVersion() {
        var transport = new FakeTransport();
        transport.assignedSession = null;

        var result = new AiMcpDiscoveryService(transport).discover();

        assertFullSequence(transport);

        assertNull(result.session().sessionId());
        assertEquals(2, result.tools().size());

        for (int index = 1; index < transport.sent.size(); index++) {
            var request = transport.sent.get(index);

            assertNull(request.sessionId());
            assertEquals(
                    AiMcpHandshake.PROTOCOL_VERSION,
                    request.protocolVersion());
        }
    }

    @Test
    void initializeFailureStopsEntireFlow() {
        var transport = new FakeTransport();
        transport.failInitialize = true;

        var error = assertThrows(
                IllegalStateException.class,
                () -> new AiMcpDiscoveryService(transport).discover());

        assertEquals("mcp_initialize_http_error", error.getMessage());

        assertEquals(1, transport.sent.size());
        assertEquals(
                "initialize",
                transport.sent.getFirst()
                        .message().path("method").asString());

        assertEquals(0, transport.listRequests);
    }

    @Test
    void secondPageFailureDoesNotReturnPartialResultOrRetry() {
        var transport = new FakeTransport();
        transport.failSecondPage = true;

        var error = assertThrows(
                IllegalStateException.class,
                () -> new AiMcpDiscoveryService(transport).discover());

        assertEquals("mcp_tools_list_http_error", error.getMessage());

        assertFullSequence(transport);
        assertEquals(2, transport.listRequests);
    }
}
