package com.aiosnova.ai.chat;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import com.aiosnova.ai.model.AiModelRepository.ModelSummary;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class AiAutoAgentToolControllerTest {

    private final JsonMapper json = JsonMapper.builder().build();

    private AiChatToolIntegrationTest.Fixture autoFixture() {
        var fixture = new AiChatToolIntegrationTest.Fixture();

        fixture.boundProvider = null;
        fixture.boundModelConfig = null;

        return fixture;
    }

    private void addModel(
            AiChatToolIntegrationTest.Fixture fixture,
            String externalId,
            String configId) {

        var original = fixture.models.findByExternalId(
                fixture.company,
                "provider-test",
                "test/model").orElseThrow();

        fixture.models.additionalModels.put(
                "provider-test\n" + externalId,
                new ModelSummary(
                        configId,
                        fixture.company,
                        "provider-test",
                        externalId,
                        "Alternate test model",
                        "chat",
                        "enabled",
                        "",
                        32000,
                        32000,
                        null,
                        original.capabilities(),
                        original.capabilitiesCheckedAt(),
                        null,
                        0L));
    }

    private MvcResult send(
            AiChatToolIntegrationTest.Fixture fixture,
            String company,
            String model) throws Exception {

        var policy = new AiToolAuthorizationFixture(fixture);

        var mvc = MockMvcBuilders.standaloneSetup(
                new AiChatController(fixture.service, policy.authorization, new AiToolChatLifecycle(fixture.service, policy.authorization, new AiToolChatRequests()), fixture.access))
                .build();

        var body = json.writeValueAsString(Map.of(
                "companyId", company,
                "agentId", "agent-test",
                "providerId", "provider-test",
                "modelId", model,
                "messages", List.of(Map.of(
                        "role", "user",
                        "content", "Calculate 2 + 3."))));

        return mvc.perform(post("/api/ai/chat/messages/tools")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();
    }

    private void assertOutcome(
            MvcResult result,
            AiChatToolIntegrationTest.Fixture fixture,
            int status,
            int requests,
            int executions) {

        assertEquals(status, result.getResponse().getStatus());
        assertEquals(requests, fixture.transport.requests.size());
        assertEquals(executions, fixture.calculator.executions);
    }

    private String message(MvcResult result) {
        return json.readTree(new String(
                        result.getResponse().getContentAsByteArray(),
                        StandardCharsets.UTF_8))
                .path("message").asString("");
    }

    @Test
    void autoAgentUsesValidSelectedModel() throws Exception {
        var fixture = autoFixture();

        var result = send(
                fixture, "company-test", "test/model");

        assertOutcome(result, fixture, 200, 2, 1);
    }

    @Test
    void autoAgentCanUseAnotherValidModelInSameCompany()
            throws Exception {

        var fixture = autoFixture();
        addModel(fixture, "test/alternate", "alternate-config");

        var result = send(
                fixture, "company-test", "test/alternate");

        assertOutcome(result, fixture, 200, 2, 1);

        var body = json.readTree(new String(
                result.getResponse().getContentAsByteArray(),
                StandardCharsets.UTF_8));

        assertEquals(
                "test/alternate",
                body.path("modelId").asString());
    }

    @Test
    void autoAgentCannotChangeCompanyScope() throws Exception {
        var fixture = autoFixture();

        var result = send(
                fixture, "other-company", "test/model");

        assertOutcome(result, fixture, 403, 0, 0);
    }

    @Test
    void autoAgentCannotUseModelAvailableOnlyInAnotherCompany()
            throws Exception {

        var fixture = autoFixture();
        var foreign = new AiChatToolIntegrationTest.Fixture(
                "other-company");

        addModel(
                foreign,
                "test/foreign-only",
                "foreign-config");

        // Confirm that the target exists in the other company's catalog.
        assertTrue(foreign.models.findByExternalId(
                "other-company",
                "provider-test",
                "test/foreign-only").isPresent());

        assertTrue(fixture.models.findByExternalId(
                "company-test",
                "provider-test",
                "test/foreign-only").isEmpty());

        var result = send(
                fixture, "company-test", "test/foreign-only");

        assertOutcome(result, fixture, 404, 0, 0);
    }

    @Test
    void autoAgentCannotUseDisabledModel() throws Exception {
        var fixture = autoFixture();
        fixture.models.enabled = false;

        var result = send(
                fixture, "company-test", "test/model");

        assertOutcome(result, fixture, 409, 0, 0);
        assertTrue(message(result).contains("disabled"));
    }

    private void switchBindingMode(
            AiChatToolIntegrationTest.Fixture fixture,
            boolean initiallyAuto) {

        if (initiallyAuto) {
            fixture.boundProvider = "provider-test";
            fixture.boundModelConfig = "model-config-test";
        } else {
            fixture.boundProvider = null;
            fixture.boundModelConfig = null;
        }
    }

    @Test
    void eitherModeSwitchAfterFirstResponseStopsTool()
            throws Exception {

        for (boolean initiallyAuto : new boolean[]{true, false}) {
            var fixture = initiallyAuto
                    ? autoFixture()
                    : new AiChatToolIntegrationTest.Fixture();

            fixture.transport.afterFirstResponse =
                    () -> switchBindingMode(fixture, initiallyAuto);

            var result = send(
                    fixture, "company-test", "test/model");

            assertOutcome(result, fixture, 409, 1, 0);
            assertTrue(message(result).contains(
                    "Agent model binding changed"));
        }
    }

    @Test
    void eitherModeSwitchAfterExecutionStopsSecondRequest()
            throws Exception {

        for (boolean initiallyAuto : new boolean[]{true, false}) {
            var fixture = initiallyAuto
                    ? autoFixture()
                    : new AiChatToolIntegrationTest.Fixture();

            fixture.calculator.afterExecution =
                    () -> switchBindingMode(fixture, initiallyAuto);

            var result = send(
                    fixture, "company-test", "test/model");

            assertOutcome(result, fixture, 409, 1, 1);
            assertTrue(message(result).contains(
                    "Agent model binding changed"));
        }
    }
}