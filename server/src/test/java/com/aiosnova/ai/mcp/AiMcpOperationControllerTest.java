package com.aiosnova.ai.mcp;

import java.nio.charset.StandardCharsets;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Controller contracts only; service authorization/transactions have separate integration tests. */
class AiMcpOperationControllerTest {
    private static final String COMPANY = "company-j1";
    private static final String MERCHANT = "merchant-acme";
    private static final String SERVER = "server-test";
    private static final AiMcpDiscoverySyncService.TransportFactory NO_NETWORK = server -> {
        throw new AssertionError("No network is allowed.");
    };

    private static final class NoopTransactions extends AbstractPlatformTransactionManager {
        @Override protected Object doGetTransaction() { return new Object(); }
        @Override protected void doBegin(Object transaction, TransactionDefinition definition) { }
        @Override protected void doCommit(DefaultTransactionStatus status) { }
        @Override protected void doRollback(DefaultTransactionStatus status) { }
    }

    private static final class VerificationStub extends AiMcpVerificationService {
        int calls;
        String company;
        String server;
        long version;
        RuntimeException failure;

        VerificationStub(AiMcpRepository repository) {
            super(repository, NO_NETWORK, new NoopTransactions(), MERCHANT, Set.of(COMPANY));
        }

        @Override
        public VerificationResult verify(String companyId, String serverId, long expectedVersion) {
            calls++;
            company = companyId;
            server = serverId;
            version = expectedVersion;
            if (failure != null) throw failure;
            return new VerificationResult(serverId, expectedVersion + 2, true);
        }
    }

    private static final class DiscoveryStub extends AiMcpDiscoverySyncService {
        int calls;
        String company;
        String server;
        long version;
        RuntimeException failure;

        DiscoveryStub(AiMcpRepository repository) {
            super(repository, new AiMcpCatalogSyncService(repository, MERCHANT, Set.of(COMPANY)),
                    NO_NETWORK, MERCHANT, Set.of(COMPANY));
        }

        @Override
        public AiMcpCatalogSyncService.SyncResult discoverAndSync(
                String companyId, String serverId, long expectedVersion) {
            calls++;
            company = companyId;
            server = serverId;
            version = expectedVersion;
            if (failure != null) throw failure;
            return new AiMcpCatalogSyncService.SyncResult(serverId, expectedVersion + 1, 2, 1, 0);
        }
    }

    private final AiMcpRepository repository = new AiMcpRepository(new JdbcTemplate());
    private final VerificationStub verification = new VerificationStub(repository);
    private final DiscoveryStub discovery = new DiscoveryStub(repository);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new AiMcpManagementController(
            new AiMcpReadService(repository, MERCHANT), null, verification, discovery)).build();

    private MvcResult call(String operation, Long version) throws Exception {
        return mvc.perform(post("/api/ai/mcp/servers/{id}/{operation}", SERVER, operation)
                .contentType("application/json")
                .content("""
                        {"companyId":"company-j1","version":%s}
                        """.formatted(version))).andReturn();
    }

    private JsonNode body(MvcResult result) {
        return new JsonMapper().readTree(new String(result.getResponse().getContentAsByteArray(),
                StandardCharsets.UTF_8));
    }

    @Test
    void verifyForwardsCompanyServerAndVersion() throws Exception {
        var result = call("verify", 4L);
        assertEquals(200, result.getResponse().getStatus());
        assertTrue(body(result).path("verified").asBoolean());
        assertEquals(6L, body(result).path("version").asLong());
        assertEquals(1, verification.calls);
        assertEquals(COMPANY, verification.company);
        assertEquals(SERVER, verification.server);
        assertEquals(4L, verification.version);
        assertEquals(0, discovery.calls);
    }

    @Test
    void discoveryReturnsSyncCounts() throws Exception {
        var result = call("discover", 6L);
        assertEquals(200, result.getResponse().getStatus());
        assertEquals(7L, body(result).path("version").asLong());
        assertEquals(2, body(result).path("added").asInt());
        assertEquals(1, body(result).path("updated").asInt());
        assertEquals(1, discovery.calls);
        assertEquals(COMPANY, discovery.company);
        assertEquals(SERVER, discovery.server);
        assertEquals(6L, discovery.version);
        assertEquals(0, verification.calls);
    }

    @Test
    void missingOrNegativeVersionIsRejectedBeforeService() throws Exception {
        for (Long version : new Long[]{null, -1L}) {
            assertEquals(400, call("verify", version).getResponse().getStatus());
            assertEquals(400, call("discover", version).getResponse().getStatus());
        }
        assertEquals(0, verification.calls);
        assertEquals(0, discovery.calls);
    }

    @Test
    void scopeAndConflictErrorsKeepTheirHttpStatus() throws Exception {
        for (HttpStatus status : new HttpStatus[]{HttpStatus.FORBIDDEN,
                HttpStatus.NOT_FOUND, HttpStatus.CONFLICT}) {
            verification.failure = new ResponseStatusException(status, "Rejected.");
            discovery.failure = new ResponseStatusException(status, "Rejected.");
            assertEquals(status.value(), call("verify", 4L).getResponse().getStatus());
            assertEquals(status.value(), call("discover", 4L).getResponse().getStatus());
        }
    }

    @Test
    void discoveryFailureReturnsSafeBadGateway() throws Exception {
        discovery.failure = new IllegalStateException("private-upstream-detail");
        var result = call("discover", 4L);
        assertEquals(502, result.getResponse().getStatus());
        assertEquals("mcp_operation_failed", body(result).path("code").asString());
        assertFalse(new String(result.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8)
                .contains("private-upstream-detail"));
    }
}
