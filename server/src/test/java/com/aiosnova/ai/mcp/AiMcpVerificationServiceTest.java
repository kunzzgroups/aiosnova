package com.aiosnova.ai.mcp;

import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

class AiMcpVerificationServiceTest {

    private static final String COMPANY = "company-j1";
    private static final String MERCHANT = "merchant-acme";
    private static final String SERVER = "server-test";

    private record State(
            long version,
            long revision,
            String status,
            Long verifiedRevision,
            boolean checked,
            String errorCode) {
    }

    private static final class MemoryRepository extends AiMcpRepository {

        State state = new State(
                4L, 2L, "verified", 2L, true, null);

        int registrations;
        int completions;

        MemoryRepository() {
            super(new JdbcTemplate());
        }

        private boolean matchesScope(
                String company, String merchant, String server) {

            return COMPANY.equals(company)
                    && MERCHANT.equals(merchant)
                    && SERVER.equals(server);
        }

        private void requireTransaction() {
            assertTrue(TransactionSynchronizationManager
                    .isActualTransactionActive());
        }

        @Override
        public Optional<ServerRow> findServerForUpdate(
                String company, String merchant, String server) {

            requireTransaction();

            if (!matchesScope(company, merchant, server)) {
                return Optional.empty();
            }

            return Optional.of(new ServerRow(
                    SERVER, COMPANY, MERCHANT,
                    "Test MCP", "", "http://127.0.0.1:9090/mcp",
                    "streamable_http", "2025-11-25", "none",
                    false, 30, state.revision(), state.status(),
                    state.verifiedRevision(), state.version()));
        }

        @Override
        public int beginVerification(
                String company, String merchant, String server,
                long expectedVersion, long expectedRevision) {

            requireTransaction();

            if (!matchesScope(company, merchant, server)
                    || state.version() != expectedVersion
                    || state.revision() != expectedRevision) {
                return 0;
            }

            registrations++;

            state = new State(
                    expectedVersion + 1,
                    expectedRevision,
                    "not_verified",
                    null,
                    false,
                    null);

            return 1;
        }

        @Override
        public int completeVerification(
                String company, String merchant, String server,
                long registeredVersion, long expectedRevision,
                boolean verified) {

            requireTransaction();
            completions++;

            if (!matchesScope(company, merchant, server)
                    || state.version() != registeredVersion
                    || state.revision() != expectedRevision
                    || !"not_verified".equals(state.status())
                    || state.verifiedRevision() != null
                    || state.checked()) {
                return 0;
            }

            state = new State(
                    registeredVersion + 1,
                    expectedRevision,
                    verified ? "verified" : "failed",
                    expectedRevision,
                    true,
                    verified ? null : "mcp_verification_failed");

            return 1;
        }
    }

    private static final class Snapshot {
        State state;
    }

    private static final class MemoryTransactions
            extends AbstractPlatformTransactionManager {

        final MemoryRepository repository;
        int commits;
        int rollbacks;

        MemoryTransactions(MemoryRepository repository) {
            this.repository = repository;
        }

        @Override
        protected Object doGetTransaction() {
            return new Snapshot();
        }

        @Override
        protected void doBegin(
                Object transaction, TransactionDefinition definition) {

            ((Snapshot) transaction).state = repository.state;
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            commits++;
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            repository.state = ((Snapshot) status.getTransaction()).state;
            rollbacks++;
        }
    }

    private static final class FakeTransport implements AiMcpTransport {

        final JsonMapper json = JsonMapper.builder().build();
        boolean failInitialize;
        int requests;
        Runnable duringInitialize = () -> {};

        @Override
        public Response exchange(
                JsonNode message,
                String sessionId,
                String protocolVersion) {

            assertFalse(TransactionSynchronizationManager
                    .isActualTransactionActive());

            requests++;

            if ("notifications/initialized".equals(
                    message.path("method").asString())) {
                return new Response(202, null, null);
            }

            assertEquals(
                    "initialize",
                    message.path("method").asString());

            duringInitialize.run();

            if (failInitialize) {
                return new Response(502, null, null);
            }

            var body = json.createObjectNode();
            body.put("jsonrpc", "2.0");
            body.put("id", message.path("id").asString());

            var result = body.putObject("result");
            result.put(
                    "protocolVersion",
                    AiMcpHandshake.PROTOCOL_VERSION);

            result.putObject("capabilities").putObject("tools");

            var info = result.putObject("serverInfo");
            info.put("name", "mock-verification-mcp");
            info.put("version", "1.0.0");

            return new Response(200, null, body);
        }
    }

    private final MemoryRepository repository = new MemoryRepository();
    private final MemoryTransactions transactions =
            new MemoryTransactions(repository);

    private AiMcpVerificationService service(
            String merchant,
            FakeTransport transport,
            AtomicInteger factoryCalls) {

        return new AiMcpVerificationService(
                repository,
                snapshot -> {
                    assertFalse(TransactionSynchronizationManager
                            .isActualTransactionActive());

                    // 创建 Transport 前，登记必须已提交。
                    assertEquals(1, transactions.commits);
                    assertEquals(5L, repository.state.version());
                    assertEquals("not_verified", repository.state.status());

                    factoryCalls.incrementAndGet();
                    return transport;
                },
                transactions,
                merchant,
                Set.of(COMPANY));
    }

    @Test
    void successfulHandshakeIsSavedUsingTwoSeparateTransactions() {
        var transport = new FakeTransport();
        var factoryCalls = new AtomicInteger();

        var result = service(MERCHANT, transport, factoryCalls)
                .verify(COMPANY, SERVER, 4L);

        assertTrue(result.verified());
        assertEquals(6L, result.version());

        assertEquals(
                new State(6L, 2L, "verified", 2L, true, null),
                repository.state);

        assertEquals(2, transactions.commits);
        assertEquals(0, transactions.rollbacks);
        assertEquals(1, repository.registrations);
        assertEquals(1, repository.completions);
        assertEquals(1, factoryCalls.get());
        assertEquals(2, transport.requests);
    }

    @Test
    void failedHandshakeIsPersistedInsteadOfRollingBackRegistration() {
        var transport = new FakeTransport();
        transport.failInitialize = true;

        var result = service(
                MERCHANT, transport, new AtomicInteger())
                .verify(COMPANY, SERVER, 4L);

        assertFalse(result.verified());

        assertEquals(
                new State(
                        6L, 2L, "failed", 2L, true,
                        "mcp_verification_failed"),
                repository.state);

        assertEquals(2, transactions.commits);
        assertEquals(0, transactions.rollbacks);
        assertEquals(1, transport.requests);
    }

    @Test
    void oldSuccessOrFailureCannotOverwriteNewConnection() {
        for (boolean failHandshake : new boolean[]{false, true}) {
            repository.state = new State(
                    4L, 2L, "verified", 2L, true, null);

            transactions.commits = 0;
            transactions.rollbacks = 0;

            var newConfiguration = new State(
                    6L, 3L, "not_verified", null, false, null);

            var transport = new FakeTransport();
            transport.failInitialize = failHandshake;

            transport.duringInitialize = () -> {
                // 模拟另一个请求已提交连接修改。
                repository.state = newConfiguration;
            };

            var error = assertThrows(
                    ResponseStatusException.class,
                    () -> service(
                            MERCHANT, transport, new AtomicInteger())
                            .verify(COMPANY, SERVER, 4L));

            assertEquals(409, error.getStatusCode().value());

            // 结果保存事务拒绝旧结果，但保留另一个请求的新配置。
            assertEquals(newConfiguration, repository.state);
            assertEquals(1, transactions.commits);
            assertEquals(1, transactions.rollbacks);
        }
    }

    @Test
    void scopeAndStaleVersionAreRejectedBeforeTransportCreation() {
        var transport = new FakeTransport();
        var factoryCalls = new AtomicInteger();
        var service = service(MERCHANT, transport, factoryCalls);

        var otherCompany = assertThrows(
                ResponseStatusException.class,
                () -> service.verify("company-j2", SERVER, 4L));

        assertEquals(403, otherCompany.getStatusCode().value());

        var stale = assertThrows(
                ResponseStatusException.class,
                () -> service.verify(COMPANY, SERVER, 3L));

        assertEquals(409, stale.getStatusCode().value());

        var otherMerchant = assertThrows(
                ResponseStatusException.class,
                () -> service("merchant-other", transport, factoryCalls)
                        .verify(COMPANY, SERVER, 4L));

        assertEquals(404, otherMerchant.getStatusCode().value());

        assertEquals(0, factoryCalls.get());
        assertEquals(0, transport.requests);
        assertEquals(0, repository.registrations);
        assertEquals(4L, repository.state.version());
    }
}
