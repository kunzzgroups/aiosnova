package com.aiosnova.ai.chat;

import com.aiosnova.ai.model.AiModelRepository;
import com.aiosnova.ai.model.AiModelStateService;
import com.aiosnova.ai.model.ModelCapabilities;
import com.aiosnova.ai.model.OpenRouterModelService;
import com.aiosnova.ai.provider.AiApiKeyCrypto;
import com.aiosnova.ai.provider.AiProviderRepository;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.http.HttpRequest;
import java.net.http.HttpTimeoutException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;
import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

/**
 * Offline checks: fake repository and HTTP, real encryption, no stored secrets.
 */
public class AiChatServiceCheck {
    private static final String COMPANY = "company-test";
    private static final String PROVIDER = "provider-test";
    private static final String FAKE_KEY = "sk-test-chat-not-a-real-key";
    private static int passed;

    private static class FakeRepository extends AiProviderRepository {
        ProviderExecutionConfig config;

        FakeRepository() {
            super(new JdbcTemplate());
        }

        @Override
        public Optional<ProviderExecutionConfig> findExecutionConfig(String companyId, String providerId) {
            return config != null && config.companyId().equals(companyId) && config.id().equals(providerId)
                    ? Optional.of(config)
                    : Optional.empty();
        }

        @Override
        public List<ProviderSummary> findByCompany(String companyId) {
            if (config == null || !config.companyId().equals(companyId)) {
                return List.of();
            }

            return List.of(new ProviderSummary(
                    config.id(),
                    config.companyId(),
                    "Test Provider",
                    config.providerType(),
                    config.baseUrl(),
                    config.enabled(),
                    config.encryptedApiKey() != null,
                    0L));
        }
    }

    private static class FakeModelRepository extends AiModelRepository {

        FakeModelRepository() {
            super(new JdbcTemplate());
        }

        @Override
        public Optional<ModelSummary> findByExternalId(
                String companyId,
                String providerId,
                String modelId) {

            if (!COMPANY.equals(companyId) ||
                    !PROVIDER.equals(providerId) ||
                    !"test/model".equals(modelId)) {
                return Optional.empty();
            }

            return Optional.of(new ModelSummary(
                    "model-test",
                    companyId,
                    providerId,
                    modelId,
                    "Test Model",
                    "chat",
                    "enabled",
                    "",
                    32000,
                    32000,
                    null,
                    new ModelCapabilities(true, true, false, 32000),
                    java.time.Instant.parse("2026-01-01T00:00:00Z"),
                    null,
                    0L));
        }
    }

    private static class FakeTransport implements AiChatService.ChatTransport {
        int calls;
        int status = 200;
        String body = "{\"choices\":[{\"message\":{\"content\":\"你好 OK\"}}]}";
        Exception failure;
        HttpRequest request;

        @Override
        public AiChatService.ChatHttpResult send(HttpRequest request) throws IOException, InterruptedException {
            calls++;
            this.request = request;
            if (failure instanceof IOException error)
                throw error;
            if (failure instanceof InterruptedException error)
                throw error;
            return new AiChatService.ChatHttpResult(status, body);
        }
    }

    public static void main(String[] args) {
        byte[] master = new byte[32];
        new SecureRandom().nextBytes(master);
        var crypto = new AiApiKeyCrypto(Base64.getEncoder().encodeToString(master));
        var repository = new FakeRepository();
        var transport = new FakeTransport();
        var validator = new AiChatMessageValidator(new OpenRouterModelService());
        var modelStateService = new AiModelStateService(
                new FakeModelRepository(),
                repository);

        var service = new AiChatService(
                repository,
                crypto,
                transport,
                validator,
                modelStateService);
        byte[] ciphertext = crypto.encrypt(COMPANY, PROVIDER, FAKE_KEY);
        var valid = config(true, "openrouter", "https://openrouter.ai/api/v1", ciphertext, crypto.keyId());
        repository.config = valid;

        expect(service, COMPANY, PROVIDER, " ", "Hello", 400, "model ID");
        expect(service, COMPANY, PROVIDER, "test/model", " ", 400, "Message");
        expect(service, "bad/company", PROVIDER, "test/model", "Hello", 400, "company ID");
        expect(service, COMPANY, " ", "test/model", "Hello", 400, "Provider ID");
        expect(service, "other-company", PROVIDER, "test/model", "Hello", 404, "not found");
        expect(service, COMPANY, "other-provider", "test/model", "Hello", 404, "not found");
        repository.config = config(false, "openrouter", valid.baseUrl(), ciphertext, crypto.keyId());
        expect(service, COMPANY, PROVIDER, "test/model", "Hello", 409, "disabled");
        repository.config = config(true, "other", valid.baseUrl(), ciphertext, crypto.keyId());
        expect(service, COMPANY, PROVIDER, "test/model", "Hello", 400, "official OpenRouter");
        repository.config = config(true, "openrouter", "https://invalid.example", ciphertext, crypto.keyId());
        expect(service, COMPANY, PROVIDER, "test/model", "Hello", 400, "official OpenRouter");
        repository.config = config(true, "openrouter", valid.baseUrl(), null, null);
        expect(service, COMPANY, PROVIDER, "test/model", "Hello", 409, "no saved");
        byte[] tampered = ciphertext.clone();
        tampered[tampered.length - 1] ^= 1;
        repository.config = config(true, "openrouter", valid.baseUrl(), tampered, crypto.keyId());
        expect(service, COMPANY, PROVIDER, "test/model", "Hello", 500, "decrypt");
        require(transport.calls == 0, "Invalid provider/input never reaches HTTP");

        repository.config = valid;
        var reply = service.chat(COMPANY, PROVIDER, " test/model ", " 你好 ");
        require(reply.reply().equals("你好 OK") && reply.modelId().equals("test/model"),
                "Successful reply preserves UTF-8");
        require(transport.request.uri().toString().equals("https://openrouter.ai/api/v1/chat/completions") &&
                transport.request.headers().firstValue("Authorization").orElse("").equals("Bearer " + FAKE_KEY),
                "Decrypted fake key is used only for the official upstream request");
        var json = new ObjectMapper();
        var sent = json.readTree(body(transport.request));
        require(sent.path("messages").path(0).path("content").asString().equals("你好") &&
                !sent.path("stream").asBoolean() && sent.path("max_tokens").asInt() == 2048,
                "Request body uses text messages and bounded non-streaming output");
        require(!json.writeValueAsString(reply).contains(FAKE_KEY), "Reply does not expose the key");

        for (int status : new int[] { 401, 403, 402, 429, 503 }) {
            transport.status = status;
            transport.body = FAKE_KEY; // Upstream diagnostics must not be echoed.
            expect(service, COMPANY, PROVIDER, "test/model", "Hello", 502,
                    status == 401 || status == 403 ? "authentication" : status == 402 ? "credits" : status == 429 ? "rate limit" : "503");
        }
        transport.status = 200;
        for (String invalid : new String[] { "not-json", "null", "{}", "{\"error\":{}}",
                "{\"choices\":[{\"message\":{\"content\":\" \"}}]}" }) {
            transport.body = invalid;
            expect(service, COMPANY, PROVIDER, "test/model", "Hello", 502, "");
        }
        transport.body = "{\"choices\":[{\"finish_reason\":\"length\",\"message\":{\"content\":null}}]}";
        expect(service, COMPANY, PROVIDER, "test/model", "Hello", 502, "output limit");
        transport.body = "{\"choices\":[{\"message\":{\"refusal\":\"do not echo this\",\"content\":null}}]}";
        expect(service, COMPANY, PROVIDER, "test/model", "Hello", 502, "refused");
        transport.body = "{\"choices\":[{\"finish_reason\":\"tool_calls\",\"message\":{\"content\":null}}]}";
        expect(service, COMPANY, PROVIDER, "test/model", "Hello", 502, "tool call");
        transport.body = "{\"choices\":[{\"message\":{\"content\":[]}}]}";
        expect(service, COMPANY, PROVIDER, "test/model", "Hello", 502, "reply format");
        transport.failure = new HttpTimeoutException("fake timeout");
        expect(service, COMPANY, PROVIDER, "test/model", "Hello", 504, "timed out");
        transport.failure = new IOException("fake connection failure");
        expect(service, COMPANY, PROVIDER, "test/model", "Hello", 502, "Unable to connect");
        transport.failure = new InterruptedException("fake interruption");
        expect(service, COMPANY, PROVIDER, "test/model", "Hello", 503, "interrupted");
        require(Thread.interrupted(), "Interrupted flag is restored");
        System.out.println("All " + passed + " chat service checks passed. No network or database access.");
    }

    private static AiProviderRepository.ProviderExecutionConfig config(boolean enabled, String type, String url,
            byte[] encrypted, String keyId) {
        return new AiProviderRepository.ProviderExecutionConfig(PROVIDER, COMPANY, type, url, enabled, encrypted,
                keyId);
    }

    private static void expect(AiChatService service, String company, String provider, String model, String message,
            int status, String reason) {
        try {
            service.chat(company, provider, model, message);
            throw new AssertionError("Expected rejection with status " + status);
        } catch (ResponseStatusException error) {
            require(error.getStatusCode().value() == status && error.getReason() != null &&
                    error.getReason().contains(reason) && !error.toString().contains(FAKE_KEY)
                    && error.getCause() == null,
                    "Safe failure with status " + status + (reason.isBlank() ? "" : " (" + reason + ")"));
        }
    }

    private static String body(HttpRequest request) {
        var result = new CompletableFuture<String>();
        var bytes = new ByteArrayOutputStream();
        request.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<ByteBuffer>() {
            public void onSubscribe(Flow.Subscription subscription) {
                subscription.request(Long.MAX_VALUE);
            }

            public void onNext(ByteBuffer buffer) {
                byte[] chunk = new byte[buffer.remaining()];
                buffer.get(chunk);
                bytes.writeBytes(chunk);
            }

            public void onError(Throwable error) {
                result.completeExceptionally(error);
            }

            public void onComplete() {
                result.complete(bytes.toString(StandardCharsets.UTF_8));
            }
        });
        return result.join();
    }

    private static void require(boolean condition, String name) {
        if (!condition)
            throw new AssertionError("FAIL: " + name);
        passed++;
        System.out.println("PASS: " + name);
    }
}
