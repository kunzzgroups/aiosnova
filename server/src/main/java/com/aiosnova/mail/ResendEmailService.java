package com.aiosnova.mail;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Service
@ConditionalOnProperty(name = "app.mail.provider", havingValue = "resend")
public class ResendEmailService implements EmailService {
    private static final Logger log = LoggerFactory.getLogger(ResendEmailService.class);

    private final RestClient client;
    private final String from;

    public ResendEmailService(
            @Value("${app.mail.resend.api-key}") String apiKey, @Value("${app.mail.from}") String from) {

        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("RESEND_API_KEY is required");
        }
        if (from == null || from.isBlank()) {
            throw new IllegalStateException("EMAIL_FROM is required.");
        }
        this.from = from;

        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();

        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofSeconds(15));

        this.client = RestClient.builder()
                .baseUrl("https://api.resend.com")
                .requestFactory(requestFactory)
                .defaultHeaders(headers -> headers.setBearerAuth(apiKey.trim()))
                .build();
    }

    @Override
    public void send(String to, String subject, String body) {
        try {
            client.post()
                    .uri("/emails")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "from", from,
                            "to", List.of(to),
                            "subject", subject,
                            "text", body))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException ex) {

            log.warn("Resend rejected email request: HTTP {}", ex.getStatusCode().value());

            throw new IllegalStateException(
                    "Email delivery failed. Please try again later.");
        } catch (RestClientException ex) {
            log.warn("Resend request failed due to a connection or tiemout error.");

            throw new IllegalStateException(
                    "Email delivery failed. Please try again later.");
        }
    }
}