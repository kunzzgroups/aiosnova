package com.aiosnova.auth;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import com.aiosnova.mail.EmailService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class TacService {

    private final EmailService emailService;
    private final int resendCooldownSeconds;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Instant> resendAvailableAt = new HashMap<>();
    private static final int MAX_VERIFY_ATTEMPTS = 5;

    public TacService(EmailService emailService,
                      @Value("${auth.tac.resend-cooldown-seconds}") int resendCooldownSeconds) {
        this.emailService = emailService;
        this.resendCooldownSeconds = resendCooldownSeconds;
    }

    // Keep checking the cooldown and sending atomic for concurrent requests.
    public synchronized SendResult send(String email) {
        String recipient = email.trim().toLowerCase(Locale.ROOT);
        Instant now = Instant.now();
        Instant availableAt = resendAvailableAt.get(recipient);
        if (availableAt != null && now.isBefore(availableAt)) {
            int remaining = (int) Math.ceil((availableAt.toEpochMilli() - now.toEpochMilli()) / 1000.0);
            return new SendResult(false, remaining);
        }

        String code = String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
        emailService.send(recipient, "Your AIOS verification code",
        "Your verification code is: " + code);

        Instant sentAt = Instant.now();
        challenges.put(recipient, new TacChallenge(code, sentAt.plusSeconds(300), 0));
        resendAvailableAt.put(recipient, sentAt.plusSeconds(resendCooldownSeconds));
        return new SendResult(true, resendCooldownSeconds);
    }

private final Map<String, TacChallenge> challenges = new HashMap<>();

private record TacChallenge(String code, Instant expiresAt, int failedAttempts) {
}

public enum VerifyResult {
    VERIFIED, EXPIRED, INVALID, ATTEMPTS_EXCEEDED
}

public synchronized VerifyResult verify(String email, String code) {
    String recipient = email.trim().toLowerCase(Locale.ROOT);
    TacChallenge challenge = challenges.get(recipient);

    if (challenge == null || !Instant.now().isBefore(challenge.expiresAt())) {
        challenges.remove(recipient);
        return VerifyResult.EXPIRED;
    }

    if (challenge.failedAttempts() >= MAX_VERIFY_ATTEMPTS) {
        return VerifyResult.ATTEMPTS_EXCEEDED;
    }

    if (!challenge.code().equals(code)) {
        int failedAttempts = challenge.failedAttempts() + 1;
        challenges.put(recipient, new TacChallenge(
                challenge.code(), challenge.expiresAt(), failedAttempts));

        return failedAttempts >= MAX_VERIFY_ATTEMPTS
                ? VerifyResult.ATTEMPTS_EXCEEDED
                : VerifyResult.INVALID;
    }

    challenges.remove(recipient);
    return VerifyResult.VERIFIED;
}

    public record SendResult(boolean sent, int resendCooldown) {
    }
}
