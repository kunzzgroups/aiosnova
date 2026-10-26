package com.aiosnova.ai;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.HashSet;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AiAgentService {
    private final AiAgentRepository repository;

    public AiAgentService(AiAgentRepository repository) {
        this.repository = repository;
    }

    public record ModelBinding(String providerId, String modelConfigId) {}
    public record ModelConfig(ModelBinding binding, String provider, String model,
            double temperature, double topP, int maxTokens) {}
    public record AgentItem(String id, String companyId, String merchantId,
            String name, String description, String category, String status,
            ModelConfig model, long version, LocalDateTime createdAt,
            LocalDateTime updatedAt, List<String> knowledgeBaseIds, int knowledgeBaseCount) {}
    public record AgentDetail(AgentItem agent, List<String> knowledgeBaseIds) {}

    /**
     * Internal persistence entry point, not an HTTP create API.
     * Before exposing writes, validate model/base ownership against trusted catalogs.
     */
    @Transactional(rollbackFor = Exception.class)
    public AgentDetail saveNew(AiAgentRepository.NewAgent input, List<String> knowledgeBaseIds) {
        if (input == null || knowledgeBaseIds == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Agent and knowledge base IDs are required.");
        }
        String company = validateCompanyId(input.companyId());
        String id = requiredId(input.id(), "Agent ID", 128);
        String merchant = requiredId(input.merchantId(), "Merchant ID", 64);
        String name = requiredText(input.name(), "Agent name", 255);
        String category = requiredText(input.category(), "Category", 100);
        String status = input.status();
        if (!List.of("active", "draft", "disabled").contains(status == null ? "" : status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Agent status.");
        }
        if (!Double.isFinite(input.temperature()) || input.temperature() < 0 || input.temperature() > 2
                || !Double.isFinite(input.topP()) || input.topP() <= 0 || input.topP() > 1
                || input.maxTokens() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Agent model parameters.");
        }
        String provider = input.providerId();
        String model = input.modelConfigId();
        if ((provider == null) != (model == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provider and model configuration IDs must be supplied together.");
        }
        if (provider != null) {
            provider = requiredId(provider, "Provider ID", 36);
            model = requiredId(model, "Model configuration ID", 36);
        }
        if (knowledgeBaseIds.size() > 1000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Too many knowledge base bindings.");
        }
        var ids = new ArrayList<String>();
        var seen = new HashSet<String>();
        for (String value : knowledgeBaseIds) {
            String baseId = requiredId(value, "Knowledge base ID", 128);
            if (!seen.add(baseId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Duplicate knowledge base ID.");
            }
            ids.add(baseId);
        }
        if (!"active".equals(status) && !ids.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only active agents can have knowledge base bindings.");
        }

        repository.insert(new AiAgentRepository.NewAgent(id, company, merchant, name,
                input.description() == null ? "" : input.description(), category, status,
                provider, model, input.temperature(), input.topP(), input.maxTokens()));
        repository.insertKnowledgeBaseBindings(company, id, ids);
        // Reload inside this transaction. Any failure here also rolls back both tables.
        return get(company, id);
    }

    private String requiredText(String value, String label, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty() || normalized.length() > maxLength) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid " + label + ".");
        }
        return normalized;
    }

    private String requiredId(String value, String label, int maxLength) {
        String normalized = requiredText(value, label, maxLength);
        if (!normalized.matches("[A-Za-z0-9_-]+")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid " + label + ".");
        }
        return normalized;
    }

    @Transactional(readOnly = true)
    public List<AgentItem> list(String companyId) {
        String company = validateCompanyId(companyId);
        var agents = repository.findByCompany(company);
        if (agents.isEmpty()) return List.of();

        var bindings = new HashMap<String, List<String>>();
        for (var binding : repository.findBindingsByCompany(company)) {
            bindings.computeIfAbsent(binding.agentId(), key -> new ArrayList<>())
                    .add(binding.knowledgeBaseId());
        }
        return agents.stream()
                .map(agent -> toItem(agent, bindings.getOrDefault(agent.id(), List.of())))
                .toList();
    }

    @Transactional(readOnly = true)
    public AgentDetail get(String companyId, String agentId) {
        String company = validateCompanyId(companyId);
        String id = agentId == null ? "" : agentId.trim();
        if (!id.matches("[A-Za-z0-9_-]{1,128}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Agent ID.");
        }
        var agent = repository.findById(company, id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Agent not found in this company."));
        var ids = List.copyOf(repository.findKnowledgeBaseIds(company, id));
        return new AgentDetail(toItem(agent, ids), ids);
    }

    private AgentItem toItem(AiAgentRepository.AgentSummary agent, List<String> ids) {
        var baseIds = List.copyOf(ids);
        var binding = agent.modelConfigId() == null ? null
                : new ModelBinding(agent.providerId(), agent.modelConfigId());
        // Exact binding is authoritative. Never substitute a missing model.
        var model = new ModelConfig(binding, "auto", "", agent.temperature(),
                agent.topP(), agent.maxTokens());
        return new AgentItem(agent.id(), agent.companyId(), agent.merchantId(),
                agent.name(), agent.description(), agent.category(), agent.status(),
                model, agent.version(), agent.createdAt(), agent.updatedAt(), baseIds, baseIds.size());
    }

    private String validateCompanyId(String companyId) {
        String company = companyId == null ? "" : companyId.trim();
        if (!company.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid company ID.");
        }
        return company;
    }
}
