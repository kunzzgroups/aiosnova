package com.aiosnova.auth;

import java.time.Instant;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class OtpThrottleService {

    private final OtpThrottleRepository repository;
    private final AuthSecretService secrets;

    public OtpThrottleService(OtpThrottleRepository repository, AuthSecretService secrets) {
        this.repository = repository;
        this.secrets = secrets;
    }

    public int checkSend(String email, String ip) {
        String recipient = email.trim().toLowerCase(Locale.ROOT);
        return check(new Limit(secrets.tokenHash("send-email:" + recipient), 5, 3600),
                new Limit(secrets.tokenHash("send-ip:" + ip), 20, 3600));
    }

    public int checkVerify(String email) {
        return check(new Limit(secrets.tokenHash("verify-email:" + email.trim().toLowerCase(Locale.ROOT)), 20, 900));
    }

    private int check(Limit... limits) {
        // Use the same lock order across backend processes to avoid crossed bucket locks.
        Arrays.sort(limits, Comparator.comparing(Limit::key));
        Instant now = Instant.now();
        OtpThrottleRepository.Window[] windows = new OtpThrottleRepository.Window[limits.length];
        int retryAfter = 0;
        for (int i = 0; i < limits.length; i++) {
            Limit limit = limits[i];
            OtpThrottleRepository.Window window = repository.lock(limit.key(), now.plusSeconds(limit.seconds()));
            if (!now.isBefore(window.resetsAt())) window = new OtpThrottleRepository.Window(now.plusSeconds(limit.seconds()), 0);
            windows[i] = window;
            if (window.count() >= limit.maximum()) {
                retryAfter = Math.max(retryAfter, (int) Math.ceil(
                        (window.resetsAt().toEpochMilli() - now.toEpochMilli()) / 1000.0));
            }
        }
        if (retryAfter > 0) return retryAfter;
        for (int i = 0; i < limits.length; i++) {
            repository.save(limits[i].key(), windows[i].resetsAt(), windows[i].count() + 1);
        }
        return 0;
    }

    private record Limit(String key, int maximum, int seconds) { }
}
