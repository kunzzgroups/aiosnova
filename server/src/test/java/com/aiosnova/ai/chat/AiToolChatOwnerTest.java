package com.aiosnova.ai.chat;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class AiToolChatOwnerTest {

    @Test
    void validAuthenticatedIdentityIsPreserved() {
        var owner = new AiToolChatOwner(
                "merchant-test",
                "user-test");

        assertEquals("merchant-test", owner.merchantId());
        assertEquals("user-test", owner.userId());
    }

    @Test
    void invalidMerchantIsRejected() {
        for (String merchant : new String[] {
                null, "", "bad/merchant", "x".repeat(65)
        }) {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> new AiToolChatOwner(
                            merchant,
                            "user-test"));
        }
    }

    @Test
    void invalidUserIsRejected() {
        for (String user : new String[] {
                null, "", "bad/user", "x".repeat(65)
        }) {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> new AiToolChatOwner(
                            "merchant-test",
                            user));
        }
    }
}