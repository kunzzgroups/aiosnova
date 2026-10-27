package com.aiosnova.ai.tool;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Server-side tool policy.
 * No database implementation or Spring registration yet.
 */
public final class AiToolAuthorizationService {

    public record AgentGrant(
            String companyId,
            String agentId,
            boolean active,
            Set<String> allowedActions) {

        public AgentGrant {
            allowedActions = Set.copyOf(allowedActions);
        }
    }

    public record ToolState(
            String action,
            boolean enabled) {
    }

    /**
     * Implementations must obtain data from trusted server-side storage,
     * never from the chat request body.
     */
    public interface Source {
        Optional<AgentGrant> findAgent(
                String companyId,
                String agentId);

        List<ToolState> findTools(String companyId);
    }

    public record AuthorizedTools(
            AiToolRegistry registry,
            Set<String> functionNames) {

        public AuthorizedTools {
            functionNames = Set.copyOf(functionNames);
        }
    }

    private final Source source;

    private final Map<String, AiToolRegistry.Registration>
            registrationsByAction;

    public AiToolAuthorizationService(
            Source source,
            List<AiToolRegistry.Registration> registrations) {

        if (source == null || registrations == null) {
            throw new IllegalArgumentException(
                    "Authorization source and registrations are required.");
        }

        // Reuse registration validation, including duplicate checks.
        new AiToolRegistry(registrations);

        var byAction =
                new HashMap<String, AiToolRegistry.Registration>();

        for (var registration : registrations) {
            byAction.put(
                    registration.handler().definition().action(),
                    registration);
        }

        this.source = source;
        this.registrationsByAction = Map.copyOf(byAction);
    }

    public AuthorizedTools authorize(
            String companyId,
            String agentId) {

        requireId(companyId, 64, "company");
        requireId(agentId, 128, "Agent");

        var agent = source.findAgent(companyId, agentId)
                .orElseThrow(AiToolAuthorizationService::denied);

        // Check returned ownership too, rather than trusting the lookup alone.
        if (!companyId.equals(agent.companyId())
                || !agentId.equals(agent.agentId())
                || !agent.active()) {
            throw denied();
        }

        var states = source.findTools(companyId);

        if (states == null) {
            throw configurationError();
        }

        var enabledByAction = new HashMap<String, Boolean>();

        for (var state : states) {
            if (state == null
                    || state.action() == null
                    || state.action().isBlank()
                    || enabledByAction.putIfAbsent(
                            state.action(), state.enabled()) != null) {
                throw configurationError();
            }
        }

        var selected =
                new ArrayList<AiToolRegistry.Registration>();

        // Sort for stable request definitions.
        for (String action : agent.allowedActions().stream()
                .sorted().toList()) {

            if (!Boolean.TRUE.equals(enabledByAction.get(action))) {
                continue;
            }

            var registration = registrationsByAction.get(action);

            if (registration == null) {
                // Enabled and authorized, but no executable implementation.
                throw configurationError();
            }

            selected.add(registration);
        }

        if (selected.isEmpty()) {
            throw denied();
        }

        var registry = new AiToolRegistry(selected);

        Set<String> names = registry.definitions().stream()
                .map(definition -> definition.functionName())
                .collect(Collectors.toUnmodifiableSet());

        return new AuthorizedTools(registry, names);
    }

    /**
     * Re-check an existing request's tools.
     * Newly granted tools must not expand the original request's allowlist.
     */
    public void requireStillAllowed(
            String companyId,
            String agentId,
            Set<String> originalFunctionNames) {

        if (originalFunctionNames == null
                || originalFunctionNames.isEmpty()) {
            throw denied();
        }

        var current = authorize(companyId, agentId);

        if (!current.functionNames().containsAll(
                originalFunctionNames)) {
            throw denied();
        }
    }

    private static void requireId(
            String value,
            int maxLength,
            String label) {

        if (value == null
                || value.isBlank()
                || value.length() > maxLength
                || !value.matches("[A-Za-z0-9_-]+")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid " + label + " ID.");
        }
    }

    private static ResponseStatusException denied() {
        return new ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "Agent has no permitted tools in this company scope.");
    }

    private static ResponseStatusException configurationError() {
        return new ResponseStatusException(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "Tool authorization configuration is invalid.");
    }
}