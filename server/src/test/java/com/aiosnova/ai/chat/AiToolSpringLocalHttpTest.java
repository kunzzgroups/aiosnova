package com.aiosnova.ai.chat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static com.aiosnova.ai.chat.AiToolSpringTestSupport.*;

class AiToolSpringLocalHttpTest {

    @Test
    void springToolChatCompletesTwoRoundsThroughLocalHttp() throws Exception {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();
        var json = new ObjectMapper();
        String firstResponse = json.writeValueAsString(Map.of(
                "choices", List.of(Map.of(
                        "finish_reason", "tool_calls",
                        "message", Map.of(
                                "role", "assistant",
                                "tool_calls", List.of(Map.of(
                                        "id", "call_spring_add",
                                        "type", "function",
                                        "function", Map.of(
                                                "name", "calc_run",
                                                "arguments", json.writeValueAsString(Map.of(
                                                        "operation", "add", "a", 2, "b", 3))))))))));
        String finalResponse = """
                {"choices":[{"finish_reason":"stop","message":{
                  "role":"assistant","content":"The answer is 5."}}]}
                """;

        try (var upstream = new AiLocalHttpUpstream(List.of(
                new AiLocalHttpUpstream.Reply(200, firstResponse),
                new AiLocalHttpUpstream.Reply(200, finalResponse)));
                var context = authorizedContext(fixture, repository,
                        upstream.forwardingTransport("fake-integration-key"))) {
            var mvc = MockMvcBuilders.standaloneSetup(
                    context.getBean(AiChatController.class)).build();
            var result = mvc.perform(post("/api/ai/chat/messages/tools")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""
                            {"companyId":"company-test","agentId":"agent-test",
                             "providerId":"provider-test","modelId":"test/model",
                             "temperature":1.9,"messages":[{
                               "role":"user","content":"Calculate 2 + 3."}]}
                            """))
                    .andReturn();

            assertEquals(200, result.getResponse().getStatus());
            assertEquals("The answer is 5.", json.readTree(
                    result.getResponse().getContentAsByteArray()).path("reply").asString());
            assertEquals(1, fixture.calculator.executions);
            assertEquals(0, fixture.transport.requests.size());
            var captured = upstream.requests();
            assertEquals(2, captured.size());
            for (var request : captured) {
                assertEquals("POST", request.method());
                assertEquals("Bearer fake-integration-key", request.authorization());
                var body = json.readTree(request.body());
                assertEquals("test/model", body.path("model").asString());
                assertFalse(body.path("stream").asBoolean());
                assertEquals(0.4, body.path("temperature").asDouble());
                assertEquals(0.75, body.path("top_p").asDouble());
                assertEquals(512, body.path("max_tokens").asInt());
            }
            var first = json.readTree(captured.get(0).body());
            var second = json.readTree(captured.get(1).body());
            assertEquals("auto", first.path("tool_choice").asString());
            assertEquals("none", second.path("tool_choice").asString());
            assertEquals(1, first.path("tools").size());
            assertEquals("calc_run", first.path("tools").get(0)
                    .path("function").path("name").asString());
            assertEquals(first.path("tools"), second.path("tools"));
            var messages = second.path("messages");
            assertEquals(3, messages.size());
            assertEquals(first.path("messages").get(0), messages.get(0));
            assertEquals("assistant", messages.get(1).path("role").asString());
            assertEquals(json.readTree(firstResponse).path("choices").get(0)
                    .path("message").path("tool_calls"), messages.get(1).path("tool_calls"));
            var toolMessage = messages.get(2);
            assertEquals("tool", toolMessage.path("role").asString());
            assertEquals("call_spring_add", toolMessage.path("tool_call_id").asString());
            var output = json.readTree(toolMessage.path("content").asString());
            assertTrue(output.path("ok").asBoolean());
            assertEquals(5.0, output.path("output").path("result").asDouble());
        }
    }

    private void assertLocalHttpAuthorizationDenied(
            boolean toolActive,
            boolean toolAssigned) throws Exception {

        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        repository.active = toolActive;
        repository.assigned = toolAssigned;

        // 不准备任何模型响应：授权拒绝时不应访问上游。
        try (var upstream = new AiLocalHttpUpstream(List.of());
                var context = authorizedContext(
                        fixture,
                        repository,
                        upstream.forwardingTransport("fake-integration-key"))) {

            assertRejectedBeforeModel(context, fixture, 403);

            assertEquals(
                    0,
                    upstream.requests().size(),
                    "Authorization rejection must not send HTTP requests.");

            assertEquals(0, fixture.calculator.executions);

            // 也不能退回内存模拟 Transport。
            assertEquals(0, fixture.transport.requests.size());
        }
    }

    @Test
    void springLocalHttpRejectsDisabledToolWithoutExecution()
            throws Exception {

        // 工具停用，Agent绑定保留。
        assertLocalHttpAuthorizationDenied(false, true);
    }

    @Test
    void springLocalHttpRejectsUnboundToolWithoutExecution()
            throws Exception {

        // 工具启用，Agent工具绑定清空。
        assertLocalHttpAuthorizationDenied(true, false);
    }

    private void assertAuthorizationRevokedAfterFirstLocalHttpResponse(
            boolean disableTool) throws Exception {

        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        var changes = new java.util.concurrent.atomic.AtomicInteger();

        String firstResponse = """
                {
                  "choices": [{
                    "finish_reason": "tool_calls",
                    "message": {
                      "role": "assistant",
                      "content": null,
                      "tool_calls": [{
                        "id": "call_revocation_add",
                        "type": "function",
                        "function": {
                          "name": "calc_run",
                          "arguments": "{\\"operation\\":\\"add\\",\\"a\\":2,\\"b\\":3}"
                        }
                      }]
                    }
                  }]
                }
                """;

        try (var upstream = new AiLocalHttpUpstream(List.of(
                new AiLocalHttpUpstream.Reply(200, firstResponse)))) {

            var forwarding = upstream.forwardingTransport("fake-integration-key");

            AiChatService.ChatTransport transport = request -> {
                var response = forwarding.send(request);

                if (upstream.requests().size() == 1) {
                    assertEquals(200, response.statusCode());

                    // 初始授权正常，第一轮HTTP完成后才改变状态。
                    assertTrue(repository.active);
                    assertTrue(repository.assigned);
                    assertEquals(0, fixture.calculator.executions);

                    if (disableTool) {
                        repository.active = false;
                    } else {
                        repository.assigned = false;
                    }

                    changes.incrementAndGet();
                }

                return response;
            };

            try (var context = authorizedContext(
                    fixture,
                    repository,
                    transport)) {

                // 这里同时检查403、错误消息、没有reply、
                // 内存模拟Transport为0次、Calculator为0次。
                assertRejectedBeforeModel(context, fixture, 403);

                // 真正的网络请求次数必须单独检查。
                assertEquals(1, upstream.requests().size());
                assertEquals(1, changes.get());
                assertEquals(0, fixture.calculator.executions);
                assertEquals(0, fixture.transport.requests.size());

                if (disableTool) {
                    assertFalse(repository.active);
                    assertTrue(repository.assigned);
                } else {
                    assertTrue(repository.active);
                    assertFalse(repository.assigned);
                }

                var first = new ObjectMapper().readTree(
                        upstream.requests().get(0).body());

                assertEquals(
                        "auto",
                        first.path("tool_choice").asString());

                assertEquals(
                        "calc_run",
                        first.path("tools").get(0)
                                .path("function").path("name").asString());
            }
        }
    }

    @Test
    void springLocalHttpStopsWhenToolIsDisabledAfterFirstResponse()
            throws Exception {

        assertAuthorizationRevokedAfterFirstLocalHttpResponse(true);
    }

    @Test
    void springLocalHttpStopsWhenBindingIsRevokedAfterFirstResponse()
            throws Exception {

        assertAuthorizationRevokedAfterFirstLocalHttpResponse(false);
    }

    private void assertAuthorizationRevokedAfterLocalHttpToolExecution(
            boolean disableTool) throws Exception {

        var fixture = new AiChatToolIntegrationTest.Fixture();
        var repository = new AiChatToolDatabaseAuthorizationTest.FakeRepository();

        var changes = new java.util.concurrent.atomic.AtomicInteger();

        String firstResponse = """
                {
                  "choices": [{
                    "finish_reason": "tool_calls",
                    "message": {
                      "role": "assistant",
                      "content": null,
                      "tool_calls": [{
                        "id": "call_after_execution",
                        "type": "function",
                        "function": {
                          "name": "calc_run",
                          "arguments": "{\\"operation\\":\\"add\\",\\"a\\":2,\\"b\\":3}"
                        }
                      }]
                    }
                  }]
                }
                """;

        try (var upstream = new AiLocalHttpUpstream(List.of(
                new AiLocalHttpUpstream.Reply(200, firstResponse)))) {

            fixture.calculator.afterExecution = () -> {
                assertEquals(1, upstream.requests().size());
                assertEquals(1, fixture.calculator.executions);

                assertTrue(repository.active);
                assertTrue(repository.assigned);

                if (disableTool) {
                    repository.active = false;
                } else {
                    repository.assigned = false;
                }

                changes.incrementAndGet();
            };

            try (var context = authorizedContext(
                    fixture,
                    repository,
                    upstream.forwardingTransport("fake-integration-key"))) {

                assertRejectedAfterExecution(
                        context,
                        fixture,
                        403,
                        0,
                        1);

                assertEquals(1, upstream.requests().size());
                assertEquals(1, changes.get());
                assertEquals(1, fixture.calculator.executions);

                if (disableTool) {
                    assertFalse(repository.active);
                    assertTrue(repository.assigned);
                } else {
                    assertTrue(repository.active);
                    assertFalse(repository.assigned);
                }
            }
        }
    }

    @Test
    void springLocalHttpStopsSecondRequestAfterToolIsDisabled()
            throws Exception {

        assertAuthorizationRevokedAfterLocalHttpToolExecution(true);
    }

    @Test
    void springLocalHttpStopsSecondRequestAfterBindingIsRevoked()
            throws Exception {

        assertAuthorizationRevokedAfterLocalHttpToolExecution(false);
    }}
