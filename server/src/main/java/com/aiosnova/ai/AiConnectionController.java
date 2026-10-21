package com.aiosnova.ai;

import java.util.Map;

import com.aiosnova.ai.AiConnectionService.ConnectionTestRequest;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AiConnectionController {

    private final AiConnectionService connectionService;

    public AiConnectionController(
        AiConnectionService connectionService
    ) {
        this.connectionService = connectionService;
    }

    @PostMapping("/api/ai/test-connection")
    public Map<String, Object> testConnection(
        @RequestBody ConnectionTestRequest input
    ) {
        return connectionService.testConnection(input);
    }
}
