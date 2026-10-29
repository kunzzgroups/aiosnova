package com.aiosnova.ai.chat;

record AiToolChatOwner(
        String merchantId,
        String userId) {

    AiToolChatOwner {
        requireId(merchantId);
        requireId(userId);
    }

    private static void requireId(String value) {
        if (value == null
                || !value.matches("[A-Za-z0-9_-]{1,64}")) {

            throw new IllegalArgumentException(
                    "A valid authenticated Merchant and user are required.");
        }
    }
}
