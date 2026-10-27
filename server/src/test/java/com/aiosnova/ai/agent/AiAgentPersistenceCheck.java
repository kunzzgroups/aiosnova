package com.aiosnova.ai.agent;

import java.time.LocalDateTime;
import java.util.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;

/** Real Spring transaction boundary, simulated persistence; no live database or model calls. */
public class AiAgentPersistenceCheck {
    static class Store extends AiAgentRepository {
        final Map<String, AgentSummary> rows = new HashMap<>();
        final Map<String, List<String>> links = new HashMap<>();
        boolean failBindings;
        int clearedOverrides;
        Store() { super(null); }
        void transaction() { if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new AssertionError("No transaction"); }
        AgentSummary row(NewAgent agent, long version, LocalDateTime created) {
            return new AgentSummary(agent.id(), agent.companyId(), agent.merchantId(), agent.name(), agent.description(), agent.category(), agent.status(),
                    agent.providerId(), agent.modelConfigId(), agent.temperature(), agent.topP(), agent.maxTokens(), version, created, LocalDateTime.now());
        }
        @Override public void insert(NewAgent agent) { transaction(); rows.put(agent.id(), row(agent, 0, LocalDateTime.now())); }
        @Override public Optional<AgentSummary> findById(String company, String id) { return Optional.ofNullable(rows.get(id)).filter(agent -> agent.companyId().equals(company)); }
        @Override public Optional<AgentSummary> findForUpdate(String company, String id) { transaction(); return findById(company, id); }
        @Override public List<AgentSummary> findByCompany(String company) { return rows.values().stream().filter(agent -> agent.companyId().equals(company)).toList(); }
        @Override public List<String> findKnowledgeBaseIds(String company, String id) { return links.getOrDefault(id, List.of()); }
        @Override public List<KnowledgeBaseBinding> findBindingsByCompany(String company) {
            var result = new ArrayList<KnowledgeBaseBinding>();
            findByCompany(company).forEach(agent -> links.getOrDefault(agent.id(), List.of()).forEach(base -> result.add(new KnowledgeBaseBinding(agent.id(), base))));
            return result;
        }
        @Override public void insertKnowledgeBaseBindings(String company, String id, List<String> ids) {
            transaction(); if (failBindings) throw new IllegalStateException("Binding write failed"); links.put(id, List.copyOf(ids));
        }
        @Override public void clearKnowledgeBaseBindings(String company, String id) { transaction(); links.remove(id); }
        @Override public void clearDocumentOverrides(String company, String id) { transaction(); clearedOverrides++; }
        @Override public int updateConfiguration(NewAgent agent, long version) {
            transaction(); var old = rows.get(agent.id());
            if (old == null || old.version() != version) return 0;
            rows.put(agent.id(), row(agent, version + 1, old.createdAt())); return 1;
        }
        @Override public int delete(String company, String id, long version) {
            transaction(); var old = findById(company, id);
            if (old.isEmpty() || old.get().version() != version) return 0;
            rows.remove(id); links.remove(id); return 1;
        }
    }
    static class Catalog extends JdbcTemplate {
        boolean modelEnabled = true;
        @Override public List<Map<String, Object>> queryForList(String sql, Object... args) {
            if (!sql.contains("FROM ai_models") || !Arrays.asList(args).equals(List.of("company-j1", "provider-a", "model-a"))) return List.of();
            return List.of(Map.of("status", modelEnabled ? "enabled" : "disabled", "capability_chat", true,
                    "capability_vision", false, "capability_tool_calling", false, "capabilities_checked_at", "checked", "enabled", true, "has_key", true));
        }
        @Override @SuppressWarnings("unchecked") public <T> T queryForObject(String sql, Class<T> type, Object... args) {
            return (T) Integer.valueOf(Arrays.asList(args).equals(List.of("company-j1", "merchant-test", "kb-saved")) ? 1 : 0);
        }
    }
    record Snapshot(Map<String, AiAgentRepository.AgentSummary> rows, Map<String, List<String>> links, int cleared) {}
    static class Transactions extends AbstractPlatformTransactionManager {
        final Store store;
        Transactions(Store store) { this.store = store; }
        @Override protected Object doGetTransaction() { return new Snapshot(Map.copyOf(store.rows), Map.copyOf(store.links), store.clearedOverrides); }
        @Override protected void doBegin(Object transaction, TransactionDefinition definition) {}
        @Override protected void doCommit(DefaultTransactionStatus status) {}
        @Override protected void doRollback(DefaultTransactionStatus status) {
            var old = (Snapshot) status.getTransaction(); store.rows.clear(); store.rows.putAll(old.rows()); store.links.clear(); store.links.putAll(old.links()); store.clearedOverrides = old.cleared();
        }
    }
    @Configuration @EnableTransactionManagement(proxyTargetClass = true)
    static class ConfigurationForCheck {
        final Catalog catalog = new Catalog();
        @Bean Store repository() { return new Store(); }
        @Bean Transactions transactionManager(Store store) { return new Transactions(store); }
        @Bean AiAgentWriteService service(Store store) { return new AiAgentWriteService(store, new AiAgentService(store), catalog, "merchant-test"); }
    }
    public static void main(String[] args) {
        try (var context = new AnnotationConfigApplicationContext(ConfigurationForCheck.class)) {
            var service = context.getBean(AiAgentWriteService.class); var store = context.getBean(Store.class);
            var reads = new AiAgentService(store); var catalog = context.getBean(ConfigurationForCheck.class).catalog;
            var auto = service.create(new AiAgentWriteService.CreateRequest("company-j1", "New Agent", "", null, "active", null, List.of()));
            check(auto.model().binding() == null && auto.model().temperature() == 0.3 && auto.version() == 0, "Create defaults incorrect");
            check(reads.get("company-j1", auto.id()).agent().equals(auto), "Fresh read lost Agent");
            var model = new AiAgentService.ModelConfig(new AiAgentService.ModelBinding("provider-a", "model-a"), "auto", "test/external", 0.8, 0.9, 4096);
            var fixed = service.create(new AiAgentWriteService.CreateRequest("company-j1", "Fixed", "", null, "active", model, List.of("kb-saved")));
            var edited = service.update(fixed.id(), new AiAgentWriteService.UpdateRequest("company-j1", 0L, "Renamed", null, null, null, model, null));
            check(edited.version() == 1 && edited.model().temperature() == 0.8 && edited.model().topP() == 0.9
                    && edited.model().maxTokens() == 4096 && edited.knowledgeBaseIds().equals(List.of("kb-saved")), "Model/bindings lost");
            check(new AiAgentService(store).get("company-j1", fixed.id()).agent().equals(edited), "Fresh service did not read saved model");
            expect(() -> service.update(fixed.id(), new AiAgentWriteService.UpdateRequest("company-j1", 0L, "Stale", null, null, null, null, null)), 409);
            check(reads.get("company-j1", fixed.id()).agent().name().equals("Renamed"), "Stale write changed data");
            expect(() -> service.update(fixed.id(), new AiAgentWriteService.UpdateRequest("company-j2", 1L, "Wrong company", null, null, null, null, null)), 404);
            expect(() -> service.create(new AiAgentWriteService.CreateRequest("company-j1", "Bad KB", "", null, "active", null, List.of("kb-mock"))), 400);
            expect(() -> service.create(new AiAgentWriteService.CreateRequest("company-j2", "Wrong model company", "", null, "active", model, List.of())), 400);
            catalog.modelEnabled = false;
            expect(() -> service.create(new AiAgentWriteService.CreateRequest("company-j1", "Disabled model", "", null, "active", model, List.of())), 409);
            catalog.modelEnabled = true;
            int size = store.rows.size(); store.failBindings = true;
            try { service.create(new AiAgentWriteService.CreateRequest("company-j1", "Rollback", "", null, "active", model, List.of("kb-saved"))); throw new AssertionError("Expected binding failure"); }
            catch (IllegalStateException expected) { check(store.rows.size() == size, "Create did not roll back"); }
            store.failBindings = false;
            var disabled = service.update(fixed.id(), new AiAgentWriteService.UpdateRequest("company-j1", 1L, null, null, null, "disabled", null, List.of()));
            check(disabled.knowledgeBaseCount() == 0 && store.clearedOverrides == 1, "Inactive assignment cleanup missing");
            expect(() -> service.delete("company-j1", fixed.id(), 1L), 409);
            service.delete("company-j1", fixed.id(), disabled.version());
            check(store.findById("company-j1", fixed.id()).isEmpty(), "Delete did not persist");
            System.out.println("PASS: Agent create/edit/fresh reads, model parameters/UUID, unchanged KB preservation, old versions, company/model validation, binding rollback and status/delete. Simulated storage only.");
        }
    }
    static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    static void expect(Runnable action, int code) {
        try { action.run(); throw new AssertionError("Expected HTTP " + code); }
        catch (ResponseStatusException error) { check(error.getStatusCode().value() == code, "Wrong status"); }
    }
}
