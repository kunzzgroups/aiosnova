package com.aiosnova.ai.mcp;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Optional;
import java.util.Set;

import com.aiosnova.ai.provider.AiApiKeyCrypto;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/** Real service and Spring transaction proxy; in-memory storage only. */
class AiMcpManagementWriteControllerTest {
    private static final String COMPANY = "company-j1";
    private static final String MERCHANT = "merchant-acme";

    private static final class MemoryRepository extends AiMcpRepository {
        NewServer server;
        long version;
        int writes;

        MemoryRepository() { super(new JdbcTemplate()); }

        @Override
        public int insertServer(NewServer value) {
            server = value;
            version = 0;
            writes++;
            return 1;
        }

        @Override
        public Optional<ServerRow> findServerForUpdate(String company, String merchant, String id) {
            if (server == null || !company.equals(server.companyId())
                    || !merchant.equals(server.merchantId()) || !id.equals(server.id())) {
                return Optional.empty();
            }
            return Optional.of(new ServerRow(server.id(), server.companyId(), server.merchantId(),
                    server.name(), server.description(), server.endpointUrl(), "streamable_http",
                    "2025-11-25", server.authType(), false, server.timeoutSeconds(),
                    0L, "not_verified", null, version));
        }

        @Override
        public int updateServer(String company, String merchant, String id,
                long expectedVersion, ServerEdit edit) {
            if (findServerForUpdate(company, merchant, id).isEmpty() || version != expectedVersion) {
                return 0;
            }
            server = new NewServer(id, company, merchant, edit.name(), edit.description(),
                    edit.endpointUrl(), edit.authType(), edit.replaceSecret()
                            ? edit.secretCiphertext() : server.secretCiphertext(), edit.timeoutSeconds());
            version++;
            writes++;
            return 1;
        }
    }

    private static final class Snapshot {
        AiMcpRepository.NewServer server;
        long version;
        int writes;
    }

    private static final class MemoryTransactions extends AbstractPlatformTransactionManager {
        private final MemoryRepository repository;
        MemoryTransactions(MemoryRepository repository) { this.repository = repository; }
        @Override protected Object doGetTransaction() { return new Snapshot(); }
        @Override protected void doBegin(Object transaction, TransactionDefinition definition) {
            var snapshot = (Snapshot) transaction;
            snapshot.server = repository.server;
            snapshot.version = repository.version;
            snapshot.writes = repository.writes;
        }
        @Override protected void doCommit(DefaultTransactionStatus status) { }
        @Override protected void doRollback(DefaultTransactionStatus status) {
            var snapshot = (Snapshot) status.getTransaction();
            repository.server = snapshot.server;
            repository.version = snapshot.version;
            repository.writes = snapshot.writes;
        }
    }

    private final MemoryRepository repository = new MemoryRepository();

    private MockMvc mvc(String merchant) {
        var crypto = new AiApiKeyCrypto(Base64.getEncoder().encodeToString(new byte[32]));
        var proxy = new ProxyFactory(new AiMcpWriteService(repository, crypto, merchant, Set.of(COMPANY)));
        proxy.setProxyTargetClass(true);
        var interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(new MemoryTransactions(repository));
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        proxy.addAdvice(interceptor);
        return MockMvcBuilders.standaloneSetup(new AiMcpManagementController(
                new AiMcpReadService(repository, merchant), (AiMcpWriteService) proxy.getProxy())).build();
    }

    private String request(String company, Long version) {
        return """
                {"companyId":"%s", "name":"API MCP", "description":"Mock API test",
                 "endpointUrl":"http://127.0.0.1:9090/mcp", "authType":"none",
                 "timeoutSeconds":30, "version":%s}
                """.formatted(company, version);
    }

    private JsonNode body(MvcResult result) {
        return new JsonMapper().readTree(new String(result.getResponse().getContentAsByteArray(),
                StandardCharsets.UTF_8));
    }

    private String create(MockMvc mvc) throws Exception {
        var result = mvc.perform(post("/api/ai/mcp/servers").contentType("application/json")
                .content(request(COMPANY, null))).andReturn();
        assertEquals(201, result.getResponse().getStatus());
        assertEquals(0L, body(result).path("version").asLong());
        return body(result).path("id").asString();
    }

    @Test
    void createsAndEditsServerThroughRealService() throws Exception {
        var mvc = mvc(MERCHANT);
        String id = create(mvc);
        var result = mvc.perform(patch("/api/ai/mcp/servers/{id}", id).contentType("application/json")
                .content(request(COMPANY, 0L))).andReturn();
        assertEquals(200, result.getResponse().getStatus());
        assertEquals(id, body(result).path("id").asString());
        assertEquals(1L, body(result).path("version").asLong());
        assertEquals(MERCHANT, repository.server.merchantId());
        assertEquals(2, repository.writes);
        assertFalse(body(result).has("apiKey"));
        assertFalse(body(result).has("secretCiphertext"));
    }

    @Test
    void staleVersionReturnsConflictWithoutAnotherWrite() throws Exception {
        var mvc = mvc(MERCHANT);
        String id = create(mvc);
        var result = mvc.perform(patch("/api/ai/mcp/servers/{id}", id).contentType("application/json")
                .content(request(COMPANY, 9L))).andReturn();
        assertEquals(409, result.getResponse().getStatus());
        assertEquals(1, repository.writes);
        assertEquals(0L, repository.version);
    }

    @Test
    void companyAndMerchantCannotEditOtherScope() throws Exception {
        var mvc = mvc(MERCHANT);
        String id = create(mvc);
        var deniedCreate = mvc.perform(post("/api/ai/mcp/servers").contentType("application/json")
                .content(request("company-j2", null))).andReturn();
        assertEquals(403, deniedCreate.getResponse().getStatus());
        var deniedEdit = mvc.perform(patch("/api/ai/mcp/servers/{id}", id).contentType("application/json")
                .content(request("company-j2", 0L))).andReturn();
        assertEquals(403, deniedEdit.getResponse().getStatus());
        var hidden = mvc("merchant-other").perform(patch("/api/ai/mcp/servers/{id}", id)
                .contentType("application/json").content(request(COMPANY, 0L))).andReturn();
        assertEquals(404, hidden.getResponse().getStatus());
        assertEquals(1, repository.writes);
    }

    @Test
    void missingVersionAndTimeoutReturnBadRequest() throws Exception {
        var mvc = mvc(MERCHANT);
        String id = create(mvc);
        var missingVersion = mvc.perform(patch("/api/ai/mcp/servers/{id}", id)
                .contentType("application/json").content(request(COMPANY, null))).andReturn();
        assertEquals(400, missingVersion.getResponse().getStatus());
        var missingTimeout = mvc.perform(post("/api/ai/mcp/servers").contentType("application/json")
                .content(request(COMPANY, null).replace("\"timeoutSeconds\":30", "\"timeoutSeconds\":null")))
                .andReturn();
        assertEquals(400, missingTimeout.getResponse().getStatus());
        assertEquals(1, repository.writes);
    }
}
