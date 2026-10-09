package com.aiosnova.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import com.aiosnova.mail.EmailService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class TacService {

    private final EmailService emailService;
    private final int resendCooldownSeconds;
    private final TacRepository repository;
    private final AuthRepository accounts;
    private final AuthSecretService secrets;
    private final InvitationService invitationService;
    private final SecureRandom random = new SecureRandom();

    public TacService(EmailService emailService, TacRepository repository, AuthRepository accounts,
                      AuthSecretService secrets, InvitationService invitationService,
                      @Value("${auth.tac.resend-cooldown-seconds}") int resendCooldownSeconds) {
        this.emailService = emailService;
        this.repository = repository;
        this.accounts = accounts;
        this.secrets = secrets;
        this.invitationService = invitationService;
        this.resendCooldownSeconds = resendCooldownSeconds;
    }

    public SendResult send(String email) {
        String recipient = email.trim().toLowerCase(Locale.ROOT);
        if (!invitationService.canRequestOtp(recipient)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        AuthRepository.User user = accounts.user(recipient, true);
        TacRepository.Challenge previous = repository.latest(user.id());
        Instant now = Instant.now();
        if (previous != null) {
            Instant availableAt = previous.createdAt().plusSeconds(resendCooldownSeconds);
            if (now.isBefore(availableAt)) {
                int remaining = (int) Math.ceil((availableAt.toEpochMilli() - now.toEpochMilli()) / 1000.0);
                return new SendResult(false, remaining);
            }
        }
        String code = String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
        String id = UUID.randomUUID().toString();
        repository.replace(id, user.id(), secrets.otpHash(id, code), now);
        emailService.send(recipient, "Your AIOS verification code", "Your verification code is: " + code);
        return new SendResult(true, resendCooldownSeconds);
    }

    public VerifyResult verify(String email, String code) {
        String recipient = email.trim().toLowerCase(Locale.ROOT);
        if (!invitationService.canRequestOtp(recipient)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        AuthRepository.User user = accounts.user(recipient, true);
        TacRepository.Challenge challenge = repository.latest(user.id());
        if (challenge == null || challenge.consumed() || !Instant.now().isBefore(challenge.expiresAt())) {
            return VerifyResult.EXPIRED;
        }
        if (challenge.attempts() >= challenge.maximum()) return VerifyResult.ATTEMPTS_EXCEEDED;
        if (!MessageDigest.isEqual(challenge.hash().getBytes(StandardCharsets.US_ASCII),
                secrets.otpHash(challenge.id(), code).getBytes(StandardCharsets.US_ASCII))) {
            repository.failure(challenge.id());
            return challenge.attempts() + 1 >= challenge.maximum()
                    ? VerifyResult.ATTEMPTS_EXCEEDED : VerifyResult.INVALID;
        }
        repository.consume(challenge.id());
        return VerifyResult.VERIFIED;
    }

    public enum VerifyResult { VERIFIED, EXPIRED, INVALID, ATTEMPTS_EXCEEDED }
    public record SendResult(boolean sent, int resendCooldown) { }
}
