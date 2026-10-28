package com.aiosnova.ai.chat;

import java.util.Objects;

import com.aiosnova.ai.tool.AiToolRepository;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class AiAgentExecutionParameterValidator {

    public record Parameters(
            double temperature,
            double topP,
            int maxTokens) {

        public Double temperatureFor(boolean supported) {
            return supported ? temperature : null;
        }

        public Double topPFor(boolean supported) {
            return supported ? topP : null;
        }
    }

    private final AiToolRepository repository;
    private final String merchantId;

    public AiAgentExecutionParameterValidator(
            AiToolRepository repository,
            String merchantId) {

        this.repository = Objects.requireNonNull(repository);

        requireId(merchantId, 64);
        this.merchantId = merchantId;
    }

    public Parameters requireParameters(
            String companyId,
            String agentId,
            Integer contextWindow) {

        requireId(companyId, 64);
        requireId(agentId, 128);

        var stored = repository.findAgentExecutionParameters(
                companyId, merchantId, agentId)
                .orElseThrow(AiAgentExecutionParameterValidator::denied);

        if (!companyId.equals(stored.companyId())
                || !merchantId.equals(stored.merchantId())
                || !agentId.equals(stored.agentId())
                || !"active".equals(stored.status())) {
            throw denied();
        }

        if (!Double.isFinite(stored.temperature())
                || stored.temperature() < 0
                || stored.temperature() > 2) {
            throw conflict("The Agent Temperature configuration is invalid.");
        }

        if (!Double.isFinite(stored.topP())
                || stored.topP() <= 0
                || stored.topP() > 1) {
            throw conflict("The Agent Top P configuration is invalid.");
        }

        if (contextWindow == null || contextWindow <= 0) {
            throw conflict(
                    "Model Context is unavailable. Refresh model capabilities.");
        }

        if (stored.maxTokens() <= 0
                || stored.maxTokens() > contextWindow) {
            throw conflict(
                    "The Agent Max Tokens must be positive "
                            + "and must not exceed the model Context.");
        }

        return new Parameters(
                stored.temperature(),
                stored.topP(),
                stored.maxTokens());
    }

    private static void requireId(String value, int limit) {
        if (value == null
                || !value.matches("[A-Za-z0-9_-]{1," + limit + "}")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid Agent parameter scope.");
        }
    }

    private static ResponseStatusException denied() {
        return new ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "The Agent is unavailable in this company and Merchant.");
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(
                HttpStatus.CONFLICT, message);
    }
}
