package com.aiosnova.ai.chat;

import com.aiosnova.ai.tool.AiToolAuthorizationService;

import java.util.Map;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.List;
import java.util.UUID;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import tools.jackson.databind.ObjectMapper;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.RequestHeader;

@RestController
@RequestMapping("/api/ai/chat")
public class AiChatController {

    private final AiChatService service;

    private final AiToolAuthorizationService toolAuthorization;

    private final AiToolChatLifecycle toolLifecycle;

    private final AiToolChatAccess toolAccess;

    public AiChatController(AiChatService service) {
        this(service, null);
    }

    /**
     * Normal application startup: tool endpoint remains disabled.
     */
    @Autowired
    public AiChatController(
            AiChatService service,
            ObjectProvider<AiToolAuthorizationService> authorization,
            ObjectProvider<AiToolChatLifecycle> lifecycle,
            ObjectProvider<AiToolChatAccess> access,
            @Value("${ai.tools.chat.enabled:false}") boolean toolsEnabled) {

        this(
                service,
                toolsEnabled ? authorization.getObject() : null,
                toolsEnabled ? lifecycle.getObject() : null,
                toolsEnabled ? access.getIfAvailable() : null);
    }

    /**
     * Simulated MVC tests only.
     * Normal application startup keeps tool chat disabled.
     */
    AiChatController(
            AiChatService service,
            AiToolAuthorizationService toolAuthorization) {

        this(
                service,
                toolAuthorization,
                toolAuthorization == null
                        ? null
                        : new AiToolChatLifecycle(
                                service,
                                toolAuthorization,
                                new AiToolChatRequests()));
    }

    AiChatController(
            AiChatService service,
            AiToolAuthorizationService toolAuthorization,
            AiToolChatLifecycle toolLifecycle) {

        this(service, toolAuthorization, toolLifecycle, null);
    }

    AiChatController(
            AiChatService service,
            AiToolAuthorizationService toolAuthorization,
            AiToolChatLifecycle toolLifecycle,
            AiToolChatAccess toolAccess) {

        this.service = service;
        this.toolAuthorization = toolAuthorization;
        this.toolLifecycle = toolLifecycle;
        this.toolAccess = toolAccess;
    }

    public record ChatRequest(
            String companyId,
            String providerId,
            String modelId,
            String message) {
    }

    public record ToolChatCancelRequest(
            String companyId,
            String agentId) {
    }

    @PostMapping(value = "/messages/tools/cancel", produces = "application/json;charset=UTF-8")
    public ResponseEntity<Map<String, String>> cancelToolChat(
            @RequestBody ToolChatCancelRequest request,
            @RequestHeader(value = "X-AI-Tool-Request-Id", required = false) String requestId,
            HttpServletRequest httpRequest) {

        if (toolAuthorization == null || toolLifecycle == null) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Tool chat is not enabled.");
        }

        if (request == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Cancellation request is required.");
        }

        if (toolAccess == null) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Tool chat authentication is not configured.");
        }

        var owner = toolAccess.requireOwner(
                httpRequest,
                request.companyId());

        if (owner == null) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Tool chat authentication is not configured.");
        }

        boolean accepted = toolLifecycle.cancel(
                owner,
                request.companyId(),
                request.agentId(),
                requestId);

        if (!accepted) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "No active tool chat request was found.");
        }

        return ResponseEntity.accepted().body(
                Map.of("message", "Tool chat cancellation requested."));
    }

    @PostMapping
    public AiChatService.ChatReply chat(
            @RequestBody ChatRequest request) {

        return service.chat(
                request.companyId(),
                request.providerId(),
                request.modelId(),
                request.message());
    }

    @PostMapping(value = "/messages", produces = "application/json;charset=UTF-8")
    public AiChatService.ChatReply chatMessages(
            @RequestBody AiChatMessagesRequest request) {

        return service.chatMessages(request);
    }

    public record ToolChatRequest(
            String companyId,
            String agentId,
            String providerId,
            String modelId,
            Double temperature,
            List<AiChatMessagesRequest.Message> messages) {

        AiChatMessagesRequest toChatRequest() {
            return new AiChatMessagesRequest(
                    companyId,
                    providerId,
                    modelId,
                    temperature,
                    messages);
        }
    }

    @PostMapping(value = "/messages/tools", produces = "application/json;charset=UTF-8")
    public AiChatService.ChatReply chatMessagesWithTools(
            @RequestBody ToolChatRequest request,
            @RequestHeader(value = "X-AI-Tool-Request-Id", required = false) String requestId,
            HttpServletRequest httpRequest) {

        if (toolAuthorization == null || toolLifecycle == null) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Tool chat is not enabled.");
        }

        if (request == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Chat request is required.");
        }

        if (toolAccess == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Tool chat authentication is not configured.");
        }
        var owner = toolAccess.requireOwner(httpRequest, request.companyId());
        if (owner == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Tool chat authentication is not configured.");
        }

        String effectiveRequestId = requestId == null
                ? UUID.randomUUID().toString()
                : requestId;

        return toolLifecycle.chat(
                owner,
                request.toChatRequest(),
                request.agentId(),
                effectiveRequestId);
    }

    public AiChatService.ChatReply chatMessagesWithTools(ToolChatRequest request) {
        return chatMessagesWithTools(request, null, null);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleRequestError(
            ResponseStatusException error) {

        String message = error.getReason();

        return ResponseEntity
                .status(error.getStatusCode())
                .body(Map.of(
                        "message",
                        message == null ? "Chat request failed." : message));
    }

    @PostMapping("/stream")
    public void stream(
            @RequestBody AiChatMessagesRequest request,
            HttpServletResponse response) throws IOException {

        // 这里先检查参数、能力、Provider 和上游 HTTP 状态。
        // 失败时还没有开始输出，可以使用已有的 JSON 错误处理。
        try (InputStream upstream = service.openChatStream(request)) {

            var timedOut = new AtomicBoolean(false);

            // Java 21 虚拟线程：两分钟后关闭上游流，
            // 避免读取一直卡住。
            Thread watchdog = Thread.ofVirtual()
                    .name("ai-chat-stream-timeout")
                    .start(() -> {
                        try {
                            Thread.sleep(120_000);

                            timedOut.set(true);
                            upstream.close();
                        } catch (InterruptedException ignored) {
                            // 正常结束时会中断这个计时线程。
                        } catch (IOException ignored) {
                            // 连接可能已经关闭。
                        }
                    });

            try {
                response.setContentType("text/event-stream");
                response.setCharacterEncoding("UTF-8");
                response.setHeader("Cache-Control", "no-cache");
                response.setHeader("X-Accel-Buffering", "no");

                // 发送响应头，正式开始流式响应。
                response.flushBuffer();

                var output = response.getOutputStream();
                byte[] buffer = new byte[4096];

                while (true) {
                    int count;

                    try {
                        count = upstream.read(buffer);
                    } catch (IOException error) {
                        writeStreamError(
                                response,
                                timedOut.get()
                                        ? "Model stream timed out."
                                        : "The connection closed while reading the model reply.");
                        return;
                    }

                    if (timedOut.get()) {
                        writeStreamError(
                                response,
                                "Model stream timed out.");
                        return;
                    }

                    if (count == -1) {
                        break;
                    }

                    if (count == 0) {
                        continue;
                    }

                    output.write(buffer, 0, count);
                    output.flush();
                }

            } finally {
                watchdog.interrupt();
            }
        }
    }

    private void writeStreamError(
            HttpServletResponse response,
            String message) throws IOException {

        String json = new ObjectMapper().writeValueAsString(
                Map.of(
                        "error",
                        Map.of("message", message)));

        String event = "\n\ndata: " + json + "\n\n";

        var output = response.getOutputStream();

        output.write(
                event.getBytes(StandardCharsets.UTF_8));

        output.flush();
    }
}
