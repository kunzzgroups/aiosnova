package com.aiosnova.ai.mcp;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

class AiMcpDiscoverySyncServiceTest {

    private static final String COMPANY = "company-j1";
    private static final String MERCHANT = "merchant-acme";
    private static final String SERVER = "server-test";

    private final AiMcpCatalogSyncServiceTest.MemoryRepository repository =
            new AiMcpCatalogSyncServiceTest.MemoryRepository();

    private static final class FakeTransport implements AiMcpTransport {

        final JsonMapper json = JsonMapper.builder().build();

        int requests;
        int pages;
        boolean failSecondPage;
        Runnable afterFirstPage = () -> {};

        @Override
        public Response exchange(
                JsonNode message,
                String sessionId,
                String protocolVersion) {

            // 整个网络过程不能持有数据库事务。
            assertFalse(TransactionSynchronizationManager
                    .isActualTransactionActive());

            requests++;

            String method = message.path("method").asString();

            if ("notifications/initialized".equals(method)) {
                assertEquals("session-sync-test", sessionId);
                assertEquals(
                        AiMcpHandshake.PROTOCOL_VERSION,
                        protocolVersion);

                return new Response(202, null, null);
            }

            var body = json.createObjectNode();
            body.put("jsonrpc", "2.0");
            body.put("id", message.path("id").asString());

            var result = body.putObject("result");

            if ("initialize".equals(method)) {
                assertNull(sessionId);
                assertNull(protocolVersion);

                result.put(
                        "protocolVersion",
                        AiMcpHandshake.PROTOCOL_VERSION);

                result.putObject("capabilities").putObject("tools");

                var info = result.putObject("serverInfo");
                info.put("name", "sync-test-mcp");
                info.put("version", "1.0.0");

                return new Response(200, "session-sync-test", body);
            }

            assertEquals("tools/list", method);
            assertEquals("session-sync-test", sessionId);
            assertEquals(
                    AiMcpHandshake.PROTOCOL_VERSION,
                    protocolVersion);

            pages++;

            if (pages == 2 && failSecondPage) {
                return new Response(502, null, null);
            }

            var tool = result.putArray("tools").addObject();
            tool.put(
                    "name",
                    pages == 1
                            ? "calculator.add"
                            : "calculator.subtract");

            tool.putObject("inputSchema").put("type", "object");

            if (pages == 1) {
                assertFalse(message.path("params").has("cursor"));
                result.put("nextCursor", "page-two");
                afterFirstPage.run();
            } else {
                assertEquals(2, pages);
                assertEquals(
                        "page-two",
                        message.path("params").path("cursor").asString());
            }

            return new Response(200, null, body);
        }
    }

    private AiMcpCatalogSyncService transactionalSync() {
        var proxy = new ProxyFactory(
                new AiMcpCatalogSyncService(
                        repository, MERCHANT, Set.of(COMPANY)));

        proxy.setProxyTargetClass(true);

        var transactions = new TransactionInterceptor();
        transactions.setTransactionManager(
                new AiMcpCatalogSyncServiceTest.MemoryTransactions(
                        repository));

        transactions.setTransactionAttributeSource(
                new AnnotationTransactionAttributeSource());

        proxy.addAdvice(transactions);

        return (AiMcpCatalogSyncService) proxy.getProxy();
    }

    private AiMcpDiscoverySyncService coordinator(
            FakeTransport transport,
            AtomicInteger factoryCalls) {

        return new AiMcpDiscoverySyncService(
                repository,
                transactionalSync(),
                snapshot -> {
                    assertFalse(TransactionSynchronizationManager
                            .isActualTransactionActive());

                    assertEquals(COMPANY, snapshot.companyId());
                    assertEquals(MERCHANT, snapshot.merchantId());
                    assertEquals(SERVER, snapshot.id());
                    assertEquals(4L, snapshot.version());
                    assertEquals(2L, snapshot.connectionRevision());

                    factoryCalls.incrementAndGet();
                    return transport;
                },
                MERCHANT,
                Set.of(COMPANY));
    }

    @Test
    void completeDiscoveryThenSavesInSeparateTransaction() {
        var transport = new FakeTransport();
        var factoryCalls = new AtomicInteger();

        transport.afterFirstPage = () -> {
            // 第一页返回时，任何目录都还没保存。
            assertTrue(repository.tools.isEmpty());
            assertEquals(4L, repository.serverVersion);
        };

        var result = coordinator(transport, factoryCalls)
                .discoverAndSync(COMPANY, SERVER, 4L);

        assertEquals(1, factoryCalls.get());
        assertEquals(4, transport.requests);
        assertEquals(2, result.added());
        assertEquals(2, repository.tools.size());
        assertEquals(5L, repository.serverVersion);

        assertTrue(repository.tools.values().stream()
                .noneMatch(AiMcpRepository.CatalogToolRow::enabled));
    }

    @Test
    void secondPageNetworkFailureDoesNotSavePartialDirectory() {
        var transport = new FakeTransport();
        transport.failSecondPage = true;

        var factoryCalls = new AtomicInteger();
        var originalBindings = Map.copyOf(repository.bindings);

        var error = assertThrows(
                IllegalStateException.class,
                () -> coordinator(transport, factoryCalls)
                        .discoverAndSync(COMPANY, SERVER, 4L));

        assertEquals("mcp_tools_list_http_error", error.getMessage());
        assertEquals(4, transport.requests);
        assertEquals(1, factoryCalls.get());

        assertTrue(repository.tools.isEmpty());
        assertEquals(4L, repository.serverVersion);
        assertEquals(originalBindings, repository.bindings);
    }

    @Test
    void connectionChangedDuringDiscoveryRejectsOldResult() {
        var transport = new FakeTransport();
        var factoryCalls = new AtomicInteger();

        transport.afterFirstPage = () -> {
            // 模拟另一个请求已提交连接修改。
            repository.serverVersion = 5L;
            repository.connectionRevision = 3L;
            repository.verified = false;
        };

        var error = assertThrows(
                ResponseStatusException.class,
                () -> coordinator(transport, factoryCalls)
                        .discoverAndSync(COMPANY, SERVER, 4L));

        assertEquals(409, error.getStatusCode().value());

        assertEquals(4, transport.requests);
        assertTrue(repository.tools.isEmpty());

        // 拒绝旧结果，但不能回滚另一个请求已经提交的新配置。
        assertEquals(5L, repository.serverVersion);
        assertEquals(3L, repository.connectionRevision);
        assertFalse(repository.verified);

        assertEquals(
                List.of("hr-agent"),
                repository.bindings.get("existing-tool"));
    }

    @Test
    void unauthorizedCompanyAndStaleVersionStopBeforeTransportCreation() {
        var transport = new FakeTransport();
        var factoryCalls = new AtomicInteger();
        var coordinator = coordinator(transport, factoryCalls);

        var denied = assertThrows(
                ResponseStatusException.class,
                () -> coordinator.discoverAndSync(
                        "company-j2", SERVER, 4L));

        assertEquals(403, denied.getStatusCode().value());

        var stale = assertThrows(
                ResponseStatusException.class,
                () -> coordinator.discoverAndSync(
                        COMPANY, SERVER, 3L));

        assertEquals(409, stale.getStatusCode().value());

        assertEquals(0, factoryCalls.get());
        assertEquals(0, transport.requests);
        assertTrue(repository.tools.isEmpty());
    }
}
