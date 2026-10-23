package com.aiosnova.ai;

import java.io.IOException;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AiModelController {

    private final OpenRouterModelService modelService;

    public AiModelController(OpenRouterModelService modelService) {
        this.modelService = modelService;
    }

    @GetMapping("/api/ai/model-capabilities")
    public Map<String, Object> getCapabilities(
        @RequestParam("modelId") String modelId
    ) {
        try {
            ModelCapabilities capabilities =
                modelService.loadCapabilities(modelId);

            return Map.of(
                "ok", true,
                "modelId", modelId.trim(),
                "capabilities", capabilities
            );

        } catch (IllegalArgumentException error) {
            return Map.of(
                "ok", false,
                "message", error.getMessage()
            );

        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();

            return Map.of(
                "ok", false,
                "message", "The model capability request was interrupted."
            );

        } catch (IOException error) {
            return Map.of(
                "ok", false,
                "message", "Unable to load the model catalog. Try again later."
            );

        } catch (RuntimeException error) {
            return Map.of(
                "ok", false,
                "message", "Unable to parse the model catalog."
            );
        }
    }

    @GetMapping("/api/ai/openrouter/models")
    public Map<String, Object> getModelCatalog() {
        try {
            var items = modelService.loadModelCatalog();

            return Map.of(
                "ok", true,
                "source", "openrouter",
                "items", items,
                "count", items.size(),
                "checkedAt", java.time.Instant.now().toString()
            );

        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();

            return Map.of(
                "ok", false,
                "message", "The model catalog request was interrupted."
            );

        } catch (IOException error) {
            return Map.of(
                "ok", false,
                "message", "Unable to load the model catalog. Try again later."
            );

        } catch (RuntimeException error) {
            return Map.of(
                "ok", false,
                "message", "Unable to parse the model catalog."
            );
        }
    }
}
