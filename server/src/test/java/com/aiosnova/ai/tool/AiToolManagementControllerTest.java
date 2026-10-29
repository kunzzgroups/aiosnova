package com.aiosnova.ai.tool;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class AiToolManagementControllerTest {

    private static final class FakeRepository extends AiToolRepository {

        boolean empty;
        String status = "active";
        String executorType = "calculator";
        String configuration = "{}";

        FakeRepository() {
            super(new JdbcTemplate());
        }

        @Override
        public boolean companyExistsInMerchant(
                String company, String merchant) {

            return "company-test".equals(company)
                    && "merchant-test".equals(merchant);
        }

        @Override
        public List<ToolRow> findTools(
                String company, String merchant) {

            if (empty || !companyExistsInMerchant(company, merchant)) {
                return List.of();
            }

            return List.of(new ToolRow(
                    "tool-test",
                    "company-test",
                    "Calculator",
                    "Test calculator",
                    "Utility",
                    "calc.run",
                    executorType,
                    "low",
                    status,
                    30,
                    false,
                    configuration,
                    3L));
        }

        @Override
        public List<String> findBoundAgentIds(
                String company, String toolId) {

            assertEquals("company-test", company);
            assertEquals("tool-test", toolId);
            return List.of("agent-test");
        }
    }

    private final FakeRepository repository = new FakeRepository();

    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(
            new AiToolManagementController(
                    new AiToolReadService(
                            repository, "merchant-test")))
            .build();

    private JsonNode body(MvcResult result) {
        String text = new String(
                result.getResponse().getContentAsByteArray(),
                StandardCharsets.UTF_8);

        return new JsonMapper().readTree(text);
    }

    @Test
    void listsStoredToolsWithVersionAndAgentIds() throws Exception {
        var result = mvc.perform(
                get("/api/ai/tools")
                        .param("companyId", "company-test"))
                .andReturn();

        assertEquals(200, result.getResponse().getStatus());

        var items = body(result).path("items");

        assertEquals(1, items.size());
        assertEquals("tool-test", items.get(0).path("id").asString());
        assertEquals(3, items.get(0).path("version").asInt());
        assertEquals("supported", items.get(0).path("executionSupport").asString());
        assertFalse(items.get(0).path("executionSupportReason").asString().isBlank());
        assertTrue(items.get(0).path("configuration").isObject());
        assertEquals(
                "agent-test",
                items.get(0).path("agentIds").get(0).asString());
    }

    @Test
    void returnsToolDetail() throws Exception {
        var result = mvc.perform(
                get("/api/ai/tools/tool-test")
                        .param("companyId", "company-test"))
                .andReturn();

        assertEquals(200, result.getResponse().getStatus());
        assertEquals("Calculator", body(result).path("name").asString());
        assertEquals("active", body(result).path("status").asString());
        assertEquals("supported", body(result).path("executionSupport").asString());
    }

    @Test
    void disabledToolStillReportsExecutionSupport() throws Exception {
        repository.status = "disabled";
        var result = mvc.perform(get("/api/ai/tools/tool-test")
                .param("companyId", "company-test")).andReturn();
        assertEquals(200, result.getResponse().getStatus());
        assertEquals("disabled", body(result).path("status").asString());
        assertEquals("supported", body(result).path("executionSupport").asString());
        var source = new AiToolDatabaseSource(repository, "merchant-test");
        assertFalse(source.findTools("company-test").getFirst().enabled());
    }

    @Test
    void activeUnknownExecutorDoesNotReportSupported() throws Exception {
        repository.executorType = "unknown_executor";
        var result = mvc.perform(get("/api/ai/tools/tool-test")
                .param("companyId", "company-test")).andReturn();
        assertEquals(200, result.getResponse().getStatus());
        assertEquals("active", body(result).path("status").asString());
        assertEquals("not_implemented", body(result).path("executionSupport").asString());
        assertFalse(new AiToolDatabaseSource(repository, "merchant-test")
                .findTools("company-test").getFirst().enabled());
    }

    @Test
    void unsupportedConfigurationIsReportedAndDenied() throws Exception {
        repository.configuration = "{\"unexpected\":true}";
        var result = mvc.perform(get("/api/ai/tools/tool-test")
                .param("companyId", "company-test")).andReturn();
        assertEquals(200, result.getResponse().getStatus());
        assertEquals("unsupported_configuration",
                body(result).path("executionSupport").asString());
        assertFalse(body(result).path("executionSupportReason").asString().isBlank());
        assertFalse(new AiToolDatabaseSource(repository, "merchant-test")
                .findTools("company-test").getFirst().enabled());
    }

    @Test
    void emptyCompanyListDoesNotInventMockTools() throws Exception {
        repository.empty = true;

        var result = mvc.perform(
                get("/api/ai/tools")
                        .param("companyId", "company-test"))
                .andReturn();

        assertEquals(200, result.getResponse().getStatus());
        assertEquals(0, body(result).path("items").size());
    }

    @Test
    void missingToolReturns404() throws Exception {
        var result = mvc.perform(
                get("/api/ai/tools/missing")
                        .param("companyId", "company-test"))
                .andReturn();

        assertEquals(404, result.getResponse().getStatus());
    }

    @Test
    void foreignCompanyIsRejected() throws Exception {
        var result = mvc.perform(
                get("/api/ai/tools")
                        .param("companyId", "other-company"))
                .andReturn();

        assertEquals(403, result.getResponse().getStatus());
    }

    @Test
    void invalidCompanyIsRejected() throws Exception {
        var result = mvc.perform(
                get("/api/ai/tools")
                        .param("companyId", "../company"))
                .andReturn();

        assertEquals(400, result.getResponse().getStatus());
    }
}
