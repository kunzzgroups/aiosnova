package com.aiosnova.ai.tool;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

class AiToolManagementWriteControllerTest {

    private final JsonMapper json = JsonMapper.builder().build();

    private final AiToolWriteServiceTest fixture =
            new AiToolWriteServiceTest();

    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(
            new AiToolManagementController(
                    new AiToolReadService(
                            fixture.repository, "merchant-test"),
                    fixture.service))
            .build();

    private Map<String, Object> saveBody() {
        var body = new HashMap<String, Object>();

        body.put("companyId", "company-test");
        body.put("name", "Calculator");
        body.put("description", "API test");
        body.put("module", "Utility");
        body.put("action", "calc.run");
        body.put("executorType", "calculator");
        body.put("risk", "low");
        body.put("status", "active");
        body.put("timeoutSeconds", 30);
        body.put("requiresConfirmation", false);
        body.put("configuration", Map.of());
        body.put("agentIds", List.of("agent-a", "agent-b"));

        return body;
    }

    private JsonNode body(MvcResult result) {
        return json.readTree(new String(
                result.getResponse().getContentAsByteArray(),
                StandardCharsets.UTF_8));
    }

    private String createTool() throws Exception {
        var result = mvc.perform(
                post("/api/ai/tools")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(saveBody())))
                .andReturn();

        assertEquals(201, result.getResponse().getStatus());
        assertEquals(0, body(result).path("version").asLong());

        return body(result).path("id").asString();
    }

    @Test
    void createsToolAndBindings() throws Exception {
        String id = createTool();

        assertEquals(id, fixture.repository.tool.id());
        assertEquals("Calculator", fixture.repository.tool.name());
        assertEquals(
                List.of("agent-a", "agent-b"),
                fixture.repository.bindings);
    }

    @Test
    void editsConfigurationAndBindings() throws Exception {
        String id = createTool();
        var input = saveBody();

        input.put("version", 0);
        input.put("name", "Edited");
        input.put("configuration", Map.of("note", "stored"));
        input.put("agentIds", List.of("agent-b"));

        var result = mvc.perform(
                put("/api/ai/tools/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(input)))
                .andReturn();

        assertEquals(200, result.getResponse().getStatus());
        assertEquals(1, body(result).path("version").asLong());
        assertEquals("Edited", fixture.repository.tool.name());
        assertEquals(List.of("agent-b"), fixture.repository.bindings);
        assertEquals(
                "stored",
                json.readTree(fixture.repository.tool.configuration())
                        .path("note").asString());
    }

    @Test
    void disablingPreservesBindings() throws Exception {
        String id = createTool();

        var result = mvc.perform(
                patch("/api/ai/tools/" + id + "/enabled")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "companyId", "company-test",
                                "enabled", false,
                                "version", 0))))
                .andReturn();

        assertEquals(200, result.getResponse().getStatus());
        assertEquals("disabled", fixture.repository.tool.status());
        assertEquals(1, fixture.repository.version);
        assertEquals(
                List.of("agent-a", "agent-b"),
                fixture.repository.bindings);
    }

    @Test
    void replacesAndClearsBindings() throws Exception {
        String id = createTool();

        for (int version = 0; version < 2; version++) {
            List<String> agents = version == 0
                    ? List.of("agent-b")
                    : List.of();

            var result = mvc.perform(
                    put("/api/ai/tools/" + id + "/agents")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of(
                                    "companyId", "company-test",
                                    "agentIds", agents,
                                    "version", version))))
                    .andReturn();

            assertEquals(200, result.getResponse().getStatus());
            assertEquals(
                    version + 1,
                    body(result).path("version").asLong());
            assertEquals(agents, fixture.repository.bindings);
        }
    }

    @Test
    void staleVersionReturns409WithoutChanges() throws Exception {
        String id = createTool();
        var original = fixture.repository.tool;

        var result = mvc.perform(
                patch("/api/ai/tools/" + id + "/enabled")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "companyId", "company-test",
                                "enabled", false,
                                "version", 9))))
                .andReturn();

        assertEquals(409, result.getResponse().getStatus());
        assertEquals(original, fixture.repository.tool);
        assertEquals(0, fixture.repository.version);
    }

    @Test
    void foreignCompanyCannotChangeTool() throws Exception {
        String id = createTool();

        var result = mvc.perform(
                patch("/api/ai/tools/" + id + "/enabled")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "companyId", "other-company",
                                "enabled", false,
                                "version", 0))))
                .andReturn();

        assertEquals(403, result.getResponse().getStatus());
        assertEquals("active", fixture.repository.tool.status());
        assertEquals(0, fixture.repository.version);
    }

    @Test
    void foreignAgentBindingIsRejected() throws Exception {
        String id = createTool();

        var result = mvc.perform(
                put("/api/ai/tools/" + id + "/agents")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "companyId", "company-test",
                                "agentIds", List.of("foreign-agent"),
                                "version", 0))))
                .andReturn();

        assertEquals(404, result.getResponse().getStatus());
        assertEquals(
                List.of("agent-a", "agent-b"),
                fixture.repository.bindings);
        assertEquals(0, fixture.repository.version);
    }

    @Test
    void missingVersionAndInvalidConfigurationReturn400()
            throws Exception {

        String id = createTool();

        var missingVersion = mvc.perform(
                patch("/api/ai/tools/" + id + "/enabled")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "companyId", "company-test",
                                "enabled", false))))
                .andReturn();

        assertEquals(400, missingVersion.getResponse().getStatus());

        var input = saveBody();
        input.put("version", 0);
        input.put("configuration", List.of());

        var invalidConfig = mvc.perform(
                put("/api/ai/tools/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(input)))
                .andReturn();

        assertEquals(400, invalidConfig.getResponse().getStatus());
        assertEquals(0, fixture.repository.version);
    }

    @Test
    void duplicateCreateReturnsSanitized409() throws Exception {
        createTool();

        var result = mvc.perform(
                post("/api/ai/tools")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(saveBody())))
                .andReturn();

        assertEquals(409, result.getResponse().getStatus());
        assertFalse(
                body(result).path("message").asString()
                        .contains("Duplicate test tool"));
    }

    @Test
    void bindingFailureRollsBackEditThroughApi() throws Exception {
        String id = createTool();
        var original = fixture.repository.tool;
        fixture.repository.failBindings = true;

        var input = saveBody();
        input.put("version", 0);
        input.put("name", "Must roll back");
        input.put("agentIds", List.of("agent-b"));

        var result = mvc.perform(
                put("/api/ai/tools/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(input)))
                .andReturn();

        assertEquals(409, result.getResponse().getStatus());
        assertEquals(original, fixture.repository.tool);
        assertEquals(0, fixture.repository.version);
        assertEquals(
                List.of("agent-a", "agent-b"),
                fixture.repository.bindings);
        assertFalse(
                body(result).path("message").asString()
                        .contains("Simulated binding failure"));
    }
}