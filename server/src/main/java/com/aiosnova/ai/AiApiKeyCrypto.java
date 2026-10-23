package com.aiosnova.ai;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class AiApiKeyCrypto {

    private static final String KEY_ID = "ai-local-v1";
    private static final byte FORMAT_VERSION = 1;
    private static final int NONCE_LENGTH = 12;

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public AiApiKeyCrypto(
        @Value("${ai.credentials.storage-key}") String storageKey
    ) {
        byte[] decoded;

        try {
            decoded = Base64.getDecoder().decode(storageKey.trim());
        } catch (IllegalArgumentException error) {
            throw new IllegalStateException("The AI storage key must be valid Base64.");
        }

        if (decoded.length != 32) {
            throw new IllegalStateException("The AI storage key must contain 32 bytes.");
        }

        this.key = new SecretKeySpec(decoded, "AES");
    }

    public String keyId() {
        return KEY_ID;
    }

    public byte[] encrypt(
        String companyId,
        String providerId,
        String apiKey
    ) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalArgumentException("API Key is required.");
        }

        byte[] aad = associatedData(companyId, providerId);
        byte[] nonce = new byte[NONCE_LENGTH];
        random.nextBytes(nonce);

        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");

            cipher.init(
                Cipher.ENCRYPT_MODE,
                key,
                new GCMParameterSpec(128, nonce)
            );

            cipher.updateAAD(aad);

            byte[] ciphertext = cipher.doFinal(
                apiKey.trim().getBytes(StandardCharsets.UTF_8)
            );

            return ByteBuffer.allocate(
                1 + NONCE_LENGTH + ciphertext.length
            )
                .put(FORMAT_VERSION)
                .put(nonce)
                .put(ciphertext)
                .array();

        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("API Key encryption failed.");
        }
    }

    public String decrypt(
        String companyId,
        String providerId,
        String keyId,
        byte[] encrypted
    ) {
        if (!KEY_ID.equals(keyId)) {
            throw new IllegalStateException("Unsupported AI key version.");
        }

        if (
            encrypted == null ||
            encrypted.length < 1 + NONCE_LENGTH + 16 ||
            encrypted[0] != FORMAT_VERSION
        ) {
            throw new IllegalStateException("Invalid encrypted API Key format.");
        }

        byte[] aad = associatedData(companyId, providerId);

        ByteBuffer buffer = ByteBuffer.wrap(encrypted);
        buffer.get();

        byte[] nonce = new byte[NONCE_LENGTH];
        buffer.get(nonce);

        byte[] ciphertext = new byte[buffer.remaining()];
        buffer.get(ciphertext);

        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");

            cipher.init(
                Cipher.DECRYPT_MODE,
                key,
                new GCMParameterSpec(128, nonce)
            );

            cipher.updateAAD(aad);

            byte[] plaintext = cipher.doFinal(ciphertext);

            return new String(plaintext, StandardCharsets.UTF_8);

        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("API Key decryption failed.");
        }
    }

    private byte[] associatedData(
        String companyId,
        String providerId
    ) {
        if (
            companyId == null || companyId.isBlank() ||
            providerId == null || providerId.isBlank()
        ) {
            throw new IllegalArgumentException(
                "Company ID and Provider ID are required."
            );
        }

        String context =
            "ai-provider-key:v1:" +
            companyId.length() + ":" + companyId +
            providerId.length() + ":" + providerId;

        return context.getBytes(StandardCharsets.UTF_8);
    }
}