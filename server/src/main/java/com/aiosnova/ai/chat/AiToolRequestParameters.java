package com.aiosnova.ai.chat;

record AiToolRequestParameters(
        Double temperature,
        Double topP,
        int maxTokens) {

    AiToolRequestParameters {
        if (temperature != null
                && (!Double.isFinite(temperature)
                    || temperature < 0 || temperature > 2)) {
            throw new IllegalArgumentException("Invalid Temperature.");
        }

        if (topP != null
                && (!Double.isFinite(topP)
                    || topP <= 0 || topP > 1)) {
            throw new IllegalArgumentException("Invalid Top P.");
        }

        if (maxTokens <= 0) {
            throw new IllegalArgumentException("Invalid Max Tokens.");
        }
    }
}
