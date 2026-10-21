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
                "message", "读取模型能力的请求被中断"
            );

        } catch (IOException error) {
            return Map.of(
                "ok", false,
                "message", "读取模型目录失败，请稍后重试"
            );

        } catch (RuntimeException error) {
            return Map.of(
                "ok", false,
                "message", "模型目录解析异常"
            );
        }
    }
}
