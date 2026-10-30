package com.aiosnova.ai.mcp;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.junit.jupiter.api.Assertions.*;

class AiMcpToolDiscoveryTest {

    private static final String TOOL_A = """
            {
              "name": "calculator.add",
              "description": "Add two numbers",
              "inputSchema": {
                "type": "object",
                "properties": {
                  "a": {"type": "number"},
                  "b": {"type": "number"}
                },
                "required": ["a", "b"]
              }
            }
            """;

    private static final String TOOL_B = """
            {
              "name": "calculator.subtract",
              "inputSchema": {"type": "object"}
            }
            """;

    private static final class FakeTransport implements AiMcpTransport {

        final JsonMapper json = JsonMapper.builder().build();
        final List<JsonNode> requests = new ArrayList<>();
        final List<String> pages = new ArrayList<>();

        int failAtPage = -1;
        Consumer<ObjectNode> responseEditor = response -> {
        };

        @Override
        public Response exchange(
                JsonNode message,
                String sessionId,
                String protocolVersion) {

            int page = requests.size();
            requests.add(message);

            assertEquals("session-test", sessionId);
            assertEquals(
                    AiMcpHandshake.PROTOCOL_VERSION,
                    protocolVersion);
            assertEquals(
                    "tools/list",
                    message.path("method").asString());

            if (page == failAtPage) {
                return new Response(502, null, null);
            }

            assertTrue(page < pages.size(), "Unexpected extra request.");

            var response = json.createObjectNode();
            response.put("jsonrpc", "2.0");
            response.put("id", message.path("id").asString());
            response.set("result", json.readTree(pages.get(page)));

            responseEditor.accept(response);

            return new Response(200, null, response);
        }
    }

    private AiMcpHandshake.Session session(boolean supportsTools) {
        return new AiMcpHandshake.Session(
                AiMcpHandshake.PROTOCOL_VERSION,
                "session-test",
                "mock-mcp",
                "1.0.0",
                supportsTools);
    }

    private String page(String tools, String cursor) {
        return "{\"tools\":[" + tools + "]"
                + (cursor == null
                        ? ""
                        : ",\"nextCursor\":\"" + cursor + "\"")
                + "}";
    }

    private void expectFailure(
            FakeTransport transport,
            String code) {

        var error = assertThrows(
                IllegalStateException.class,
                () -> new AiMcpToolDiscovery(transport)
                        .discover(session(true)));

        assertEquals(code, error.getMessage());
    }

    private String toolsPage(int count) {
        var json = JsonMapper.builder().build();
        var result = json.createObjectNode();
        var tools = result.putArray("tools");

        for (int index = 0; index < count; index++) {
            var tool = tools.addObject();
            tool.put("name", "tool_" + index);
            tool.putObject("inputSchema").put("type", "object");
        }

        return json.writeValueAsString(result);
    }

    @Test
    void invalidToolDefinitionsStopDiscovery() {
        var json = JsonMapper.builder().build();

        var longName = json.createObjectNode();
        longName.put("name", "a".repeat(256));
        longName.putObject("inputSchema");

        var longDescription = json.createObjectNode();
        longDescription.put("name", "test");
        longDescription.put("description", "a".repeat(60001));
        longDescription.putObject("inputSchema");

        String[] invalidTools = {
                "null",
                "{}",
                """
                        {"name":123,"inputSchema":{}}
                        """,
                """
                        {"name":"   ","inputSchema":{}}
                        """,
                """
                        {"name":"bad\\nname","inputSchema":{}}
                        """,
                """
                        {"name":"test"}
                        """,
                """
                        {"name":"test","inputSchema":null}
                        """,
                """
                        {"name":"test","inputSchema":[]}
                        """,
                """
                        {"name":"test","description":123,"inputSchema":{}}
                        """,
                json.writeValueAsString(longName),
                json.writeValueAsString(longDescription)
        };

        for (String invalidTool : invalidTools) {
            var transport = new FakeTransport();

            // 即使响应声明还有下一页，也必须立即停止。
            transport.pages.add(page(invalidTool, "next-page"));

            expectFailure(transport, "mcp_invalid_tool_definition");

            assertEquals(1, transport.requests.size());
        }
    }

    @Test
    void discoversSinglePageAndPreservesSchema() {
        var transport = new FakeTransport();
        transport.pages.add(page(TOOL_A, null));

        var tools = new AiMcpToolDiscovery(transport)
                .discover(session(true));

        assertEquals(1, tools.size());
        assertEquals("calculator.add", tools.getFirst().name());
        assertEquals("Add two numbers", tools.getFirst().description());

        var schema = transport.json.readTree(
                tools.getFirst().inputSchema());

        assertEquals("object", schema.path("type").asString());
        assertEquals(
                "number",
                schema.path("properties").path("a")
                        .path("type").asString());
        assertEquals(2, schema.path("required").size());

        assertEquals(1, transport.requests.size());
        assertFalse(transport.requests.getFirst()
                .path("params").has("cursor"));

        assertThrows(
                UnsupportedOperationException.class,
                tools::clear);
    }

    @Test
    void followsOpaqueCursorAndCombinesAllPages() {
        var transport = new FakeTransport();
        String opaqueCursor = "next/+== token";

        transport.pages.add(page(TOOL_A, opaqueCursor));
        transport.pages.add(page(TOOL_B, null));

        var tools = new AiMcpToolDiscovery(transport)
                .discover(session(true));

        assertEquals(2, tools.size());
        assertEquals("calculator.add", tools.get(0).name());
        assertEquals("calculator.subtract", tools.get(1).name());
        assertEquals("", tools.get(1).description());

        assertEquals(2, transport.requests.size());

        assertEquals(
                opaqueCursor,
                transport.requests.get(1)
                        .path("params").path("cursor").asString());

        assertNotEquals(
                transport.requests.get(0).path("id").asString(),
                transport.requests.get(1).path("id").asString());
    }

    @Test
    void emptyDirectoryIsSuccessful() {
        var transport = new FakeTransport();
        transport.pages.add(page("", null));

        var tools = new AiMcpToolDiscovery(transport)
                .discover(session(true));

        assertTrue(tools.isEmpty());
        assertEquals(1, transport.requests.size());
    }

    @Test
    void secondPageFailureDoesNotReturnPartialDirectoryOrRetry() {
        var transport = new FakeTransport();
        transport.pages.add(page(TOOL_A, "page-two"));
        transport.failAtPage = 1;

        expectFailure(transport, "mcp_tools_list_http_error");

        assertEquals(2, transport.requests.size());
    }

    @Test
    void repeatedCursorStopsPagination() {
        var transport = new FakeTransport();
        transport.pages.add(page(TOOL_A, "same-cursor"));
        transport.pages.add(page(TOOL_B, "same-cursor"));

        expectFailure(transport, "mcp_repeated_tools_cursor");

        assertEquals(2, transport.requests.size());
    }

    @Test
    void duplicateToolAcrossPagesIsRejected() {
        var transport = new FakeTransport();
        transport.pages.add(page(TOOL_A, "page-two"));
        transport.pages.add(page(TOOL_A, null));

        expectFailure(transport, "mcp_duplicate_tool_name");

        assertEquals(2, transport.requests.size());
    }

    @Test
    void missingToolsCapabilityStopsBeforeTransport() {
        var transport = new FakeTransport();

        var error = assertThrows(
                IllegalStateException.class,
                () -> new AiMcpToolDiscovery(transport)
                        .discover(session(false)));

        assertEquals("mcp_tools_not_supported", error.getMessage());
        assertTrue(transport.requests.isEmpty());
    }

    @Test
    void invalidRpcResponsesStopBeforeNextPage() {
        List<Consumer<ObjectNode>> corruptions = List.of(
                response -> {
                    var error = response.putObject("error");
                    error.put("code", -32603);
                    error.put("message", "private upstream detail");
                    response.remove("result");
                },
                response -> {
                    response.put("id", "wrong-response-id");
                },
                response -> {
                    response.put("id", 123);
                },
                response -> {
                    response.put("jsonrpc", "1.0");
                },
                response -> {
                    response.remove("result");
                },
                response -> {
                    response.put("result", "invalid-result");
                },
                response -> {
                    response.putObject("result")
                            .putObject("tools");
                });

        for (var corruption : corruptions) {
            var transport = new FakeTransport();
            transport.pages.add(page(TOOL_A, "next-page"));
            transport.responseEditor = corruption;

            var error = assertThrows(
                    IllegalStateException.class,
                    () -> new AiMcpToolDiscovery(transport)
                            .discover(session(true)));

            assertEquals(
                    "mcp_invalid_tools_list_response",
                    error.getMessage());

            assertFalse(error.getMessage().contains(
                    "private upstream detail"));

            assertEquals(1, transport.requests.size());
        }
    }

    @Test
    void invalidCursorStopsBeforeNextRequest() {
        var json = JsonMapper.builder().build();

        String[] invalidCursors = {
                "null",
                "123",
                "{}",
                "[]",
                json.writeValueAsString("a".repeat(8193))
        };

        for (String cursor : invalidCursors) {
            var transport = new FakeTransport();

            transport.pages.add(
                    "{\"tools\":[],\"nextCursor\":" + cursor + "}");

            expectFailure(transport, "mcp_invalid_tools_cursor");

            assertEquals(1, transport.requests.size());
        }
    }

    @Test
    void stopsAtPageLimitWithoutSendingRequest101() {
        var transport = new FakeTransport();

        for (int pageIndex = 0; pageIndex < 100; pageIndex++) {
            transport.pages.add(page("", "cursor-" + pageIndex));
        }

        expectFailure(transport, "mcp_tools_page_limit_exceeded");

        assertEquals(100, transport.requests.size());
    }

    @Test
    void finalPageAtPageLimitCanStillSucceed() {
        var transport = new FakeTransport();

        for (int pageIndex = 0; pageIndex < 99; pageIndex++) {
            transport.pages.add(page("", "cursor-" + pageIndex));
        }

        transport.pages.add(page(TOOL_A, null));

        var tools = new AiMcpToolDiscovery(transport)
                .discover(session(true));

        assertEquals(100, transport.requests.size());
        assertEquals(1, tools.size());
        assertEquals("calculator.add", tools.getFirst().name());
    }

    @Test
    void accepts2000ToolsButRejects2001WithoutContinuing() {
        var accepted = new FakeTransport();
        accepted.pages.add(toolsPage(2000));

        var tools = new AiMcpToolDiscovery(accepted)
                .discover(session(true));

        assertEquals(2000, tools.size());
        assertEquals(1, accepted.requests.size());

        var rejected = new FakeTransport();
        rejected.pages.add(toolsPage(2001));

        expectFailure(rejected, "mcp_tools_limit_exceeded");

        assertEquals(1, rejected.requests.size());
    }
}
