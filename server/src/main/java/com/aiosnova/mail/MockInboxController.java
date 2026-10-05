package com.aiosnova.mail;

import java.util.List;
import java.util.Locale;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("local")
public class MockInboxController {

    private final MockEmailService emailService;

    public MockInboxController(MockEmailService emailService) {
        this.emailService = emailService;
    }

    @GetMapping("/api/mock/inbox")
    public InboxResponse getInbox(@RequestParam String email) {
        return new InboxResponse(emailService.getEmails(email.trim().toLowerCase(Locale.ROOT)));
    }

    public record InboxResponse(List<MockEmailService.MockEmail> emails) {
    }
}
