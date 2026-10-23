package com.aiosnova.ai;

import java.util.List;

import tools.jackson.databind.JsonNode;

public record AiChatMessagesRequest(
        String companyId,
        String providerId,
        String modelId,
        Double temperature,
        List<Message> messages) {

    public record Message(
            String role,
            JsonNode content) {
    }
}