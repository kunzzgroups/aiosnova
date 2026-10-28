package com.aiosnova.ai.chat;

import java.util.List;
import java.util.Optional;

import com.aiosnova.ai.tool.AiToolAuthorizationService;

final class AiToolSimulationSource
        implements AiToolAuthorizationService.Source {

    private final AiToolAuthorizationService.Source delegate;
    private final AiToolSimulationCancellation cancellation;
    private final Runnable checkpoint;

    AiToolSimulationSource(
            AiToolAuthorizationService.Source delegate,
            AiToolSimulationCancellation cancellation) {
        this(delegate, cancellation, () -> {});
    }

    AiToolSimulationSource(
            AiToolAuthorizationService.Source delegate,
            AiToolSimulationCancellation cancellation,
            Runnable checkpoint) {
        this.delegate = delegate;
        this.cancellation = cancellation;
        this.checkpoint = checkpoint;
    }

    @Override
    public Optional<AiToolAuthorizationService.AgentGrant> findAgent(
            String companyId,
            String agentId) {

        cancellation.check();
        checkpoint.run();
        cancellation.check();

        var result = delegate.findAgent(companyId, agentId);

        cancellation.check();
        return result;
    }

    @Override
    public List<AiToolAuthorizationService.ToolState> findTools(
            String companyId) {

        cancellation.check();

        var result = delegate.findTools(companyId);

        cancellation.check();
        return result;
    }
}
