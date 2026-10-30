package com.aiosnova.ai.mcp;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class AiMcpCatalogControllerTest {

    private static final String COMPANY = "company-j1";
    private static final String MERCHANT = "merchant-acme";
    private static final String SERVER = "server-test";

    private static AiMcpRepository.CatalogToolRow tool(
            String company,
            String schema) {

        return new AiMcpRepository.CatalogToolRow(
                "tool-test",
                company,
                SERVER,
                "calculator.add",
                "Add numbers",
                schema,
                false,
                true,
                2L,
                3L);
    }

    private static final class FakeRepository extends AiMcpRepository {

        int serverReads;
        int catalogReads;

        boolean missingServer;

        List<CatalogToolRow> rows = List.of(
                tool(COMPANY, "{\"type\":\"object\"}"));

        FakeRepository() {
            super(new JdbcTemplate());
        }

        @Override
        public Optional<ServerRow> findServer(
                String company, String merchant, String server) {

            serverReads++;

            if (missingServer
                    || !COMPANY.equals(company)
                    || !MERCHANT.equals(merchant)
                    || !SERVER.equals(server)) {
                return Optional.empty();
            }

            // 停用、未验证仍可查看配置目录。
            return Optional.of(new ServerRow(
                    SERVER, COMPANY, MERCHANT,
                    "Test MCP", "", "http://127.0.0.1:9090/mcp",
                    "streamable_http", "2025-11-25", "none",
                    false, 30, 2L, "not_verified", null, 4L));
        }

        @Override
        public List<CatalogToolRow> findCatalog(
                String company, String merchant, String server) {

            catalogReads++;

            assertEquals(COMPANY, company);
            assertEquals(MERCHANT, merchant);
            assertEquals(SERVER, server);

            return rows;
        }
    }

    private final FakeRepository repository = new FakeRepository();

    private MockMvc mvc(String merchant) {
        return MockMvcBuilders.standaloneSetup(
                new AiMcpManagementController(
                        new AiMcpReadService(repository, merchant)))
                .build();
    }

    private MvcResult read(
            MockMvc mvc,
            String company,
            String server) throws Exception {

        return mvc.perform(
                get("/api/ai/mcp/servers/{id}/tools", server)
                        .param("companyId", company))
                .andReturn();
    }

    private JsonNode body(MvcResult result) {
        return new JsonMapper().readTree(new String(
                result.getResponse().getContentAsByteArray(),
                StandardCharsets.UTF_8));
    }

    @Test
    void returnsStoredCatalogWithObjectSchemaAndSeparateStatusFields()
            throws Exception {

        var result = read(mvc(MERCHANT), COMPANY, SERVER);

        assertEquals(200, result.getResponse().getStatus());

        var items = body(result).path("items");
        assertEquals(1, items.size());

        var item = items.get(0);

        assertEquals("tool-test", item.path("id").asString());
        assertEquals(COMPANY, item.path("companyId").asString());
        assertEquals(SERVER, item.path("serverId").asString());
        assertEquals("calculator.add", item.path("remoteName").asString());
        assertEquals("Add numbers", item.path("description").asString());
        assertTrue(item.path("inputSchema").isObject());
        assertEquals(
                "object",
                item.path("inputSchema").path("type").asString());
        assertFalse(item.path("enabled").asBoolean());
        assertTrue(item.path("available").asBoolean());
        assertEquals(2L, item.path("discoveredConnectionRevision").asLong());
        assertEquals(3L, item.path("version").asLong());

        assertFalse(item.has("apiKey"));
        assertFalse(item.has("secretCiphertext"));

        assertEquals(1, repository.serverReads);
        assertEquals(1, repository.catalogReads);
    }

    @Test
    void existingServerWithoutToolsReturnsEmptyItems() throws Exception {
        repository.rows = List.of();

        var result = read(mvc(MERCHANT), COMPANY, SERVER);

        assertEquals(200, result.getResponse().getStatus());
        assertTrue(body(result).path("items").isArray());
        assertEquals(0, body(result).path("items").size());
    }

    @Test
    void missingServerOrOtherCompanyMerchantReturns404BeforeCatalogRead()
            throws Exception {

        assertEquals(404,
                read(mvc(MERCHANT), "company-j2", SERVER)
                        .getResponse().getStatus());

        assertEquals(404,
                read(mvc("merchant-other"), COMPANY, SERVER)
                        .getResponse().getStatus());

        assertEquals(404,
                read(mvc(MERCHANT), COMPANY, "missing-server")
                        .getResponse().getStatus());

        assertEquals(0, repository.catalogReads);
    }

    @Test
    void invalidIdsReturn400BeforeRepository() throws Exception {
        var mvc = mvc(MERCHANT);

        assertEquals(400,
                read(mvc, "bad.company", SERVER)
                        .getResponse().getStatus());

        assertEquals(400,
                read(mvc, COMPANY, "bad.server")
                        .getResponse().getStatus());

        assertEquals(0, repository.serverReads);
        assertEquals(0, repository.catalogReads);
    }

    @Test
    void invalidStoredSchemaReturnsSafeError() throws Exception {
        repository.rows = List.of(tool(COMPANY, "private-invalid-schema"));

        var result = read(mvc(MERCHANT), COMPANY, SERVER);

        assertEquals(502, result.getResponse().getStatus());
        assertEquals(
                "mcp_operation_failed",
                body(result).path("code").asString());

        assertFalse(new String(
                result.getResponse().getContentAsByteArray(),
                StandardCharsets.UTF_8)
                .contains("private-invalid-schema"));
    }

    @Test
    void unexpectedForeignToolRowIsNotReturned() throws Exception {
        repository.rows = List.of(
                tool("company-j2", "{\"type\":\"object\"}"));

        var result = read(mvc(MERCHANT), COMPANY, SERVER);

        assertEquals(502, result.getResponse().getStatus());
        assertFalse(body(result).has("items"));
    }
}