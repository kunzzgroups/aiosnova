package com.aiosnova.ai.mcp;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

public class AiMcpToolDiscovery {

    // 本地实现的保护上限，不是 MCP 协议规定的页大小。
    private static final int MAX_PAGES = 100;
    private static final int MAX_TOOLS = 2000;

    public record DiscoveredTool(
            String name,
            String description,
            String inputSchema) {
    }

    private final AiMcpTransport transport;
    private final JsonMapper json = JsonMapper.builder().build();

    public AiMcpToolDiscovery(AiMcpTransport transport) {
        this.transport = Objects.requireNonNull(transport);
    }

    public List<DiscoveredTool> discover(
            AiMcpHandshake.Session session) {

        if (session == null
                || !AiMcpHandshake.PROTOCOL_VERSION.equals(
                        session.protocolVersion())) {
            throw failure("mcp_invalid_session");
        }

        if (!session.supportsTools()) {
            throw failure("mcp_tools_not_supported");
        }

        var collected = new ArrayList<DiscoveredTool>();
        var names = new HashSet<String>();
        var cursors = new HashSet<String>();

        String cursor = null;

        for (int page = 0; page < MAX_PAGES; page++) {
            String requestId = UUID.randomUUID().toString();

            var request = json.createObjectNode();
            request.put("jsonrpc", "2.0");
            request.put("id", requestId);
            request.put("method", "tools/list");

            var params = request.putObject("params");

            if (cursor != null) {
                params.put("cursor", cursor);
            }

            var response = transport.exchange(
                    request,
                    session.sessionId(),
                    session.protocolVersion());

            if (response == null || response.httpStatus() != 200) {
                throw failure("mcp_tools_list_http_error");
            }

            // 不接受发现过程中突然切换到另一个 Session。
            if (response.sessionId() != null
                    && !response.sessionId().equals(session.sessionId())) {
                throw failure("mcp_session_changed");
            }

            JsonNode body = response.body();

            if (body == null
                    || !body.isObject()
                    || !"2.0".equals(body.path("jsonrpc").asString())
                    || !body.path("id").isString()
                    || !requestId.equals(body.path("id").asString())
                    || body.has("error")
                    || !body.path("result").isObject()) {
                throw failure("mcp_invalid_tools_list_response");
            }

            JsonNode result = body.path("result");
            JsonNode tools = result.path("tools");

            if (!tools.isArray()) {
                throw failure("mcp_invalid_tools_list_response");
            }

            for (JsonNode tool : tools) {
                if (collected.size() >= MAX_TOOLS) {
                    throw failure("mcp_tools_limit_exceeded");
                }

                var parsed = parseTool(tool);

                // 名称区分大小写，不做 trim 或改名。
                if (!names.add(parsed.name())) {
                    throw failure("mcp_duplicate_tool_name");
                }

                collected.add(parsed);
            }

            if (!result.has("nextCursor")) {
                // 只有全部页面成功，才交出完整目录。
                return List.copyOf(collected);
            }

            JsonNode next = result.path("nextCursor");

            if (!next.isString() || next.asString().length() > 8192) {
                throw failure("mcp_invalid_tools_cursor");
            }

            cursor = next.asString();

            if (!cursors.add(cursor)) {
                throw failure("mcp_repeated_tools_cursor");
            }
        }

        throw failure("mcp_tools_page_limit_exceeded");
    }

    private DiscoveredTool parseTool(JsonNode tool) {
        if (!tool.isObject()
                || !tool.path("name").isString()) {
            throw failure("mcp_invalid_tool_definition");
        }

        String name = tool.path("name").asString();

        if (name.isBlank()
                || name.codePointCount(0, name.length()) > 255
                || name.chars().anyMatch(Character::isISOControl)) {
            throw failure("mcp_invalid_tool_definition");
        }

        String description = "";

        if (tool.has("description")) {
            if (!tool.path("description").isString()) {
                throw failure("mcp_invalid_tool_definition");
            }

            description = tool.path("description").asString();
        }

        if (description.getBytes(StandardCharsets.UTF_8).length > 60000) {
            throw failure("mcp_invalid_tool_definition");
        }

        JsonNode schema = tool.path("inputSchema");

        if (!schema.isObject()) {
            throw failure("mcp_invalid_tool_definition");
        }

        return new DiscoveredTool(
                name,
                description,
                json.writeValueAsString(schema));
    }

    private static IllegalStateException failure(String code) {
        return new IllegalStateException(code);
    }
}
