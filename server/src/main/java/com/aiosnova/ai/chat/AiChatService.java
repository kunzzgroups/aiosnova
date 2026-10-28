package com.aiosnova.ai.chat;

import com.aiosnova.ai.model.AiModelStateService;
import com.aiosnova.ai.provider.AiApiKeyCrypto;
import com.aiosnova.ai.provider.AiProviderRepository;
import com.aiosnova.ai.tool.AiToolRegistry;
import com.aiosnova.ai.tool.AiToolAuthorizationService;
import com.aiosnova.ai.model.OpenRouterModelService;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.io.InputStream;
import java.util.Set;

import tools.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;

@Service
public class AiChatService {

    private final AiProviderRepository repository;
    private final AiApiKeyCrypto crypto;
    private final ChatTransport transport;
    private final ObjectMapper jsonMapper = new ObjectMapper();
    private final AiChatMessageValidator messageValidator;
    private final AiModelStateService modelStateService;
    private final AiChatRequestBuilder requestBuilder = new AiChatRequestBuilder();
    private final AiAgentModelBindingValidator agentModelBindingValidator;
    private final AiAgentExecutionParameterValidator agentParameterValidator;
    private final OpenRouterModelService toolModelMetadata;

    @Autowired
    public AiChatService(
            AiProviderRepository repository,
            AiApiKeyCrypto crypto,
            AiChatMessageValidator messageValidator,
            AiModelStateService modelStateService,
            ObjectProvider<AiAgentModelBindingValidator> bindingValidators,
            ObjectProvider<AiAgentExecutionParameterValidator> parameterValidators,
            OpenRouterModelService toolModelMetadata,
            @Value("${ai.tools.chat.enabled:false}") boolean toolsEnabled) {

        this(
                repository,
                crypto,
                defaultTransport(),
                messageValidator,
                modelStateService,
                toolsEnabled ? bindingValidators.getObject() : null,
                toolsEnabled ? parameterValidators.getObject() : null,
                toolModelMetadata);
    }

    AiChatService(
            AiProviderRepository repository,
            AiApiKeyCrypto crypto,
            ChatTransport transport,
            AiChatMessageValidator messageValidator,
            AiModelStateService modelStateService) {

        this(
                repository,
                crypto,
                transport,
                messageValidator,
                modelStateService,
                null);
    }

    AiChatService(
            AiProviderRepository repository,
            AiApiKeyCrypto crypto,
            ChatTransport transport,
            AiChatMessageValidator messageValidator,
            AiModelStateService modelStateService,
            AiAgentModelBindingValidator bindingValidator) {

        this(repository, crypto, transport, messageValidator, modelStateService,
                bindingValidator, null, null);
    }

    AiChatService(
            AiProviderRepository repository,
            AiApiKeyCrypto crypto,
            ChatTransport transport,
            AiChatMessageValidator messageValidator,
            AiModelStateService modelStateService,
            AiAgentModelBindingValidator bindingValidator,
            AiAgentExecutionParameterValidator parameterValidator,
            OpenRouterModelService modelMetadata) {

        this.repository = repository;
        this.crypto = crypto;
        this.transport = transport;
        this.messageValidator = messageValidator;
        this.modelStateService = modelStateService;
        this.agentModelBindingValidator = bindingValidator;
        this.agentParameterValidator = parameterValidator;
        this.toolModelMetadata = modelMetadata;
    }

    record ChatHttpResult(int statusCode, String body) {
    }

    record ChatStreamResult(
            int statusCode,
            String contentType,
            InputStream body) {
    }

    @FunctionalInterface
    interface ChatTransport {

        ChatHttpResult send(HttpRequest request)
                throws IOException, InterruptedException;

        default ChatStreamResult openStream(HttpRequest request)
                throws IOException, InterruptedException {

            throw new IOException("The test transport does not provide streaming responses.");
        }
    }

    private static ChatTransport defaultTransport() {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();

        return new ChatTransport() {

            @Override
            public ChatHttpResult send(HttpRequest request)
                    throws IOException, InterruptedException {

                var response = client.send(
                        request,
                        HttpResponse.BodyHandlers.ofString(
                                StandardCharsets.UTF_8));

                return new ChatHttpResult(
                        response.statusCode(),
                        response.body());
            }

            @Override
            public ChatStreamResult openStream(HttpRequest request)
                    throws IOException, InterruptedException {

                var response = client.send(
                        request,
                        HttpResponse.BodyHandlers.ofInputStream());

                return new ChatStreamResult(
                        response.statusCode(),
                        response.headers()
                                .firstValue("Content-Type")
                                .orElse(""),
                        response.body());
            }
        };
    }

    public record ChatReply(String modelId, String reply) {
    }

    public ChatReply chat(String companyId, String providerId, String modelId, String message) {
        if (modelId == null || modelId.isBlank() || modelId.length() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Provide a valid model ID no longer than 200 characters.");
        }
        if (message == null || message.isBlank() || message.length() > 20000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Message must be non-empty and no longer than 20000 characters.");
        }

        List<Map<String, Object>> messages = List.of(
                Map.<String, Object>of("role", "user", "content", message.trim()));
        return sendChat(companyId, providerId, modelId.trim(), messages, null);
    }

    public ChatReply chatMessages(AiChatMessagesRequest request) {
        var validated = messageValidator.validate(request);
        return sendChat(
                request.companyId(), request.providerId(), validated.modelId(),
                validated.messages(), validated.temperature());
    }

    /**
     * Existing package-private test entry.
     * Controllers must use the authorized entry below.
     */
    ChatReply chatMessagesWithTools(
            AiChatMessagesRequest request,
            AiToolRegistry registry,
            Set<String> allowedFunctionNames) {

        return chatMessagesWithTools(
                request,
                registry,
                allowedFunctionNames,
                () -> {
                });
    }

    /**
     * Authorized entry used by the tool Controller.
     */
    ChatReply chatMessagesWithAuthorizedTools(
            AiChatMessagesRequest request,
            String agentId,
            AiToolAuthorizationService authorization) {

        if (request == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Chat request is required.");
        }

        if (authorization == null) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Tool chat is not enabled.");
        }

        var authorized = authorization.authorize(
                request.companyId(), agentId);

        var initialBinding = requireAgentToolModel(
                request,
                agentId,
                agentModelBindingValidator);

        var parameters = requireAgentParameters(request, agentId);

        Runnable authorizationGuard = () -> {
            authorization.requireStillAllowed(
                    request.companyId(),
                    agentId,
                    authorized.functionNames());

            var currentBinding = requireAgentToolModel(
                    request,
                    agentId,
                    agentModelBindingValidator);

            agentModelBindingValidator.requireUnchanged(
                    initialBinding, currentBinding);
        };

        var agentRequest = new AiChatMessagesRequest(
                request.companyId(), request.providerId(), request.modelId(),
                null, request.messages());

        return chatMessagesWithTools(
                agentRequest,
                authorized.registry(),
                authorized.functionNames(),
                authorizationGuard,
                parameters);
    }

    /**
     * Internal integration entry.
     * Called after server-side tool and Agent model binding authorization.
     *
     * Registry and allowlist must come from trusted server-side code.
     */
    private ChatReply chatMessagesWithTools(
            AiChatMessagesRequest request,
            AiToolRegistry registry,
            Set<String> allowedFunctionNames,
            Runnable toolAuthorizationGuard) {

        return chatMessagesWithTools(request, registry, allowedFunctionNames,
                toolAuthorizationGuard, null);
    }

    private ChatReply chatMessagesWithTools(
            AiChatMessagesRequest request,
            AiToolRegistry registry,
            Set<String> allowedFunctionNames,
            Runnable toolAuthorizationGuard,
            AiToolRequestParameters agentParameters) {

        var validated = messageValidator.validate(request);

        String companyId = request.companyId();
        String providerId = request.providerId();
        String modelId = validated.modelId();

        // Validate company/Provider/model scope before loading credentials.
        requireToolModel(
                companyId,
                providerId,
                modelId,
                validated.hasImages());

        String apiKey = loadApiKey(companyId, providerId);

        Runnable guard = () -> {
            toolAuthorizationGuard.run();

            requireToolModel(
                    companyId,
                    providerId,
                    modelId,
                    validated.hasImages());

            String currentKey = loadApiKey(companyId, providerId);

            if (!apiKey.equals(currentKey)) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Provider credentials changed. Start a new request.");
            }
        };

        var conversation = new AiToolConversationService(
                transport,
                registry,
                guard);

        try {
            var parameters = agentParameters != null ? agentParameters
                    : new AiToolRequestParameters(validated.temperature(), null, 2048);
            String reply = conversation.chatWithParameters(
                    modelId,
                    validated.messages(),
                    parameters,
                    apiKey,
                    allowedFunctionNames);

            return new ChatReply(modelId, reply);

        } catch (AiToolConversationService.Failure error) {
            HttpStatus status = switch (error.code()) {
                case "interrupted" -> HttpStatus.SERVICE_UNAVAILABLE;
                default -> HttpStatus.BAD_GATEWAY;
            };

            throw new ResponseStatusException(
                    status,
                    error.getMessage());
        }
    }

    private AiToolRequestParameters requireAgentParameters(
            AiChatMessagesRequest request, String agentId) {
        if (agentParameterValidator == null || toolModelMetadata == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Agent execution parameter validation is not configured.");
        }

        var model = modelStateService.requireEnabledModel(
                request.companyId(), request.providerId(), request.modelId());
        var stored = agentParameterValidator.requireParameters(
                request.companyId(), agentId, model.contextWindow());

        try {
            var metadata = toolModelMetadata.loadMetadata(model.modelId());
            if (metadata == null || metadata.capabilities() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "Model parameter support is unavailable.");
            }
            return new AiToolRequestParameters(
                    stored.temperatureFor(metadata.supportsTemperature()),
                    stored.topPFor(metadata.supportsTopP()),
                    stored.maxTokens());
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Model parameter support is unavailable.");
        } catch (HttpTimeoutException error) {
            throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT,
                    "Loading model parameter support timed out.");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Loading model parameter support was interrupted.");
        } catch (IOException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Unable to load model parameter support.");
        }
    }

    private void requireToolModel(
            String companyId,
            String providerId,
            String modelId,
            boolean hasImages) {

        var model = modelStateService.requireEnabledModel(
                companyId,
                providerId,
                modelId);

        var capabilities = model.capabilities();

        if (capabilities == null
                || !capabilities.chat()
                || !capabilities.toolCalling()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This model does not support chat with tools.");
        }

        if (hasImages && !capabilities.vision()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This model does not support image input.");
        }
    }

    static Map<String, Object> streamRequestBody(AiChatMessageValidator.ValidatedChat validated) {
        var body = new HashMap<String, Object>(Map.of(
                "model", validated.modelId(), "messages", validated.messages(),
                "stream", true, "max_tokens", 2048));
        if (validated.temperature() != null)
            body.put("temperature", validated.temperature());
        return body;
    }

    public InputStream openChatStream(
            AiChatMessagesRequest input) {

        var validated = messageValidator.validate(input);

        modelStateService.requireEnabledModel(
                input.companyId(),
                input.providerId(),
                validated.modelId());

        String apiKey = loadApiKey(
                input.companyId(),
                input.providerId());

        var requestBody = streamRequestBody(validated);

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(
                            "https://openrouter.ai/api/v1/chat/completions"))
                    .timeout(Duration.ofSeconds(60))
                    .header("Content-Type", "application/json")
                    .header("Accept", "text/event-stream")
                    .header("Authorization", "Bearer " + apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(
                            jsonMapper.writeValueAsString(requestBody),
                            StandardCharsets.UTF_8))
                    .build();
            var response = transport.openStream(request);

            if (response.statusCode() != 200) {
                // 错误响应也必须关闭，释放上游连接。
                try (InputStream body = response.body()) {
                    String message = switch (response.statusCode()) {
                        case 401, 403 ->
                            "OpenRouter authentication or access failed. Check the saved Provider API Key.";
                        case 402 ->
                            "Insufficient OpenRouter credits. Check your balance or key limits.";
                        case 429 ->
                            "OpenRouter rate limit reached. Try again later.";
                        default ->
                            "OpenRouter request failed. HTTP status: " +
                                    response.statusCode();
                    };

                    throw new ResponseStatusException(
                            HttpStatus.BAD_GATEWAY,
                            message);
                }
            }

            String contentType = response.contentType()
                    .split(";", 2)[0]
                    .trim();

            if (!"text/event-stream".equalsIgnoreCase(contentType)) {
                try (InputStream body = response.body()) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_GATEWAY,
                            "OpenRouter did not return the expected event stream.");
                }
            }

            // 成功后把流交给调用方，由调用方负责读取和关闭。
            return response.body();

        } catch (ResponseStatusException error) {
            throw error;

        } catch (HttpTimeoutException error) {
            throw new ResponseStatusException(
                    HttpStatus.GATEWAY_TIMEOUT,
                    "Timed out waiting for the model stream.");

        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();

            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Model request was interrupted.");

        } catch (IOException error) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Unable to connect to the model streaming service.");

        } catch (RuntimeException error) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Unable to build the streaming request or parse its response.");
        }
    }

    private ChatReply sendChat(
            String companyId,
            String providerId,
            String normalizedModelId,
            List<Map<String, Object>> messages,
            Double temperature) {

        modelStateService.requireEnabledModel(
                companyId,
                providerId,
                normalizedModelId);
        String apiKey = loadApiKey(companyId, providerId);

        try {
            HttpRequest request = requestBuilder.build(
                    normalizedModelId,
                    messages,
                    temperature,
                    apiKey);

            var response = transport.send(request);
            if (response.statusCode() != 200) {
                String errorMessage = switch (response.statusCode()) {
                    case 401, 403 -> "OpenRouter authentication or access failed. Check the saved Provider API Key.";
                    case 402 -> "Insufficient OpenRouter credits. Check your balance or key limits.";
                    case 429 -> "OpenRouter rate limit reached. Try again later.";
                    default -> "OpenRouter request failed. HTTP status: " + response.statusCode();
                };
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, errorMessage);
            }

            var responseJson = jsonMapper.readTree(response.body());
            if (responseJson == null || responseJson.has("error")) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenRouter returned no valid chat result.");
            }
            var choice = responseJson.path("choices").path(0);
            var responseMessage = choice.path("message");
            var content = responseMessage.path("content");
            if (!content.isString() || content.asString().isBlank()) {
                String finishReason = choice.path("finish_reason").asString("");
                var refusal = responseMessage.path("refusal");
                String errorMessage;
                if ("length".equals(finishReason)) {
                    errorMessage = "The model reached the output limit (2048 tokens) without producing a text reply.";
                } else if ("content_filter".equals(finishReason) ||
                        (refusal.isString() && !refusal.asString().isBlank())) {
                    errorMessage = "The reply was refused or filtered. Adjust the images or question and try again.";
                } else if ("tool_calls".equals(finishReason)) {
                    errorMessage = "The model requested a tool call, which this chat endpoint does not yet support.";
                } else if (!content.isMissingNode() && !content.isNull() && !content.isString()) {
                    errorMessage = "The model returned an unsupported reply format.";
                } else {
                    errorMessage = "The model returned no text and did not report an output limit. Try another model or question.";
                }
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, errorMessage);
            }
            return new ChatReply(normalizedModelId, content.asString());

        } catch (ResponseStatusException error) {
            throw error;
        } catch (HttpTimeoutException error) {
            throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "Model request timed out. Try again later.");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Model request was interrupted.");
        } catch (IOException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to connect to OpenRouter.");
        } catch (RuntimeException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Unable to build the model request or parse its response.");
        }
    }

    private String loadApiKey(
            String companyId,
            String providerId) {

        if (companyId == null ||
                !companyId.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid company ID.");
        }

        if (providerId == null ||
                providerId.isBlank() ||
                providerId.length() > 36) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid Provider ID.");
        }

        var config = repository.findExecutionConfig(
                companyId,
                providerId).orElseThrow(
                        () -> new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "Provider not found in this company."));

        if (!config.enabled()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This Provider is disabled and cannot run models.");
        }

        if (!"openrouter".equals(config.providerType()) ||
                !"https://openrouter.ai/api/v1".equals(config.baseUrl())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "This chat endpoint supports the official OpenRouter service only.");
        }

        byte[] ciphertext = config.encryptedApiKey();

        if (ciphertext == null ||
                ciphertext.length == 0 ||
                config.keyId() == null ||
                config.keyId().isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This Provider has no saved API Key.");
        }

        try {
            String apiKey = crypto.decrypt(
                    config.companyId(),
                    config.id(),
                    config.keyId(),
                    ciphertext);

            if (apiKey == null || apiKey.isBlank()) {
                throw new IllegalStateException("Empty decrypted key");
            }

            return apiKey;
        } catch (IllegalStateException error) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Unable to decrypt the Provider key. Check the AI storage key configuration.");
        }
    }

    com.aiosnova.ai.tool.AiToolRepository.AgentModelBinding requireAgentToolModel(
            AiChatMessagesRequest request,
            String agentId,
            AiAgentModelBindingValidator bindingValidator) {

        if (request == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Chat request is required.");
        }

        if (bindingValidator == null) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Agent model binding validation is not configured.");
        }

        // Resolve the configuration UUID from trusted server-side storage.
        var model = modelStateService.requireEnabledModel(
                request.companyId(),
                request.providerId(),
                request.modelId());

        return bindingValidator.requireMatch(
                request.companyId(),
                agentId,
                model.providerId(),
                model.id());
    }
}
