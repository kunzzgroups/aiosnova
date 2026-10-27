package com.aiosnova.ai.chat;

import com.aiosnova.ai.tool.AiToolAuthorizationService;
import com.aiosnova.ai.tool.AiToolRegistry;

import java.util.List;
import java.util.Optional;
import java.util.Set;

final class AiToolAuthorizationFixture {

    boolean active = true;
    boolean assigned = true;
    boolean toolEnabled = true;

    final AiToolAuthorizationService authorization;

    AiToolAuthorizationFixture(
            AiChatToolIntegrationTest.Fixture fixture) {

        var source = new AiToolAuthorizationService.Source() {

            @Override
            public Optional<AiToolAuthorizationService.AgentGrant>
                    findAgent(String companyId, String agentId) {

                if (!"company-test".equals(companyId)
                        || !"agent-test".equals(agentId)) {
                    return Optional.empty();
                }

                return Optional.of(
                        new AiToolAuthorizationService.AgentGrant(
                                "company-test",
                                "agent-test",
                                active,
                                assigned
                                        ? Set.of("calc.run")
                                        : Set.of()));
            }

            @Override
            public List<AiToolAuthorizationService.ToolState>
                    findTools(String companyId) {

                if (!"company-test".equals(companyId)) {
                    return List.of();
                }

                return List.of(
                        new AiToolAuthorizationService.ToolState(
                                "calc.run", toolEnabled));
            }
        };

        authorization = new AiToolAuthorizationService(
                source,
                List.of(new AiToolRegistry.Registration(
                        "calculator",
                        fixture.calculator)));
    }
}