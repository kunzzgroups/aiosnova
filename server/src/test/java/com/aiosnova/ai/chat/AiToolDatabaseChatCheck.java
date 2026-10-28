package com.aiosnova.ai.chat;

import java.nio.charset.StandardCharsets;
import java.sql.DriverManager;
import java.util.List;
import java.util.Map;

import com.aiosnova.ai.tool.AiToolAuthorizationService;
import com.aiosnova.ai.tool.AiToolDatabaseSource;
import com.aiosnova.ai.tool.AiToolRegistry;
import com.aiosnova.ai.tool.AiToolRepository;

import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.json.JsonMapper;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

public final class AiToolDatabaseChatCheck {

    private static final String COMPANY = "company-j1";
    private static final String MERCHANT = "merchant-acme";
    private static final String AGENT = "4115e177-5d14-4b54-b6c5-7105609f3166";
    private static final String TOOL = "2d0e4e3e-f6aa-4291-a627-4edd90278d6f";

    public static void main(String[] args) throws Exception {
        require(
                args.length == 1,
                "Choose one mode: success, disabled or unbound.");

        String mode = args[0];

        require(
                List.of("success", "disabled", "unbound").contains(mode),
                "Unknown mode. Choose success, disabled or unbound.");

        require(
                "true".equals(System.getenv("AI_RUN_TOOL_DB_CHAT_CHECK")),
                "Explicit read-only database check opt-in is required.");

        String password = System.getenv("AI_DB_PASSWORD");

        require(
                password != null && !password.isBlank(),
                "Set AI_DB_PASSWORD in this terminal.");

        // Fixed local target. Do not load application or server DB settings.
        String url = "jdbc:mysql://127.0.0.1:3307/aiosnova_ai_local"
                + "?characterEncoding=UTF-8"
                + "&connectionTimeZone=UTC"
                + "&forceConnectionTimeZoneToSession=true";

        try (var connection = DriverManager.getConnection(
                url, "ai_app", password)) {

            connection.setReadOnly(true);
            connection.setAutoCommit(false);

            try {
                try (var statement = connection.createStatement()) {
                    statement.execute("SET TRANSACTION READ ONLY");
                }

                var jdbc = new JdbcTemplate(
                        new SingleConnectionDataSource(connection, true));

                require(
                        "aiosnova_ai_local".equals(jdbc.queryForObject(
                                "SELECT DATABASE()", String.class)),
                        "Unexpected database.");

                require(
                        Integer.valueOf(3307).equals(jdbc.queryForObject(
                                "SELECT @@port", Integer.class)),
                        "Unexpected MySQL port.");

                var repository = new AiToolRepository(jdbc);

                var agent = repository.findAgent(
                        COMPANY, MERCHANT, AGENT).orElseThrow(
                                () -> new IllegalStateException(
                                        "Expected local Agent was not found."));

                require(
                        "active".equals(agent.status()),
                        "The test Agent must be active.");

                var tool = repository.findTools(COMPANY, MERCHANT).stream()
                        .filter(item -> TOOL.equals(item.id()))
                        .findFirst()
                        .orElseThrow(() -> new IllegalStateException(
                                "Expected Calculator was not found."));

                require(
                        "calc.run".equals(tool.action())
                                && "calculator".equals(tool.executorType()),
                        "Unexpected Calculator action or executor.");

                boolean bound = repository.findBoundActions(
                        COMPANY, MERCHANT, AGENT).contains("calc.run");

                var configuration = JsonMapper.builder().build()
                        .readTree(tool.configuration());

                require(
                        "low".equals(tool.risk())
                                && tool.timeoutSeconds() == 30
                                && !tool.requiresConfirmation()
                                && configuration != null
                                && configuration.isObject()
                                && configuration.size() == 0,
                        "Calculator configuration does not match this check.");

                switch (mode) {
                    case "success" -> require(
                            "active".equals(tool.status()) && bound,
                            "Success mode requires an active, bound Calculator.");

                    case "disabled" -> require(
                            "disabled".equals(tool.status()) && bound,
                            "Disabled mode requires a disabled Calculator "
                                    + "with its Agent binding preserved.");

                    case "unbound" -> require(
                            "active".equals(tool.status()) && !bound,
                            "Unbound mode requires an active Calculator "
                                    + "without this Agent binding.");

                    default -> throw new IllegalStateException("Unexpected mode.");
                }

                System.out.println(
                        "PASS: local database state matches mode=" + mode);

                // All model/provider access remains simulated.
                var fixture = new AiChatToolIntegrationTest.Fixture(COMPANY);

                var source = new AiToolDatabaseSource(
                        repository, MERCHANT);

                var authorization = new AiToolAuthorizationService(
                        source,
                        List.of(new AiToolRegistry.Registration(
                                "calculator",
                                fixture.calculator)));

                var mvc = MockMvcBuilders.standaloneSetup(
                        new AiChatController(
                                fixture.service,
                                authorization))
                        .build();

                var json = JsonMapper.builder().build();

                var request = json.writeValueAsString(Map.of(
                        "companyId", COMPANY,
                        "agentId", AGENT,
                        "providerId", "provider-test",
                        "modelId", "test/model",
                        "messages", List.of(Map.of(
                                "role", "user",
                                "content", "Calculate 2 + 3."))));

                var result = mvc.perform(
                        post("/api/ai/chat/messages/tools")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(request))
                        .andReturn();

                int status = result.getResponse().getStatus();

                var body = json.readTree(new String(
                        result.getResponse().getContentAsByteArray(),
                        StandardCharsets.UTF_8));

                if ("success".equals(mode)) {
                    require(status == 200, "Expected HTTP 200, got " + status);

                    require(
                            "The answer is 5.".equals(
                                    body.path("reply").asString()),
                            "Unexpected final answer.");

                    require(
                            "test/model".equals(body.path("modelId").asString()),
                            "Unexpected model.");

                    require(
                            fixture.calculator.executions == 1,
                            "Calculator must execute exactly once.");

                    require(
                            fixture.transport.requests.size() == 2,
                            "Expected exactly two simulated model requests.");

                    System.out.println(
                            "PASS: HTTP 200; Calculator executions=1; "
                                    + "simulated model requests=2.");
                } else {
                    require(status == 403, "Expected HTTP 403, got " + status);

                    require(
                            !body.path("message").asString("").isBlank(),
                            "Expected an explicit denial message.");

                    require(
                            fixture.calculator.executions == 0,
                            "Denied request must not execute Calculator.");

                    require(
                            fixture.transport.requests.isEmpty(),
                            "Denied request must not call the simulated model.");

                    System.out.println(
                            "PASS: HTTP 403; Calculator executions=0; "
                                    + "simulated model requests=0.");
                }

            } finally {
                connection.rollback();
            }

            System.out.println(
                    "PASS: read-only transaction ended; no database writes.");
        }
    }
    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new IllegalStateException(message);
        }
    }
}