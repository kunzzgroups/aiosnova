package com.aiosnova.mail;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("local")
public class MockEmailService implements EmailService {

    private final Map<String, List<MockEmail>> inbox = new HashMap<>();

    @Override
    public synchronized void send(String to, String subject, String body) {
        inbox.computeIfAbsent(to, key -> new ArrayList<>())
                .addFirst(new MockEmail(UUID.randomUUID().toString(), to, subject, body, Instant.now()));
    }

    public synchronized List<MockEmail> getEmails(String email) {
        return List.copyOf(inbox.getOrDefault(email, List.of()));
    }

    public record MockEmail(String id, String to, String subject, String body, Instant createdAt) {
    }
}
