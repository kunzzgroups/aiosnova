package com.aiosnova.ai.chat;

import com.aiosnova.ai.tool.AiToolAuthorizationService;
import com.aiosnova.ai.tool.AiToolRegistry;

import java.util.Map;
import java.util.Set;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;
import java.util.List;

import jakarta.servlet.http.HttpServletResponse;
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

@RestController
@RequestMapping("/api/ai/chat")
public class AiChatController {

    private final AiChatService service;

    private final AiToolAuthorizationService toolAuthorization;

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
            @Value("${ai.tools.chat.enabled:false}") boolean toolsEnabled) {

        this(
                service,
                toolsEnabled ? authorization.getObject() : null);
    }

    /**
     * Simulated MVC tests only.
     * Normal application startup keeps tool chat disabled.
     */
    AiChatController(
            AiChatService service,
            AiToolAuthorizationService toolAuthorization) {

        this.service = service;
        this.toolAuthorization = toolAuthorization;
    }

    public record ChatRequest(
            String companyId,
            String providerId,
            String modelId,
            String message) {
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
            @RequestBody ToolChatRequest request) {

        if (toolAuthorization == null) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Tool chat is not enabled.");
        }

        if (request == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Chat request is required.");
        }

        return service.chatMessagesWithAuthorizedTools(
                request.toChatRequest(),
                request.agentId(),
                toolAuthorization);
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