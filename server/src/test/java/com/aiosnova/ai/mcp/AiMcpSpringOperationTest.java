package com.aiosnova.ai.mcp;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.aiosnova.ai.provider.AiApiKeyCrypto;

import org.junit.jupiter.api.Test;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

class AiMcpSpringOperationTest {

    private static final String COMPANY = "company-j1";
    private static final String MERCHANT = "merchant-acme";
    private static final String SERVER = "server-test";

    private static final class Repository
            extends AiMcpCatalogSyncServiceTest.MemoryRepository {

        boolean verificationChecked;
        Long verificationRevision;
        String verificationError;

        Repository() {
            verified = false;

            tools.put("existing-tool", new CatalogToolRow(
                    "existing-tool",
                    COMPANY,
                    SERVER,
                    "calculator.add",
                    "Description",
                    "{\"type\":\"object\"}",
                    true,
                    true,
                    2L,
                    7L));
        }

        private Optional<ServerRow> snapshot(
                String company, String merchant, String server) {

            if (!COMPANY.equals(company)
                    || !MERCHANT.equals(merchant)
                    || !SERVER.equals(server)) {
                return Optional.empty();
            }

            String status = !verificationChecked
                    ? "not_verified"
                    : verified ? "verified" : "failed";

            return Optional.of(new ServerRow(
                    SERVER, COMPANY, MERCHANT,
                    "Spring test MCP", "",
                    "http://127.0.0.1:9090/mcp",
                    "streamable_http", "2025-11-25", "none",
                    false, 30, connectionRevision,
                    status, verificationRevision, serverVersion));
        }

        @Override
        public Optional<ServerRow> findServer(
                String company, String merchant, String server) {

            assertFalse(TransactionSynchronizationManager
                    .isActualTransactionActive());

            return snapshot(company, merchant, server);
        }

        @Override
        public Optional<ServerRow> findServerForUpdate(
                String company, String merchant, String server) {

            assertTrue(TransactionSynchronizationManager
                    .isActualTransactionActive());

            return snapshot(company, merchant, server);
        }

        @Override
        public int beginVerification(
                String company, String merchant, String server,
                long expectedVersion, long expectedRevision) {

            if (findServerForUpdate(company, merchant, server).isEmpty()
                    || serverVersion != expectedVersion
                    || connectionRevision != expectedRevision) {
                return 0;
            }

            serverVersion++;
            verified = false;
            verificationChecked = false;
            verificationRevision = null;
            verificationError = null;

            return 1;
        }

        @Override
        public int completeVerification(
                String company, String merchant, String server,
                long registeredVersion, long expectedRevision,
                boolean outcome) {

            if (findServerForUpdate(company, merchant, server).isEmpty()
                    || serverVersion != registeredVersion
                    || connectionRevision != expectedRevision
                    || verificationChecked
                    || verificationRevision != null) {
                return 0;
            }

            serverVersion++;
            verified = outcome;
            verificationChecked = true;
            verificationRevision = expectedRevision;
            verificationError = outcome
                    ? null : "mcp_verification_failed";

            return 1;
        }
    }

    private static final class Snapshot {
        long version;
        boolean verified;
        boolean checked;
        Long verificationRevision;
        String error;
        Map<String, AiMcpRepository.CatalogToolRow> tools;
        Map<String, List<String>> bindings;
    }

    private static final class Transactions
            extends AbstractPlatformTransactionManager {

        final Repository repository;

        Transactions(Repository repository) {
            this.repository = repository;
        }

        @Override
        protected Object doGetTransaction() {
            return new Snapshot();
        }

        @Override
        protected void doBegin(
                Object transaction, TransactionDefinition definition) {

            var snapshot = (Snapshot) transaction;

            snapshot.version = repository.serverVersion;
            snapshot.verified = repository.verified;
            snapshot.checked = repository.verificationChecked;
            snapshot.verificationRevision = repository.verificationRevision;
            snapshot.error = repository.verificationError;
            snapshot.tools = new LinkedHashMap<>(repository.tools);
            snapshot.bindings = new LinkedHashMap<>(repository.bindings);
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            var snapshot = (Snapshot) status.getTransaction();

            repository.serverVersion = snapshot.version;
            repository.verified = snapshot.verified;
            repository.verificationChecked = snapshot.checked;
            repository.verificationRevision = snapshot.verificationRevision;
            repository.verificationError = snapshot.error;
            repository.tools = snapshot.tools;
            repository.bindings = snapshot.bindings;
        }
    }

    private static final class SimulatedFactory
            implements AiMcpDiscoverySyncService.TransportFactory {

        final JsonMapper json = JsonMapper.builder().build();
        final List<String> methods = new ArrayList<>();

        int creations;
        boolean failInitialize;
        boolean failSecondPage;

        @Override
        public AiMcpTransport create(AiMcpRepository.ServerRow server) {
            assertFalse(TransactionSynchronizationManager
                    .isActualTransactionActive());

            assertEquals(COMPANY, server.companyId());
            assertEquals(MERCHANT, server.merchantId());
            assertEquals(SERVER, server.id());

            creations++;

            String session = "spring-session-" + creations;
            int[] page = {0};

            return (request, sessionId, protocolVersion) -> {
                assertFalse(TransactionSynchronizationManager
                        .isActualTransactionActive());

                String method = request.path("method").asString();
                methods.add(method);

                if ("initialize".equals(method)) {
                    assertNull(sessionId);
                    assertNull(protocolVersion);

                    if (failInitialize) {
                        return new AiMcpTransport.Response(502, null, null);
                    }
                } else {
                    assertEquals(session, sessionId);
                    assertEquals(
                            AiMcpHandshake.PROTOCOL_VERSION,
                            protocolVersion);
                }

                if ("notifications/initialized".equals(method)) {
                    return new AiMcpTransport.Response(202, null, null);
                }

                var body = json.createObjectNode();
                body.put("jsonrpc", "2.0");
                body.put("id", request.path("id").asString());

                var result = body.putObject("result");

                if ("initialize".equals(method)) {
                    result.put(
                            "protocolVersion",
                            AiMcpHandshake.PROTOCOL_VERSION);

                    result.putObject("capabilities").putObject("tools");

                    var info = result.putObject("serverInfo");
                    info.put("name", "spring-mock-mcp");
                    info.put("version", "1.0.0");

                    return new AiMcpTransport.Response(200, session, body);
                }

                assertEquals("tools/list", method);
                page[0]++;

                if (page[0] == 2 && failSecondPage) {
                    return new AiMcpTransport.Response(502, null, null);
                }

                var tool = result.putArray("tools").addObject();
                tool.put(
                        "name",
                        page[0] == 1
                                ? "calculator.add"
                                : "calculator.subtract");
                tool.put("description", "Description");
                tool.putObject("inputSchema").put("type", "object");

                if (page[0] == 1) {
                    assertFalse(request.path("params").has("cursor"));
                    result.put("nextCursor", "page-two");
                } else {
                    assertEquals(2, page[0]);
                    assertEquals(
                            "page-two",
                            request.path("params").path("cursor").asString());
                }

                return new AiMcpTransport.Response(200, null, body);
            };
        }
    }

    private static final class Fixture implements AutoCloseable {

        final Repository repository = new Repository();
        final SimulatedFactory factory = new SimulatedFactory();

        final AnnotationConfigApplicationContext context =
                new AnnotationConfigApplicationContext();

        final MockMvc mvc;

        Fixture() {
            context.getEnvironment().setActiveProfiles("ai-standalone");

            context.getEnvironment().getPropertySources().addFirst(
                    new MapPropertySource("mcp-spring-test", Map.of(
                            "ai.mcp.management.enabled", "true",
                            "server.address", "127.0.0.1",
                            "ai.agents.merchant-id", MERCHANT,
                            "ai.mcp.management.writable-companies", COMPANY)));

            context.registerBean(
                    JdbcTemplate.class,
                    () -> new AiMcpManagementConfigurationTest.MetadataJdbc(
                            "jdbc:mysql://127.0.0.1:3307/aiosnova_ai_local"));

            // 真正配置类仍会创建 Repository；
            // 业务 Service 优先使用此内存 Repository。
            context.registerBean(
                    "memoryMcpRepository",
                    AiMcpRepository.class,
                    () -> repository,
                    definition -> definition.setPrimary(true));

            context.registerBean(
                    AiApiKeyCrypto.class,
                    () -> new AiApiKeyCrypto(
                            Base64.getEncoder().encodeToString(new byte[32])));

            context.registerBean(
                    PlatformTransactionManager.class,
                    () -> new Transactions(repository));

            // 必须在配置类之前注册，替换默认 HTTP Transport 工厂。
            context.registerBean(
                    AiMcpDiscoverySyncService.TransportFactory.class,
                    () -> factory);

            context.register(AiMcpManagementConfiguration.class);
            context.refresh();

            assertSame(factory, context.getBean(
                    AiMcpDiscoverySyncService.TransportFactory.class));

            assertTrue(AopUtils.isAopProxy(
                    context.getBean(AiMcpCatalogSyncService.class)));

            assertEquals(0, factory.creations);

            mvc = MockMvcBuilders.standaloneSetup(
                    context.getBean(AiMcpManagementController.class))
                    .build();
        }

        MvcResult operation(
                String operation,
                String company,
                long version) throws Exception {

            return mvc.perform(
                    post("/api/ai/mcp/servers/{id}/{operation}",
                            SERVER, operation)
                            .contentType("application/json")
                            .content("""
                                    {"companyId":"%s","version":%d}
                                    """.formatted(company, version)))
                    .andReturn();
        }

        JsonNode body(MvcResult result) {
            return new JsonMapper().readTree(new String(
                    result.getResponse().getContentAsByteArray(),
                    StandardCharsets.UTF_8));
        }

        void verifySuccessfully() throws Exception {
            var result = operation("verify", COMPANY, 4L);

            assertEquals(200, result.getResponse().getStatus());
            assertTrue(body(result).path("verified").asBoolean());
            assertEquals(6L, body(result).path("version").asLong());
        }

        @Override
        public void close() {
            context.close();
        }
    }

    @Test
    void springInterfacesVerifyThenDiscoverAndPreserveBindings() throws Exception {
        try (var fixture = new Fixture()) {
            fixture.verifySuccessfully();

            var result = fixture.operation("discover", COMPANY, 6L);

            assertEquals(200, result.getResponse().getStatus());
            assertEquals(7L, fixture.body(result).path("version").asLong());
            assertEquals(1, fixture.body(result).path("added").asInt());
            assertEquals(1, fixture.body(result).path("updated").asInt());

            assertEquals(2, fixture.factory.creations);
            assertEquals(6, fixture.factory.methods.size());

            var existing = fixture.repository.tools.get("existing-tool");

            assertTrue(existing.enabled());
            assertEquals("calculator.add", existing.remoteName());
            assertEquals(
                    List.of("hr-agent"),
                    fixture.repository.bindings.get("existing-tool"));

            var added = fixture.repository.tools.values().stream()
                    .filter(tool -> tool.remoteName().equals(
                            "calculator.subtract"))
                    .findFirst().orElseThrow();

            assertFalse(added.enabled());
            assertTrue(added.available());

            var refreshed = fixture.mvc.perform(
                    get("/api/ai/mcp/servers/{id}", SERVER)
                            .param("companyId", COMPANY))
                    .andReturn();

            assertEquals(200, refreshed.getResponse().getStatus());
            assertEquals(
                    "verified",
                    fixture.body(refreshed)
                            .path("verificationStatus").asString());
            assertEquals(
                    7L,
                    fixture.body(refreshed).path("version").asLong());
        }
    }

    @Test
    void discoveryFailureReturns502WithoutChangingStoredCatalog() throws Exception {
        try (var fixture = new Fixture()) {
            fixture.verifySuccessfully();

            var originalTools = Map.copyOf(fixture.repository.tools);
            var originalBindings = Map.copyOf(fixture.repository.bindings);

            fixture.factory.failSecondPage = true;

            var result = fixture.operation("discover", COMPANY, 6L);

            assertEquals(502, result.getResponse().getStatus());
            assertEquals(originalTools, fixture.repository.tools);
            assertEquals(originalBindings, fixture.repository.bindings);
            assertEquals(6L, fixture.repository.serverVersion);
            assertTrue(fixture.repository.verified);
        }
    }

    @Test
    void verificationFailureIsSavedAndDiscoveryIsBlocked() throws Exception {
        try (var fixture = new Fixture()) {
            fixture.factory.failInitialize = true;

            var result = fixture.operation("verify", COMPANY, 4L);

            assertEquals(200, result.getResponse().getStatus());
            assertFalse(fixture.body(result).path("verified").asBoolean());
            assertEquals("mcp_verification_failed",
                    fixture.repository.verificationError);

            assertEquals(6L, fixture.repository.serverVersion);

            var blocked = fixture.operation("discover", COMPANY, 6L);

            assertEquals(409, blocked.getResponse().getStatus());
            assertEquals(1, fixture.factory.creations);
            assertEquals(List.of("initialize"), fixture.factory.methods);
        }
    }

    @Test
    void unauthorizedOrStaleRequestsNeverCreateTransport() throws Exception {
        try (var fixture = new Fixture()) {
            assertEquals(403, fixture.operation(
                    "verify", "company-j2", 4L)
                    .getResponse().getStatus());

            assertEquals(403, fixture.operation(
                    "discover", "company-j2", 4L)
                    .getResponse().getStatus());

            assertEquals(409, fixture.operation(
                    "verify", COMPANY, 3L)
                    .getResponse().getStatus());

            assertEquals(409, fixture.operation(
                    "discover", COMPANY, 4L)
                    .getResponse().getStatus());

            assertEquals(0, fixture.factory.creations);
            assertTrue(fixture.factory.methods.isEmpty());
            assertEquals(4L, fixture.repository.serverVersion);
        }
    }
}