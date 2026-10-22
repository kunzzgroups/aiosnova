package com.aiosnova.auth;

import static org.junit.jupiter.api.Assertions.*;

import com.aiosnova.mail.EmailService;
import com.aiosnova.mail.MockEmailService;
import com.aiosnova.mail.MockInboxController;
import com.aiosnova.mail.ResendEmailService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

class ProdConfigurationTest {
    @Test void prodLoadsDeploymentVariablesAndExcludesLocalEndpoints() {
        var application = new SpringApplication(MailConfiguration.class);
        application.setWebApplicationType(WebApplicationType.NONE);
        try (var context = application.run(
                "--spring.profiles.active=prod",
                "--DB_HOST=db.example.invalid", "--DB_NAME=test", "--DB_USERNAME=test",
                "--DB_PASSWORD=test-only", "--AUTH_STORAGE_KEY=test-only",
                "--LOCAL_MERCHANT_ID=test-merchant", "--FRONTEND_URL=https://www.aiosnova.com",
                "--EMAIL_FROM=AIOS <noreply@example.com>", "--RESEND_API_KEY=test-only",
                "--EMAIL_PROVIDER=mock", "--TEST_LOGIN_ENABLED=false")) {
            var environment = context.getEnvironment();
            assertEquals("resend", environment.getProperty("app.mail.provider"));
            assertEquals("test-only", environment.getProperty("app.mail.resend.api-key"));
            assertEquals("test-only", environment.getProperty("auth.storage-key"));
            assertEquals("test-merchant", environment.getProperty("app.local-merchant-id"));
            assertEquals("jdbc:mysql://db.example.invalid:3306/test?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true",
                    environment.getProperty("spring.datasource.url"));
            assertEquals("never", environment.getProperty("spring.sql.init.mode"));
            assertInstanceOf(ResendEmailService.class, context.getBean(EmailService.class));
            assertTrue(context.getBeansOfType(MockInboxController.class).isEmpty());
            assertTrue(context.getBeansOfType(LocalTestLoginController.class).isEmpty());
            assertTrue(context.getBeansOfType(InvitationController.class).isEmpty());
        }
    }

    @Configuration(proxyBeanMethods = false)
    @Import({ResendEmailService.class, MockEmailService.class, MockInboxController.class,
            LocalTestLoginController.class, InvitationController.class})
    static class MailConfiguration { }
}
