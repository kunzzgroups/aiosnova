package com.aiosnova.ai.mcp;

import java.util.List;
import java.util.Objects;

public class AiMcpDiscoveryService {

    public record DiscoveryResult(
            AiMcpHandshake.Session session,
            List<AiMcpToolDiscovery.DiscoveredTool> tools) {

        public DiscoveryResult {
            Objects.requireNonNull(session);
            tools = List.copyOf(tools);
        }
    }

    private final AiMcpHandshake handshake;
    private final AiMcpToolDiscovery discovery;

    public AiMcpDiscoveryService(AiMcpTransport transport) {
        Objects.requireNonNull(transport);

        // 两个组件接收同一个 Transport 实例。
        this.handshake = new AiMcpHandshake(transport);
        this.discovery = new AiMcpToolDiscovery(transport);
    }

    public DiscoveryResult discover() {
        var session = handshake.initialize();
        var tools = discovery.discover(session);

        // 只有握手和全部分页成功后，才返回结果。
        return new DiscoveryResult(session, tools);
    }
}