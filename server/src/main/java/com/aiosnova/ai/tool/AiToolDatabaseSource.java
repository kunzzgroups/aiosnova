package com.aiosnova.ai.tool;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import tools.jackson.databind.json.JsonMapper;

public final class AiToolDatabaseSource
        implements AiToolAuthorizationService.Source {

    private final AiToolRepository repository;
    private final String merchantId;
    private final JsonMapper json = JsonMapper.builder().build();

    public AiToolDatabaseSource(
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

    @Override
    public Optional<AiToolAuthorizationService.AgentGrant> findAgent(
            String companyId,
            String agentId) {

        requireId(companyId, 64);
        requireId(agentId, 128);

        return repository.findAgent(
                companyId, merchantId, agentId)
                .map(agent -> {
                    if (!companyId.equals(agent.companyId())
                            || !merchantId.equals(agent.merchantId())
                            || !agentId.equals(agent.agentId())) {
                        throw new IllegalStateException(
                                "Agent scope mismatch.");
                    }

                    return new AiToolAuthorizationService.AgentGrant(
                            companyId,
                            agentId,
                            "active".equals(agent.status()),
                            Set.copyOf(repository.findBoundActions(
                                    companyId,
                                    merchantId,
                                    agentId)));
                });
    }

    @Override
    public List<AiToolAuthorizationService.ToolState> findTools(
            String companyId) {

        requireId(companyId, 64);

        return repository.findTools(companyId, merchantId)
                .stream()
                .map(tool -> {
                    if (!companyId.equals(tool.companyId())) {
                        throw new IllegalStateException(
                                "Tool scope mismatch.");
                    }

                    return new AiToolAuthorizationService.ToolState(
                            tool.action(),
                            executableCalculator(tool));
                })
                .toList();
    }

    private boolean executableCalculator(
            AiToolRepository.ToolRow tool) {

        if (!"active".equals(tool.status())
                || !"calc.run".equals(tool.action())
                || !"calculator".equals(tool.executorType())
                || !"low".equals(tool.risk())
                || tool.requiresConfirmation()
                || tool.timeoutSeconds() != 30) {
            return false;
        }

        if (tool.configuration() == null) {
            return false;
        }

        try {
            var configuration = json.readTree(tool.configuration());

            // Calculator currently has no configuration options.
            return configuration != null
                    && configuration.isObject()
                    && configuration.size() == 0;

        } catch (RuntimeException error) {
            return false;
        }
    }

    private static void requireId(
            String value,
            int maxLength) {

        if (value == null
                || value.isBlank()
                || value.length() > maxLength
                || !value.matches("[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException(
                    "Invalid scope ID.");
        }
    }
}