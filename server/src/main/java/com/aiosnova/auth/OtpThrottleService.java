package com.aiosnova.auth;

import java.time.Instant;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Service;

@Service
public class OtpThrottleService {

    private final Map<String, Window> windows = new HashMap<>();

    private record Window(Instant resetsAt, int count) {
    }

    private record Limit(String key, int maximum, int seconds) {
    }

    public synchronized int checkSend(String email, String ip) {
        String recipient = email.trim().toLowerCase(Locale.ROOT);
        return check(
                new Limit("send-email:" + recipient, 5, 3600),
                new Limit("send-ip:" + ip, 20, 3600));
    }

    public synchronized int checkVerify(String email) {
        String recipient = email.trim().toLowerCase(Locale.ROOT);
        return check(new Limit("verify-email:" + recipient, 20, 900));
    }

    private int check(Limit... limits) {
        Instant now = Instant.now();
        windows.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().resetsAt()));

        int retryAfter = 0;
        for (Limit limit : limits) {
            Window window = windows.get(limit.key());
            if (window != null && window.count() >= limit.maximum()) {
                int remaining = (int) Math.ceil(
                        (window.resetsAt().toEpochMilli() - now.toEpochMilli()) / 1000.0);
                retryAfter = Math.max(retryAfter, remaining);
            }
        }

        if (retryAfter > 0) {
            return retryAfter;
        }

        // Check all limits before incrementing any of their counters.
        for (Limit limit : limits) {
            Window window = windows.get(limit.key());
            windows.put(limit.key(), window == null
                    ? new Window(now.plusSeconds(limit.seconds()), 1)
                    : new Window(window.resetsAt(), window.count() + 1));
        }

        return 0;
    }
}