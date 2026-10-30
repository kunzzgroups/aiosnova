package com.aiosnova.ai.mcp;

import java.util.Base64;
import java.util.Optional;
import java.util.Set;

import com.aiosnova.ai.provider.AiApiKeyCrypto;

import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class AiMcpWriteServiceTest {

    private static final String COMPANY = "company-j1";
    private static final String MERCHANT = "merchant-acme";
    private static final String ENDPOINT = "http://127.0.0.1:9090/mcp";

    // 仅用于模拟测试，不读取真实环境密钥。
    private final AiApiKeyCrypto crypto = new AiApiKeyCrypto(
            Base64.getEncoder().encodeToString(new byte[32]));

    private static final class MemoryRepository extends AiMcpRepository {

        ServerRow row;
        String secret;
        ServerEdit lastEdit;

        boolean failInsert;
        boolean failUpdate;
        boolean rejectUpdate;

        MemoryRepository() {
            super(new JdbcTemplate());
        }

        @Override
        public int insertServer(NewServer value) {
            row = new ServerRow(
                    value.id(),
                    value.companyId(),
                    value.merchantId(),
                    value.name(),
                    value.description(),
                    value.endpointUrl(),
                    "streamable_http",
                    "2025-11-25",
                    value.authType(),
                    false,
                    value.timeoutSeconds(),
                    0L,
                    "not_verified",
                    null,
                    0L);

            secret = value.secretCiphertext();

            if (failInsert) {
                throw new DataIntegrityViolationException(
                        "Simulated insert failure.");
            }

            return 1;
        }

        @Override
        public Optional<ServerRow> findServerForUpdate(
                String company,
                String merchant,
                String id) {

            return row != null
                    && company.equals(row.companyId())
                    && merchant.equals(row.merchantId())
                    && id.equals(row.id())
                    ? Optional.of(row)
                    : Optional.empty();
        }

        @Override
        public int updateServer(
                String company,
                String merchant,
                String id,
                long expectedVersion,
                ServerEdit edit) {

            if (rejectUpdate
                    || findServerForUpdate(company, merchant, id).isEmpty()
                    || row.version() != expectedVersion) {
                return 0;
            }

            lastEdit = edit;

            if (edit.replaceSecret()) {
                secret = edit.secretCiphertext();
            }

            row = new ServerRow(
                    row.id(),
                    row.companyId(),
                    row.merchantId(),
                    edit.name(),
                    edit.description(),
                    edit.endpointUrl(),
                    row.transport(),
                    row.protocolVersion(),
                    edit.authType(),
                    row.enabled(),
                    edit.timeoutSeconds(),
                    row.connectionRevision()
                            + (edit.connectionChanged() ? 1 : 0),
                    edit.connectionChanged()
                            ? "not_verified"
                            : row.verificationStatus(),
                    edit.connectionChanged()
                            ? null
                            : row.verificationRevision(),
                    row.version() + 1);

            if (failUpdate) {
                throw new DataIntegrityViolationException(
                        "Simulated update failure.");
            }

            return 1;
        }

        void markVerified() {
            row = new ServerRow(
                    row.id(),
                    row.companyId(),
                    row.merchantId(),
                    row.name(),
                    row.description(),
                    row.endpointUrl(),
                    row.transport(),
                    row.protocolVersion(),
                    row.authType(),
                    row.enabled(),
                    row.timeoutSeconds(),
                    row.connectionRevision(),
                    "verified",
                    row.connectionRevision(),
                    row.version());
        }
    }

    private static final class Snapshot {
        AiMcpRepository.ServerRow row;
        String secret;
        AiMcpRepository.ServerEdit lastEdit;
    }

    private static final class MemoryTransactions
            extends AbstractPlatformTransactionManager {

        private final MemoryRepository repository;

        MemoryTransactions(MemoryRepository repository) {
            this.repository = repository;
        }

        @Override
        protected Object doGetTransaction() {
            return new Snapshot();
        }

        @Override
        protected void doBegin(
                Object transaction,
                TransactionDefinition definition) {

            var snapshot = (Snapshot) transaction;

            snapshot.row = repository.row;
            snapshot.secret = repository.secret;
            snapshot.lastEdit = repository.lastEdit;
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            var snapshot = (Snapshot) status.getTransaction();

            repository.row = snapshot.row;
            repository.secret = snapshot.secret;
            repository.lastEdit = snapshot.lastEdit;
        }
    }

    private final MemoryRepository repository = new MemoryRepository();

    private AiMcpWriteService serviceFor(String merchant) {
        var target = new AiMcpWriteService(
                repository,
                crypto,
                merchant,
                Set.of(COMPANY));

        var proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);

        var transactions = new TransactionInterceptor();
        transactions.setTransactionManager(
                new MemoryTransactions(repository));
        transactions.setTransactionAttributeSource(
                new AnnotationTransactionAttributeSource());

        proxy.addAdvice(transactions);

        return (AiMcpWriteService) proxy.getProxy();
    }

    private final AiMcpWriteService service = serviceFor(MERCHANT);

    private AiMcpWriteService.SaveRequest request(
            String company,
            String name,
            String endpoint,
            String auth,
            String key,
            int timeout) {

        return new AiMcpWriteService.SaveRequest(
                company,
                name,
                "Test description",
                endpoint,
                auth,
                key,
                timeout);
    }

    private AiMcpWriteService.SaveRequest basicRequest() {
        return request(
                COMPANY, "Local MCP", ENDPOINT, "none", null, 30);
    }

    private void expectStatus(int status, Runnable action) {
        var error = assertThrows(
                ResponseStatusException.class, action::run);

        assertEquals(status, error.getStatusCode().value());
    }

    private String decryptSecret(String company, String id) {
        String[] parts = repository.secret.split(":", 2);

        return crypto.decrypt(
                company,
                "mcp:" + id,
                parts[0],
                Base64.getDecoder().decode(parts[1]));
    }

    @Test
    void createsDisabledUnverifiedServer() {
        var saved = service.create(basicRequest());

        assertEquals(saved.id(), repository.row.id());
        assertEquals(0L, saved.version());
        assertEquals(COMPANY, repository.row.companyId());
        assertEquals(MERCHANT, repository.row.merchantId());
        assertFalse(repository.row.enabled());
        assertEquals("not_verified", repository.row.verificationStatus());
        assertNull(repository.row.verificationRevision());
        assertEquals(0L, repository.row.connectionRevision());
        assertNull(repository.secret);
    }

    @Test
    void encryptsKeyWithCompanyAndMcpServerContext() {
        String testKey = "mock-key-for-test-only";

        var input = request(
                COMPANY, "Key MCP", ENDPOINT, "api_key", testKey, 30);

        var saved = service.create(input);

        assertNotNull(repository.secret);
        assertFalse(repository.secret.contains(testKey));
        assertEquals(testKey, decryptSecret(COMPANY, saved.id()));
        assertFalse(input.toString().contains(testKey));

        assertThrows(IllegalStateException.class,
                () -> decryptSecret("company-j2", saved.id()));

        assertThrows(IllegalStateException.class,
                () -> decryptSecret(COMPANY, "another-server"));
    }

    @Test
    void nameDescriptionAndTimeoutEditsPreserveVerificationAndKey() {
        var saved = service.create(request(
                COMPANY, "Original", ENDPOINT,
                "api_key", "mock-original-key", 30));

        repository.markVerified();
        String oldSecret = repository.secret;

        var edited = service.update(
                saved.id(),
                0L,
                new AiMcpWriteService.SaveRequest(
                        COMPANY,
                        "Renamed",
                        "Changed description",
                        ENDPOINT,
                        "api_key",
                        "",
                        60));

        assertEquals(1L, edited.version());
        assertEquals("Renamed", repository.row.name());
        assertEquals("Changed description", repository.row.description());
        assertEquals(60, repository.row.timeoutSeconds());

        assertFalse(repository.lastEdit.connectionChanged());
        assertFalse(repository.lastEdit.replaceSecret());
        assertEquals(oldSecret, repository.secret);
        assertEquals("verified", repository.row.verificationStatus());
        assertEquals(Long.valueOf(0L), repository.row.verificationRevision());
        assertEquals(0L, repository.row.connectionRevision());
    }

    @Test
    void endpointAndKeyChangesInvalidateVerification() {
        var saved = service.create(request(
                COMPANY, "MCP", ENDPOINT,
                "api_key", "mock-old-key", 30));

        repository.markVerified();

        service.update(
                saved.id(),
                0L,
                request(
                        COMPANY, "MCP", ENDPOINT + "/new",
                        "api_key", "", 30));

        assertTrue(repository.lastEdit.connectionChanged());
        assertFalse(repository.lastEdit.replaceSecret());
        assertEquals("not_verified", repository.row.verificationStatus());
        assertNull(repository.row.verificationRevision());
        assertEquals(1L, repository.row.connectionRevision());
        assertEquals("mock-old-key", decryptSecret(COMPANY, saved.id()));

        repository.markVerified();

        service.update(
                saved.id(),
                1L,
                request(
                        COMPANY, "MCP", ENDPOINT + "/new",
                        "api_key", "mock-new-key", 30));

        assertTrue(repository.lastEdit.connectionChanged());
        assertTrue(repository.lastEdit.replaceSecret());
        assertEquals("mock-new-key", decryptSecret(COMPANY, saved.id()));
        assertEquals("not_verified", repository.row.verificationStatus());
        assertNull(repository.row.verificationRevision());
        assertEquals(2L, repository.row.connectionRevision());
        assertEquals(2L, repository.row.version());
    }

    @Test
    void authenticationChangesRequireKeyOrClearExistingKey() {
        var saved = service.create(basicRequest());

        expectStatus(400, () -> service.update(
                saved.id(), 0L,
                request(COMPANY, "MCP", ENDPOINT, "api_key", "", 30)));

        assertEquals(0L, repository.row.version());

        service.update(
                saved.id(), 0L,
                request(
                        COMPANY, "MCP", ENDPOINT,
                        "api_key", "mock-auth-key", 30));

        assertEquals("api_key", repository.row.authType());
        assertNotNull(repository.secret);

        repository.markVerified();

        service.update(
                saved.id(), 1L,
                request(COMPANY, "MCP", ENDPOINT, "none", null, 30));

        assertEquals("none", repository.row.authType());
        assertNull(repository.secret);
        assertTrue(repository.lastEdit.replaceSecret());
        assertTrue(repository.lastEdit.connectionChanged());
        assertEquals("not_verified", repository.row.verificationStatus());
        assertEquals(2L, repository.row.connectionRevision());
    }

    @Test
    void staleVersionAndConditionalUpdateFailureReturnConflict() {
        var saved = service.create(basicRequest());
        var original = repository.row;

        expectStatus(409, () -> service.update(
                saved.id(), 10L, basicRequest()));

        assertEquals(original, repository.row);

        repository.rejectUpdate = true;

        expectStatus(409, () -> service.update(
                saved.id(), 0L, basicRequest()));

        assertEquals(original, repository.row);
    }

    @Test
    void companyAndMerchantScopesRejectOtherRecords() {
        expectStatus(403, () -> service.create(
                request(
                        "company-j2", "MCP", ENDPOINT,
                        "none", null, 30)));

        assertNull(repository.row);

        var saved = service.create(basicRequest());
        var original = repository.row;

        expectStatus(403, () -> service.update(
                saved.id(), 0L,
                request(
                        "company-j2", "MCP", ENDPOINT,
                        "none", null, 30)));

        var otherMerchant = serviceFor("merchant-other");

        expectStatus(404, () -> otherMerchant.update(
                saved.id(), 0L, basicRequest()));

        expectStatus(404, () -> service.update(
                "missing-server", 0L, basicRequest()));

        assertEquals(original, repository.row);
    }

    @Test
    void failuresRollBackNewAndExistingServerState() {
        repository.failInsert = true;

        assertThrows(DataIntegrityViolationException.class,
                () -> service.create(basicRequest()));

        assertNull(repository.row);
        assertNull(repository.secret);

        repository.failInsert = false;

        var saved = service.create(request(
                COMPANY, "Original", ENDPOINT,
                "api_key", "mock-original-key", 30));

        repository.markVerified();

        var original = repository.row;
        String originalSecret = repository.secret;

        repository.failUpdate = true;

        assertThrows(DataIntegrityViolationException.class,
                () -> service.update(
                        saved.id(), 0L,
                        request(
                                COMPANY, "Changed", ENDPOINT + "/changed",
                                "api_key", "mock-replacement-key", 60)));

        assertEquals(original, repository.row);
        assertEquals(originalSecret, repository.secret);
        assertEquals("verified", repository.row.verificationStatus());
        assertEquals(0L, repository.row.version());
        assertNull(repository.lastEdit);
    }

    @Test
    void directInvocationWithoutTransactionIsRejected() {
        var direct = new AiMcpWriteService(
                repository, crypto, MERCHANT, Set.of(COMPANY));

        assertThrows(IllegalStateException.class,
                () -> direct.create(basicRequest()));

        assertThrows(IllegalStateException.class,
                () -> direct.update(
                        "missing-server", 0L, basicRequest()));

        assertNull(repository.row);
    }
}
