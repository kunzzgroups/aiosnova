package com.aiosnova.ai.tool;

import java.util.List;
import java.util.Optional;
import java.util.Set;



public final class AiToolDatabaseSource
        implements AiToolAuthorizationService.Source {

    private final AiToolRepository repository;
    private final String merchantId;


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

    private boolean executableCalculator(AiToolRepository.ToolRow tool) {
        return "active".equals(tool.status())
                && "supported".equals(AiToolExecutionSupport.inspect(tool).state());
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