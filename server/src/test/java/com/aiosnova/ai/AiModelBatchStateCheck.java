package com.aiosnova.ai;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.web.server.ResponseStatusException;

/** Verifies batch validation and Spring transaction rollback using fake resources. */
public class AiModelBatchStateCheck {
    private static AiModelRepository.ModelSummary row(String id, boolean known, String status, long version) {
        return row(id, "p", known, status, version);
    }
    private static AiModelRepository.ModelSummary row(String id, String provider, boolean known, String status, long version) {
        return new AiModelRepository.ModelSummary(id, "company-j1", provider, "test/" + id, id, "chat", status, "", 32,
                known ? new ModelCapabilities(true, false, false, 32) : null,
                known ? Instant.parse("2026-01-01T00:00:00Z") : null, known ? null : "Unknown", version);
    }
    private static class Models extends AiModelRepository {
        Map<String, ModelSummary> rows = new HashMap<>();
        String failId;
        Models() { super(new JdbcTemplate()); reset(); }
        void reset() { rows = new HashMap<>(Map.of("a", row("a", true, "disabled", 0), "b", row("b", true, "disabled", 0))); failId = null; }
        @Override public List<ModelSummary> findByProvider(String company, String provider) { return rows.values().stream().filter(item -> item.companyId().equals(company) && item.providerId().equals(provider)).toList(); }
        @Override public int updateEnabled(String company, String provider, String id, boolean enabled, long version) {
            var old = rows.get(id);
            if (id.equals(failId) || old == null || old.version() != version) return 0;
            rows.put(id, row(id, old.providerId(), true, enabled ? "enabled" : "disabled", version + 1));
            return 1;
        }
    }
    private static class Providers extends AiProviderRepository {
        Providers() { super(new JdbcTemplate()); }
        @Override public List<ProviderSummary> findByCompany(String company) {
            return List.of(new ProviderSummary("p", "company-j1", "Test", "openrouter", "https://openrouter.ai/api/v1", true, true, 0), new ProviderSummary("q", "company-j1", "Other", "openrouter", "https://openrouter.ai/api/v1", true, true, 0));
        }
        @Override public boolean lockForModelSync(String company, String provider, long version) { return true; }
    }
    private static class Transactions extends AbstractPlatformTransactionManager {
        final Models models;
        Map<String, AiModelRepository.ModelSummary> before;
        Transactions(Models models) { this.models = models; }
        @Override protected Object doGetTransaction() { return new Object(); }
        @Override protected void doBegin(Object transaction, TransactionDefinition definition) { before = new HashMap<>(models.rows); }
        @Override protected void doCommit(DefaultTransactionStatus status) {}
        @Override protected void doRollback(DefaultTransactionStatus status) { models.rows = before; }
    }
    private static void reject(Runnable operation) {
        try { operation.run(); throw new AssertionError("Expected conflict"); }
        catch (ResponseStatusException error) { if (error.getStatusCode().value() != 409) throw new AssertionError(error); }
    }
    public static void main(String[] args) {
        var models = new Models();
        var interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(new Transactions(models));
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        var factory = new ProxyFactory(new AiModelStateService(models, new Providers()));
        factory.setProxyTargetClass(true);
        factory.addAdvice(interceptor);
        var service = (AiModelStateService) factory.getProxy();
        var targets = List.of(new AiModelRepository.DeleteModelTarget("a", 0), new AiModelRepository.DeleteModelTarget("b", 0));
        if (service.setManyEnabled("company-j1", "p", targets, true) != 2 || models.rows.values().stream().anyMatch(item -> !item.status().equals("enabled")))
            throw new AssertionError("Batch enabling failed");
        reject(() -> service.setManyEnabled("company-j1", "p", targets, false));
        models.reset();
        models.rows.put("b", row("b", false, "disabled", 0));
        reject(() -> service.setManyEnabled("company-j1", "p", targets, true));
        if (!models.rows.get("a").status().equals("disabled")) throw new AssertionError("Unknown capabilities allowed a partial write");
        models.reset(); models.failId = "b";
        reject(() -> service.setManyEnabled("company-j1", "p", targets, true));
        if (models.rows.get("a").version() != 0 || !models.rows.get("a").status().equals("disabled"))
            throw new AssertionError("A later write conflict did not roll back earlier writes");
        models.reset();
        models.rows.put("b", row("b", "q", true, "disabled", 0));
        models.failId = "b";
        var companyTargets = List.of(new AiModelStateService.CompanyModelTarget("p", "a", 0), new AiModelStateService.CompanyModelTarget("q", "b", 0));
        reject(() -> service.setCompanyManyEnabled("company-j1", companyTargets, true));
        if (models.rows.get("a").version() != 0 || !models.rows.get("a").status().equals("disabled"))
            throw new AssertionError("Cross-Provider transaction did not roll back");
        models.failId = null;
        if (service.setCompanyManyEnabled("company-j1", companyTargets, true) != 2)
            throw new AssertionError("Cross-Provider batch enabling failed");
        System.out.println("PASS: batch enabling, stale versions, unknown capabilities, same-Provider and cross-Provider transaction rollback");
    }
}
