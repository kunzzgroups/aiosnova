package com.aiosnova.ai;

import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/** Standalone checks with throwaway keys; no Spring startup, secrets file or database. */
public class AiApiKeyCryptoCheck {

    public static void main(String[] args) {
        byte[] keyBytes = new byte[32];
        new SecureRandom().nextBytes(keyBytes);

        String storageKey = Base64.getEncoder().encodeToString(keyBytes);
        AiApiKeyCrypto crypto = new AiApiKeyCrypto(storageKey);

        String companyId = "company-test";
        String providerId = "provider-test";
        String fakeApiKey = "sk-test-not-a-real-key";

        byte[] encrypted = crypto.encrypt(companyId, providerId, fakeApiKey);
        String decrypted = crypto.decrypt(
            companyId, providerId, crypto.keyId(), encrypted
        );
        check(fakeApiKey.equals(decrypted), "Correct scope restores the fake API key");

        byte[] secondEncrypted = crypto.encrypt(companyId, providerId, fakeApiKey);
        check(!Arrays.equals(encrypted, secondEncrypted), "Repeated encryption produces distinct ciphertext");

        AiApiKeyCrypto anotherInstance = new AiApiKeyCrypto(storageKey);
        check(
            fakeApiKey.equals(anotherInstance.decrypt(
                companyId, providerId, crypto.keyId(), encrypted
            )),
            "A new instance with the same master key decrypts successfully"
        );

        expectFailure("Wrong company is rejected", () -> crypto.decrypt(
            "another-company", providerId, crypto.keyId(), encrypted
        ));

        expectFailure("Wrong provider is rejected", () -> crypto.decrypt(
            companyId, "another-provider", crypto.keyId(), encrypted
        ));

        byte[] tampered = encrypted.clone();
        tampered[tampered.length - 1] ^= 1;
        expectFailure("Tampered ciphertext is rejected", () -> crypto.decrypt(
            companyId, providerId, crypto.keyId(), tampered
        ));

        byte[] differentKeyBytes = keyBytes.clone();
        differentKeyBytes[0] ^= 1;
        AiApiKeyCrypto wrongKeyCrypto = new AiApiKeyCrypto(
            Base64.getEncoder().encodeToString(differentKeyBytes)
        );
        expectFailure("Wrong master key is rejected", () -> wrongKeyCrypto.decrypt(
            companyId, providerId, crypto.keyId(), encrypted
        ));

        expectFailure("Wrong key version is rejected", () -> crypto.decrypt(
            companyId, providerId, "unknown-key-version", encrypted
        ));

        System.out.println("All 8 encryption checks passed.");
    }

    private static void check(boolean condition, String name) {
        if (!condition) {
            throw new AssertionError("FAIL: " + name);
        }
        System.out.println("PASS: " + name);
    }

    private static void expectFailure(String name, Runnable operation) {
        try {
            operation.run();
        } catch (IllegalStateException expected) {
            System.out.println("PASS: " + name);
            return;
        }
        throw new AssertionError("FAIL: " + name + "; decryption unexpectedly succeeded");
    }
}
