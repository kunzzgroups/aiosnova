package com.aiosnova.ai.mcp;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class AiMcpManagementControllerTest {

    private static final String SERVER_ID =
            "11111111-1111-4111-8111-111111111111";

    private static AiMcpRepository.ServerRow storedServer() {
        return new AiMcpRepository.ServerRow(
                SERVER_ID,
                "company-j1",
                "merchant-acme",
                "Local MCP",
                "Read API test",
                "http://127.0.0.1:9090/mcp",
                "streamable_http",
                "2025-11-25",
                "none",
                true,
                30,
                2L,
                "verified",
                2L,
                5L);
    }

    private static final class FakeRepository extends AiMcpRepository {

        boolean empty;
        int calls;
        String lastCompany;
        String lastMerchant;

        FakeRepository() {
            super(new JdbcTemplate());
        }

        @Override
        public List<ServerRow> findServers(
                String companyId,
                String merchantId) {

            calls++;
            lastCompany = companyId;
            lastMerchant = merchantId;

            if (empty
                    || !"company-j1".equals(companyId)
                    || !"merchant-acme".equals(merchantId)) {
                return List.of();
            }

            return List.of(storedServer());
        }

        @Override
        public Optional<ServerRow> findServer(
                String companyId,
                String merchantId,
                String serverId) {

            return findServers(companyId, merchantId)
                    .stream()
                    .filter(row -> row.id().equals(serverId))
                    .findFirst();
        }
    }

    private final FakeRepository repository = new FakeRepository();

    private final AiMcpReadService reads =
            new AiMcpReadService(repository, "merchant-acme");

    private MockMvc mvcFor(AiMcpReadService service) {
        return MockMvcBuilders.standaloneSetup(
                new AiMcpManagementController(service))
                .build();
    }

    private JsonNode body(MvcResult result) {
        String text = new String(
                result.getResponse().getContentAsByteArray(),
                StandardCharsets.UTF_8);

        return new JsonMapper().readTree(text);
    }

    @Test
    void serviceUsesConfiguredMerchantAndRejectsInvalidIds() {
        assertEquals(
                List.of(storedServer()),
                reads.list("company-j1"));

        assertEquals("company-j1", repository.lastCompany);
        assertEquals("merchant-acme", repository.lastMerchant);

        assertEquals(
                storedServer(),
                reads.get("company-j1", SERVER_ID));

        int callsBeforeInvalid = repository.calls;

        String[] invalidIds = {
                null,
                "",
                " ",
                "company/j1",
                "bad' OR '1'='1",
                "公司"
        };

        for (String invalid : invalidIds) {
            var companyError = assertThrows(
                    ResponseStatusException.class,
                    () -> reads.list(invalid));

            assertEquals(
                    HttpStatus.BAD_REQUEST,
                    companyError.getStatusCode());

            var serverError = assertThrows(
                    ResponseStatusException.class,
                    () -> reads.get("company-j1", invalid));

            assertEquals(
                    HttpStatus.BAD_REQUEST,
                    serverError.getStatusCode());
        }

        assertThrows(ResponseStatusException.class,
                () -> reads.list("a".repeat(65)));

        assertThrows(ResponseStatusException.class,
                () -> reads.get("company-j1", "a".repeat(37)));

        assertEquals(callsBeforeInvalid, repository.calls);

        assertThrows(IllegalArgumentException.class,
                () -> new AiMcpReadService(repository, ""));

        assertThrows(IllegalArgumentException.class,
                () -> new AiMcpReadService(repository, null));
    }

    @Test
    void listsServersWithExpectedFields() throws Exception {
        var result = mvcFor(reads).perform(
                get("/api/ai/mcp/servers")
                        .param("companyId", "company-j1"))
                .andReturn();

        assertEquals(200, result.getResponse().getStatus());

        var items = body(result).path("items");

        assertEquals(1, items.size());

        var server = items.get(0);

        assertEquals(SERVER_ID, server.path("id").asString());
        assertEquals("Local MCP", server.path("name").asString());
        assertEquals("company-j1", server.path("companyId").asString());
        assertEquals("merchant-acme", server.path("merchantId").asString());
        assertEquals(
                "http://127.0.0.1:9090/mcp",
                server.path("endpointUrl").asString());
        assertEquals("verified", server.path("verificationStatus").asString());
        assertEquals(2L, server.path("verificationRevision").asLong());
        assertEquals(5L, server.path("version").asLong());
        assertTrue(server.path("enabled").asBoolean());

        assertFalse(server.has("secretCiphertext"));
        assertFalse(server.has("apiKey"));
    }

    @Test
    void returnsDetailAndMissingDetail() throws Exception {
        var mvc = mvcFor(reads);

        var found = mvc.perform(
                get("/api/ai/mcp/servers/{serverId}", SERVER_ID)
                        .param("companyId", "company-j1"))
                .andReturn();

        assertEquals(200, found.getResponse().getStatus());
        assertEquals(SERVER_ID, body(found).path("id").asString());
        assertEquals(30, body(found).path("timeoutSeconds").asInt());

        var missing = mvc.perform(
                get("/api/ai/mcp/servers/{serverId}", "missing-server")
                        .param("companyId", "company-j1"))
                .andReturn();

        assertEquals(404, missing.getResponse().getStatus());
        assertEquals(
                "MCP server not found in this scope.",
                body(missing).path("message").asString());
    }

    @Test
    void returnsEmptyList() throws Exception {
        repository.empty = true;

        var result = mvcFor(reads).perform(
                get("/api/ai/mcp/servers")
                        .param("companyId", "company-j1"))
                .andReturn();

        assertEquals(200, result.getResponse().getStatus());
        assertTrue(body(result).path("items").isArray());
        assertEquals(0, body(result).path("items").size());
    }

    @Test
    void invalidHttpIdsReturnBadRequestBeforeRepository() throws Exception {
        var mvc = mvcFor(reads);

        var invalidCompany = mvc.perform(
                get("/api/ai/mcp/servers")
                        .param("companyId", "bad company"))
                .andReturn();

        assertEquals(400, invalidCompany.getResponse().getStatus());
        assertEquals(
                "Invalid company ID.",
                body(invalidCompany).path("message").asString());

        var invalidServer = mvc.perform(
                get("/api/ai/mcp/servers/{serverId}", "bad.id")
                        .param("companyId", "company-j1"))
                .andReturn();

        assertEquals(400, invalidServer.getResponse().getStatus());
        assertEquals(
                "Invalid MCP server ID.",
                body(invalidServer).path("message").asString());

        var missingCompany = mvc.perform(
                get("/api/ai/mcp/servers"))
                .andReturn();

        assertEquals(400, missingCompany.getResponse().getStatus());
        assertEquals(0, repository.calls);
    }

    @Test
    void companyAndMerchantScopesCannotReadOtherServer() throws Exception {
        var mvc = mvcFor(reads);

        var otherCompanyList = mvc.perform(
                get("/api/ai/mcp/servers")
                        .param("companyId", "company-j2"))
                .andReturn();

        assertEquals(200, otherCompanyList.getResponse().getStatus());
        assertEquals(0, body(otherCompanyList).path("items").size());

        var otherCompanyDetail = mvc.perform(
                get("/api/ai/mcp/servers/{serverId}", SERVER_ID)
                        .param("companyId", "company-j2"))
                .andReturn();

        assertEquals(404, otherCompanyDetail.getResponse().getStatus());

        var otherMerchantReads =
                new AiMcpReadService(repository, "merchant-other");

        var otherMerchantMvc = mvcFor(otherMerchantReads);

        var otherMerchantList = otherMerchantMvc.perform(
                get("/api/ai/mcp/servers")
                        .param("companyId", "company-j1")
                        // 前端不能覆盖 Service 配置的 Merchant。
                        .param("merchantId", "merchant-acme"))
                .andReturn();

        assertEquals(200, otherMerchantList.getResponse().getStatus());
        assertEquals(0, body(otherMerchantList).path("items").size());
        assertEquals("merchant-other", repository.lastMerchant);

        var otherMerchantDetail = otherMerchantMvc.perform(
                get("/api/ai/mcp/servers/{serverId}", SERVER_ID)
                        .param("companyId", "company-j1"))
                .andReturn();

        assertEquals(404, otherMerchantDetail.getResponse().getStatus());
    }
}
