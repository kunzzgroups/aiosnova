package com.aiosnova.ai.mcp;

import tools.jackson.databind.JsonNode;

@FunctionalInterface
public interface AiMcpTransport {

    record Response(
            int httpStatus,
            String sessionId,
            JsonNode body) {
    }

    Response exchange(
            JsonNode message,
            String sessionId,
            String protocolVersion);
}
