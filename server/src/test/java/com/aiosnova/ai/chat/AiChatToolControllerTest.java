package com.aiosnova.ai.chat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class AiChatToolControllerTest {

        private static final String URL = "/api/ai/chat/messages/tools";

        private final JsonMapper json = JsonMapper.builder().build();

        private MockMvc enabledMvc(
                        AiChatToolIntegrationTest.Fixture fixture) {

                var policy = new AiToolAuthorizationFixture(fixture);

                return MockMvcBuilders.standaloneSetup(
                                new AiChatController(
                                                fixture.service,
                                                policy.authorization))
                                .build();
        }

        private String requestBody(String companyId, String role) {
                return json.writeValueAsString(
                                Map.of(
                                                "companyId", companyId,
                                                "agentId", "agent-test",
                                                "providerId", "provider-test",
                                                "modelId", "test/model",
                                                "messages", List.of(
                                                                Map.of(
                                                                                "role", role,
                                                                                "content", "Calculate 2 + 3."))));
        }

        private String errorMessage(
                        org.springframework.test.web.servlet.MvcResult result) {

                String body = new String(
                                result.getResponse().getContentAsByteArray(),
                                java.nio.charset.StandardCharsets.UTF_8);

                return json.readTree(body).path("message").asString();
        }

        @Test
        void normalControllerKeepsToolEndpointDisabled()
                        throws Exception {

                var fixture = new AiChatToolIntegrationTest.Fixture();

                var mvc = MockMvcBuilders.standaloneSetup(
                                new AiChatController(fixture.service)).build();

                var result = mvc.perform(
                                post(URL)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(requestBody("company-test", "user")))
                                .andReturn();

                assertEquals(503, result.getResponse().getStatus());
                assertEquals("Tool chat is not enabled.", errorMessage(result));
                assertEquals(0, fixture.transport.requests.size());
                assertEquals(0, fixture.calculator.executions);
        }

        @Test
        void simulatedEndpointReturnsFinalAnswer()
                        throws Exception {

                var fixture = new AiChatToolIntegrationTest.Fixture();

                var result = enabledMvc(fixture).perform(
                                post(URL)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(requestBody("company-test", "user")))
                                .andReturn();

                assertEquals(200, result.getResponse().getStatus());

                var response = json.readTree(
                                result.getResponse().getContentAsString());

                assertEquals("test/model", response.path("modelId").asString());
                assertEquals(
                                "The answer is 5.",
                                response.path("reply").asString());

                assertEquals(2, fixture.transport.requests.size());
                assertEquals(1, fixture.calculator.executions);
        }

        @Test
        void companyWithoutToolScopeIsRejected()
                        throws Exception {

                var fixture = new AiChatToolIntegrationTest.Fixture();

                var result = enabledMvc(fixture).perform(
                                post(URL)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(requestBody("other-company", "user")))
                                .andReturn();

                assertEquals(403, result.getResponse().getStatus());
                assertEquals(0, fixture.transport.requests.size());
                assertEquals(0, fixture.calculator.executions);
        }

        @Test
        void disabledModelReturnsConflict()
                        throws Exception {

                var fixture = new AiChatToolIntegrationTest.Fixture();
                fixture.models.enabled = false;

                var result = enabledMvc(fixture).perform(
                                post(URL)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(requestBody("company-test", "user")))
                                .andReturn();

                assertEquals(409, result.getResponse().getStatus());
                assertTrue(errorMessage(result).contains("disabled"));
                assertEquals(0, fixture.transport.requests.size());
                assertEquals(0, fixture.calculator.executions);
        }

        @Test
        void disablingAfterFirstResponseStopsBeforeToolExecution()
                        throws Exception {

                var fixture = new AiChatToolIntegrationTest.Fixture();

                fixture.transport.afterFirstResponse = () -> fixture.models.enabled = false;

                var result = enabledMvc(fixture).perform(
                                post(URL)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(requestBody("company-test", "user")))
                                .andReturn();

                assertEquals(409, result.getResponse().getStatus());
                assertEquals(1, fixture.transport.requests.size());
                assertEquals(0, fixture.calculator.executions);
        }

        @Test
        void disablingAfterToolExecutionStopsSecondRequest()
                        throws Exception {

                var fixture = new AiChatToolIntegrationTest.Fixture();

                fixture.calculator.afterExecution = () -> fixture.models.enabled = false;

                var result = enabledMvc(fixture).perform(
                                post(URL)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(requestBody("company-test", "user")))
                                .andReturn();

                assertEquals(409, result.getResponse().getStatus());
                assertEquals(1, fixture.transport.requests.size());
                assertEquals(1, fixture.calculator.executions);
        }

        @Test
        void toolFailureReturnsSafeErrorWithoutRetry()
                        throws Exception {

                var fixture = new AiChatToolIntegrationTest.Fixture();
                fixture.calculator.fail = true;

                var result = enabledMvc(fixture).perform(
                                post(URL)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(requestBody("company-test", "user")))
                                .andReturn();

                assertEquals(502, result.getResponse().getStatus());
                assertFalse(errorMessage(result).contains("SECRET"));
                assertEquals(1, fixture.transport.requests.size());
                assertEquals(1, fixture.calculator.executions);
        }

        @Test
        void clientCannotSubmitToolRoleAsOriginalInput()
                        throws Exception {

                var fixture = new AiChatToolIntegrationTest.Fixture();

                var result = enabledMvc(fixture).perform(
                                post(URL)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(requestBody("company-test", "tool")))
                                .andReturn();

                assertEquals(400, result.getResponse().getStatus());
                assertEquals(0, fixture.transport.requests.size());
                assertEquals(0, fixture.calculator.executions);
        }
}