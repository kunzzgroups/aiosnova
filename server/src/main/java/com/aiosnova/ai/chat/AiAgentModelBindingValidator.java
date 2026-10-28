package com.aiosnova.ai.chat;

import java.util.Objects;

import com.aiosnova.ai.tool.AiToolRepository;
import com.aiosnova.ai.tool.AiToolRepository.AgentModelBinding;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class AiAgentModelBindingValidator {

    private final AiToolRepository repository;
    private final String merchantId;

    public AiAgentModelBindingValidator(
            AiToolRepository repository,
            String merchantId) {

        this.repository = Objects.requireNonNull(repository);

        requireId(merchantId, 64, "Merchant");
        this.merchantId = merchantId;
    }

    public AgentModelBinding requireMatch(
            String companyId,
            String agentId,
            String providerId,
            String modelConfigId) {

        requireId(companyId, 64, "Company");
        requireId(agentId, 128, "Agent");
        requireId(providerId, 36, "Provider");
        requireId(modelConfigId, 36, "Model configuration");

        var binding = repository.findAgentModelBinding(
                companyId, merchantId, agentId)
                .orElseThrow(AiAgentModelBindingValidator::denied);

        if (!companyId.equals(binding.companyId())
                || !merchantId.equals(binding.merchantId())
                || !agentId.equals(binding.agentId())
                || !"active".equals(binding.status())) {
            throw denied();
        }

        boolean hasProvider = binding.providerId() != null;
        boolean hasModel = binding.modelConfigId() != null;

        if (hasProvider != hasModel) {
            throw conflict(
                    "The Agent model binding is incomplete. "
                            + "Review the Agent configuration.");
        }

        if (!hasProvider) {
            // requireAgentToolModel resolves and validates the requested model
            // in server-side company scope before reaching this policy check.
            return binding;
        }

        if (!providerId.equals(binding.providerId())
                || !modelConfigId.equals(binding.modelConfigId())) {
            throw conflict(
                    "The requested model does not match "
                            + "the Agent's fixed model binding.");
        }

        return binding;
    }

    public void requireUnchanged(
            AgentModelBinding original,
            AgentModelBinding current) {

        if (original == null || current == null
                || !Objects.equals(original.companyId(), current.companyId())
                || !Objects.equals(original.merchantId(), current.merchantId())
                || !Objects.equals(original.agentId(), current.agentId())
                || !Objects.equals(original.providerId(), current.providerId())
                || !Objects.equals(original.modelConfigId(), current.modelConfigId())
                || !"active".equals(current.status())) {
            throw conflict(
                    "The Agent model binding changed. Start a new request.");
        }
    }

    private static void requireId(
            String value,
            int maxLength,
            String label) {

        if (value == null
                || !value.matches("[A-Za-z0-9_-]{1," + maxLength + "}")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid " + label + " ID.");
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
