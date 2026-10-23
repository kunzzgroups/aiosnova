package com.aiosnova.ai;

import java.io.IOException;
import java.net.http.HttpTimeoutException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.JsonNode;

@Service
public class AiChatMessageValidator {

    private static final int MAX_IMAGE_BYTES = 2 * 1024 * 1024;

    private final OpenRouterModelService modelService;

    public AiChatMessageValidator(
            OpenRouterModelService modelService) {
        this.modelService = modelService;
    }

    public record ValidatedChat(
            String modelId,
            double temperature,
            List<Map<String, Object>> messages,
            boolean hasImages) {
    }

    public ValidatedChat validate(AiChatMessagesRequest request) {
        if (request == null) {
            throw badRequest("Chat request is required.");
        }

        if (
            request.modelId() == null ||
            request.modelId().isBlank() ||
            request.modelId().length() > 200
        ) {
            throw badRequest("Provide a valid model ID.");
        }

        double temperature = request.temperature() == null
            ? 0.7
            : request.temperature();

        if (
            !Double.isFinite(temperature) ||
            temperature < 0 ||
            temperature > 2
        ) {
            throw badRequest("Temperature must be between 0 and 2.");
        }

        var messages = request.messages();

        if (
            messages == null ||
            messages.isEmpty() ||
            messages.size() > 100
        ) {
            throw badRequest("Provide between 1 and 100 messages.");
        }

        var normalized = new ArrayList<Map<String, Object>>();
        int totalTextLength = 0;
        int imageCount = 0;
        boolean hasUserMessage = false;

        for (var message : messages) {
            if (
                message == null ||
                message.role() == null ||
                !Set.of("system", "user", "assistant")
                    .contains(message.role())
            ) {
                throw badRequest("Message roles must be system, user or assistant.");
            }

            String role = message.role();
            JsonNode content = message.content();

            if (content == null || content.isNull()) {
                throw badRequest("Message content is required.");
            }

            if ("user".equals(role)) {
                hasUserMessage = true;
            }

            if (content.isString()) {
                String text = content.asString();

                if (text.isBlank()) {
                    throw badRequest("Text messages must not be empty.");
                }

                totalTextLength += text.length();

                normalized.add(Map.of(
                    "role", role,
                    "content", text
                ));

            } else if (content.isArray()) {
                if (!"user".equals(role)) {
                    throw badRequest("Only user messages may contain arrays of content parts.");
                }

                if (content.isEmpty() || content.size() > 32) {
                    throw badRequest("Each message must contain between 1 and 32 content parts.");
                }

                var parts = new ArrayList<Map<String, Object>>();

                for (JsonNode part : content) {
                    String type = part.path("type").asString("");

                    if ("text".equals(type)) {
                        var textNode = part.path("text");

                        if (
                            !textNode.isString() ||
                            textNode.asString().isBlank()
                        ) {
                            throw badRequest("Text content parts must not be empty.");
                        }

                        String text = textNode.asString();
                        totalTextLength += text.length();

                        parts.add(Map.of(
                            "type", "text",
                            "text", text
                        ));

                    } else if ("image_url".equals(type)) {
                        imageCount++;

                        if (imageCount > 4) {
                            throw badRequest("Each request may contain at most four images.");
                        }

                        String url = validateImage(
                            part.path("image_url").path("url")
                        );

                        parts.add(Map.of(
                            "type", "image_url",
                            "image_url", Map.of("url", url)
                        ));

                    } else {
                        throw badRequest("Content parts must use text or image_url.");
                    }
                }

                normalized.add(Map.of(
                    "role", role,
                    "content", List.copyOf(parts)
                ));

            } else {
                throw badRequest("Message content must be text or an array of content parts.");
            }

            if (totalTextLength > 100000) {
                throw badRequest("Total message text must not exceed 100000 characters.");
            }
        }

        if (!hasUserMessage) {
            throw badRequest("At least one user message is required.");
        }

        String modelId = request.modelId().trim();
        boolean hasImages = imageCount > 0;

        checkCapabilities(modelId, hasImages);

        return new ValidatedChat(
            modelId,
            temperature,
            List.copyOf(normalized),
            hasImages
        );
    }

    private String validateImage(JsonNode urlNode) {
        if (!urlNode.isString()) {
            throw badRequest("Image URL must be a string.");
        }

        String url = urlNode.asString();
        int separator = url.indexOf(',');

        if (separator < 0 || separator > 40) {
            throw badRequest("Images must use Base64 data URLs.");
        }

        String header = url.substring(0, separator);

        if (!Set.of(
            "data:image/png;base64",
            "data:image/jpeg;base64",
            "data:image/webp;base64",
            "data:image/gif;base64"
        ).contains(header)) {
            throw badRequest("Images must contain Base64 PNG, JPEG, WebP or GIF data.");
        }

        int encodedLength = url.length() - separator - 1;
        int maxEncodedLength = 4 * ((MAX_IMAGE_BYTES + 2) / 3);

        if (encodedLength == 0 || encodedLength > maxEncodedLength) {
            throw badRequest("Each image must contain data and be no larger than 2 MiB.");
        }

        try {
            byte[] decoded = Base64.getDecoder().decode(
                url.substring(separator + 1)
            );

            if (decoded.length == 0 || decoded.length > MAX_IMAGE_BYTES) {
                throw badRequest("Each image must contain data and be no larger than 2 MiB.");
            }
        } catch (IllegalArgumentException error) {
            throw badRequest("Invalid Base64 image data.");
        }

        return url;
    }

    private void checkCapabilities(String modelId, boolean hasImages) {
        ModelCapabilities capabilities;

        try {
            capabilities = modelService.loadCapabilities(modelId);
        } catch (IllegalArgumentException error) {
            throw badRequest("Model not found in the OpenRouter catalog.");
        } catch (HttpTimeoutException error) {
            throw new ResponseStatusException(
                HttpStatus.GATEWAY_TIMEOUT,
                "Loading model capabilities timed out."
            );
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();

            throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Loading model capabilities was interrupted."
            );
        } catch (IOException error) {
            throw new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "Unable to load model capabilities. Try again later."
            );
        }

        if (!capabilities.chat()) {
            throw badRequest("This model does not support chat.");
        }

        if (hasImages && !capabilities.vision()) {
            throw badRequest("This model does not support image input.");
        }
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            message
        );
    }
}
