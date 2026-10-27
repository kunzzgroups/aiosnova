package com.aiosnova.ai.tool;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

public class AiToolReadService {

    public record ToolDetail(
            String id,
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
            JsonNode configuration,
            long version,
            List<String> agentIds) {

        public ToolDetail {
            agentIds = List.copyOf(agentIds);
        }
    }

    private final AiToolRepository repository;
    private final String merchantId;
    private final JsonMapper json = JsonMapper.builder().build();

    public AiToolReadService(
            AiToolRepository repository,
            String merchantId) {

        if (repository == null
                || merchantId == null
                || !merchantId.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new IllegalArgumentException(
                    "Repository and valid Merchant ID are required.");
        }

        this.repository = repository;
        this.merchantId = merchantId;
    }

    public List<ToolDetail> list(String companyId) {
        requireCompany(companyId);

        return repository.findTools(companyId, merchantId)
                .stream()
                .map(tool -> detail(companyId, tool))
                .toList();
    }

    public ToolDetail get(String companyId, String toolId) {
        requireCompany(companyId);

        if (toolId == null
                || !toolId.matches("[A-Za-z0-9_-]{1,128}")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid tool ID.");
        }

        var tool = repository.findTools(companyId, merchantId)
                .stream()
                .filter(item -> toolId.equals(item.id()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Tool not found in this company."));

        return detail(companyId, tool);
    }

    private void requireCompany(String companyId) {
        if (companyId == null
                || !companyId.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid company ID.");
        }

        if (!repository.companyExistsInMerchant(
                companyId, merchantId)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Company is outside this Merchant scope.");
        }
    }

    private ToolDetail detail(
            String companyId,
            AiToolRepository.ToolRow tool) {

        if (!companyId.equals(tool.companyId())) {
            throw new IllegalStateException("Tool scope mismatch.");
        }

        var configuration = json.readTree(tool.configuration());

        if (configuration == null || !configuration.isObject()) {
            throw new IllegalStateException(
                    "Stored tool configuration is invalid.");
        }

        return new ToolDetail(
                tool.id(),
                tool.companyId(),
                tool.name(),
                tool.description(),
                tool.module(),
                tool.action(),
                tool.executorType(),
                tool.risk(),
                tool.status(),
                tool.timeoutSeconds(),
                tool.requiresConfirmation(),
                configuration,
                tool.version(),
                repository.findBoundAgentIds(
                        companyId, tool.id()));
    }
}