package com.aiosnova.ai.tool;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

public class AiToolWriteService {

    public record CreateRequest(
            String companyId,
            String name,
            String description,
            String module,
            String action,
            String executorType,
            String risk,
            String status,
            int timeoutSeconds,
            boolean requiresConfirmation,
            String configuration,
            List<String> agentIds) {
    }

    public record SavedTool(
            String id,
            long version,
            List<String> agentIds) {

        public SavedTool {
            agentIds = List.copyOf(agentIds);
        }
    }

    private final AiToolRepository repository;
    private final String merchantId;
    private final JsonMapper json = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .build();

    public AiToolWriteService(
            AiToolRepository repository,
            String merchantId) {

        if (repository == null) {
            throw new IllegalArgumentException(
                    "Tool repository is required.");
        }

        this.repository = repository;
        this.merchantId = id(merchantId, 64, "Merchant");
    }

    @Transactional
    public SavedTool create(CreateRequest request) {
        requireTransaction();

        var validated = validate(request);

        String company = validated.company();
        String name = validated.name();
        String configuration = validated.configuration();
        List<String> agentIds = validated.agentIds();

        requireCompanyScope(company);
        requireActiveAgents(company, agentIds);

        String toolId = UUID.randomUUID().toString();

        repository.insert(new AiToolRepository.NewTool(
                toolId,
                company,
                name,
                request.description(),
                request.module(),
                request.action(),
                request.executorType(),
                request.risk(),
                request.status(),
                request.timeoutSeconds(),
                request.requiresConfirmation(),
                configuration));

        repository.insertAgentBindings(
                company, toolId, agentIds);

        return new SavedTool(toolId, 0L, agentIds);
    }

    @Transactional
    public SavedTool update(
            String toolId,
            long expectedVersion,
            CreateRequest request) {

        requireTransaction();

        var validated = validate(request);

        var existing = lockTool(
                validated.company(),
                toolId,
                expectedVersion);

        if (!existing.action().equals(request.action())
                || !existing.executorType().equals(request.executorType())) {
            throw bad(
                    "Action and executor type cannot be changed by this edit.");
        }

        requireActiveAgents(
                validated.company(),
                validated.agentIds());

        requireUpdated(repository.updateConfiguration(
                new AiToolRepository.NewTool(
                        existing.id(),
                        validated.company(),
                        validated.name(),
                        request.description(),
                        request.module(),
                        request.action(),
                        request.executorType(),
                        request.risk(),
                        request.status(),
                        request.timeoutSeconds(),
                        request.requiresConfirmation(),
                        validated.configuration()),
                expectedVersion));

        repository.clearAgentBindings(
                validated.company(), existing.id());

        repository.insertAgentBindings(
                validated.company(),
                existing.id(),
                validated.agentIds());

        return new SavedTool(
                existing.id(),
                expectedVersion + 1,
                validated.agentIds());
    }

    @Transactional
    public SavedTool setEnabled(
            String companyId,
            String toolId,
            boolean enabled,
            long expectedVersion) {

        var existing = lockTool(
                companyId, toolId, expectedVersion);

        requireUpdated(repository.updateStatus(
                companyId,
                existing.id(),
                enabled ? "active" : "disabled",
                expectedVersion));

        return new SavedTool(
                existing.id(),
                expectedVersion + 1,
                repository.findBoundAgentIds(
                        companyId, existing.id()));
    }

    @Transactional
    public SavedTool replaceAgentBindings(
            String companyId,
            String toolId,
            long expectedVersion,
            List<String> requestedAgentIds) {

        requireTransaction();

        List<String> agentIds = validateAgentIds(requestedAgentIds);

        var existing = lockTool(
                companyId, toolId, expectedVersion);

        requireActiveAgents(companyId, agentIds);

        requireUpdated(repository.advanceVersion(
                companyId,
                existing.id(),
                expectedVersion));

        repository.clearAgentBindings(
                companyId, existing.id());

        repository.insertAgentBindings(
                companyId, existing.id(), agentIds);

        return new SavedTool(
                existing.id(),
                expectedVersion + 1,
                agentIds);
    }

    private Validated validate(CreateRequest request) {
        if (request == null) {
            throw bad("Tool request is required.");
        }

        String company = id(request.companyId(), 64, "company");
        String name = text(request.name(), 255, "name");

        if (request.description() == null
                || request.description().length() > 20000) {
            throw bad("Invalid description.");
        }

        if (request.module() == null
                || !Set.of(
                        "Retrieval", "Utility", "Data",
                        "Communication", "Files").contains(request.module())) {
            throw bad("Invalid tool module.");
        }

        if (request.action() == null
                || request.action().length() > 128
                || !request.action().matches(
                        "[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+")) {
            throw bad("Invalid tool action.");
        }

        if (request.executorType() == null
                || !request.executorType().matches(
                        "[a-z][a-z0-9_]{0,63}")) {
            throw bad("Invalid executor type.");
        }

        if (request.risk() == null
                || !Set.of("low", "medium", "high")
                        .contains(request.risk())) {
            throw bad("Invalid tool risk.");
        }

        if (request.status() == null
                || !Set.of("active", "disabled")
                        .contains(request.status())) {
            throw bad("Tool status must be active or disabled.");
        }

        if (request.timeoutSeconds() < 1
                || request.timeoutSeconds() > 600) {
            throw bad("Timeout must be between 1 and 600 seconds.");
        }

        if ("high".equals(request.risk())
                && !request.requiresConfirmation()) {
            throw bad("High-risk tools must require confirmation.");
        }

        String configuration = configuration(
                request.configuration());

        List<String> agentIds = validateAgentIds(request.agentIds());

        return new Validated(
                company,
                name,
                configuration,
                agentIds);
    }

    private record Validated(
            String company,
            String name,
            String configuration,
            List<String> agentIds) {
    }

    private String configuration(String raw) {
        if (raw == null || raw.length() > 65536) {
            throw bad("Configuration must be a JSON object up to 65536 characters.");
        }

        try {
            var value = json.readTree(raw);

            if (value == null || !value.isObject()) {
                throw bad("Configuration must be a JSON object.");
            }

            return json.writeValueAsString(value);

        } catch (ResponseStatusException error) {
            throw error;
        } catch (RuntimeException error) {
            throw bad("Invalid configuration JSON.");
        }
    }

    private static String id(
            String value,
            int maxLength,
            String label) {

        if (value == null
                || value.length() > maxLength
                || !value.matches("[A-Za-z0-9_-]+")) {
            throw bad("Invalid " + label + " ID.");
        }

        return value;
    }

    private static String text(
            String value,
            int maxLength,
            String label) {

        if (value == null
                || value.isBlank()
                || value.trim().length() > maxLength) {
            throw bad("Invalid tool " + label + ".");
        }

        return value.trim();
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST, message);
    }

    private static void requireTransaction() {
        if (!TransactionSynchronizationManager
                .isActualTransactionActive()) {
            throw new IllegalStateException(
                    "Tool writes require a Spring transaction.");
        }
    }

    private AiToolRepository.LockedTool lockTool(
            String companyId,
            String toolId,
            long expectedVersion) {

        requireTransaction();

        String company = id(companyId, 64, "company");
        String tool = id(toolId, 128, "tool");

        if (expectedVersion < 0
                || expectedVersion == Long.MAX_VALUE) {
            throw bad("Invalid tool version.");
        }

        requireCompanyScope(company);

        var existing = repository.findToolForUpdate(
                company, merchantId, tool)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Tool not found in this company and Merchant."));

        if (existing.version() != expectedVersion) {
            throw conflict();
        }

        return existing;
    }

    private void requireCompanyScope(String company) {
        if (!repository.companyExistsInMerchant(company, merchantId)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Company is outside this Merchant scope.");
        }
    }

    private List<String> validateAgentIds(List<String> values) {
        if (values == null || values.size() > 1000) {
            throw bad("Provide at most 1000 Agent bindings.");
        }

        var seen = new HashSet<String>();

        for (String value : values) {
            String agentId = id(value, 128, "Agent");

            if (!seen.add(agentId)) {
                throw bad("Duplicate Agent binding.");
            }
        }

        return seen.stream().sorted().toList();
    }

    private void requireActiveAgents(
            String company,
            List<String> agentIds) {

        for (String agentId : agentIds) {
            var agent = repository.findAgentForUpdate(
                    company, merchantId, agentId)
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.NOT_FOUND,
                            "Agent not found in this company and Merchant."));

            if (!company.equals(agent.companyId())
                    || !merchantId.equals(agent.merchantId())
                    || !agentId.equals(agent.agentId())) {
                throw new IllegalStateException("Agent scope mismatch.");
            }

            if (!"active".equals(agent.status())) {
                throw bad("Only active Agents can receive tool bindings.");
            }
        }
    }

    private static void requireUpdated(int affected) {
        if (affected != 1) {
            throw conflict();
        }
    }

    private static ResponseStatusException conflict() {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Tool was modified. Reload and try again.");
    }


}