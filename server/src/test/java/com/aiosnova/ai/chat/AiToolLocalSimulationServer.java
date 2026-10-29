package com.aiosnova.ai.chat;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.DriverManager;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

import com.aiosnova.ai.tool.AiToolAuthorizationService;
import com.aiosnova.ai.tool.AiToolDatabaseSource;
import com.aiosnova.ai.tool.AiToolRegistry;
import com.aiosnova.ai.tool.AiToolRepository;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

public final class AiToolLocalSimulationServer {

        private static final String PATH = "/api/ai/chat/messages/tools";

        private static final String URL = "jdbc:mysql://127.0.0.1:3307/aiosnova_ai_local"
                        + "?connectionTimeZone=UTC"
                        + "&forceConnectionTimeZoneToSession=true";

        public static void main(String[] args) throws Exception {
                if (!"true".equals(
                                System.getenv("AI_RUN_TOOL_LOCAL_SIMULATION"))) {
                        throw new IllegalStateException(
                                        "Explicit local simulation opt-in is required.");
                }

                String scenario = System.getenv("AI_TOOL_LOCAL_SCENARIO");

                if (scenario == null || scenario.isBlank()) {
                        scenario = "success";
                }

                if (!List.of("success", "tool-failure").contains(scenario)) {
                        throw new IllegalStateException(
                                        "Choose success or tool-failure.");
                }

                final boolean simulateToolFailure = "tool-failure".equals(scenario);

                String password = System.getenv("AI_DB_PASSWORD");

                if (password == null || password.isBlank()) {
                        throw new IllegalStateException(
                                        "Set the local ai_app password.");
                }

                var cancellations = new ConcurrentHashMap<String, AiToolSimulationCancellation>();

                String configuredStage = System.getenv("AI_TOOL_LOCAL_CANCEL_STAGE");

                final String cancelStage = configuredStage == null || configuredStage.isBlank()
                                ? "none"
                                : configuredStage;

                if (!List.of("none", "before-tool", "before-second")
                                .contains(cancelStage)) {
                        throw new IllegalStateException(
                                        "Choose cancellation stage: none, before-tool or before-second.");
                }

                var server = HttpServer.create(
                                new InetSocketAddress("127.0.0.1", 8082), 0);

                var executor = Executors.newVirtualThreadPerTaskExecutor();
                server.setExecutor(executor);

                server.createContext(PATH + "/cancel", exchange -> {
                        try {
                                if (!(PATH + "/cancel").equals(
                                                exchange.getRequestURI().getPath())) {
                                        respond(exchange, 404, """
                                                        {"message":"Not found."}
                                                        """);
                                        return;
                                }

                                if (!"POST".equals(exchange.getRequestMethod())) {
                                        respond(exchange, 405, """
                                                        {"message":"POST is required."}
                                                        """);
                                        return;
                                }

                                String requestId = exchange.getRequestHeaders()
                                                .getFirst("X-AI-Simulation-Request-Id");

                                if (requestId == null
                                                || !requestId.matches("[A-Za-z0-9_-]{1,64}")) {
                                        respond(exchange, 400, """
                                                        {"message":"A valid simulation request ID is required."}
                                                        """);
                                        return;
                                }

                                var cancellation = cancellations.get(requestId);

                                if (cancellation == null) {
                                        respond(exchange, 404, """
                                                        {"message":"No active simulation request with this ID."}
                                                        """);
                                        return;
                                }

                                cancellation.cancel();

                                respond(exchange, 202, """
                                                {"message":"Simulation cancellation requested."}
                                                """);
                        } finally {
                                exchange.close();
                        }
                });

                server.createContext(PATH, exchange -> {
                        String requestId = null;
                        AiToolSimulationCancellation cancellation = null;
                        try {
                                if (!PATH.equals(exchange.getRequestURI().getPath())) {
                                        respond(exchange, 404, """
                                                        {"message":"Not found."}
                                                        """);
                                        return;
                                }

                                if (!"POST".equals(exchange.getRequestMethod())) {
                                        respond(exchange, 405, """
                                                        {"message":"POST is required."}
                                                        """);
                                        return;
                                }

                                byte[] requestBytes = exchange.getRequestBody()
                                                .readNBytes(1_048_577);

                                if (requestBytes.length > 1_048_576) {
                                        respond(exchange, 413, """
                                                        {"message":"Simulation request is too large."}
                                                        """);
                                        return;
                                }

                                requestId = exchange.getRequestHeaders()
                                                .getFirst("X-AI-Simulation-Request-Id");
                                if (requestId == null) {
                                        requestId = UUID.randomUUID().toString();
                                }
                                if (!requestId.matches("[A-Za-z0-9_-]{1,64}")) {
                                        respond(exchange, 400, """
                                                        {"message":"Invalid simulation request ID."}
                                                        """);
                                        return;
                                }

                                cancellation = new AiToolSimulationCancellation();
                                if (cancellations.putIfAbsent(requestId, cancellation) != null) {
                                        respond(exchange, 409, """
                                                        {"message":"Simulation request ID is already active."}
                                                        """);
                                        return;
                                }

                                exchange.getResponseHeaders().set(
                                                "X-AI-Simulation-Request-Id", requestId);
                                final var token = cancellation;
                                final String currentRequestId = requestId;
                                token.check();

                                try (var connection = DriverManager.getConnection(
                                                URL, "ai_app", password)) {

                                        connection.setTransactionIsolation(
                                                        java.sql.Connection.TRANSACTION_READ_COMMITTED);
                                        connection.setReadOnly(true);
                                        connection.setAutoCommit(false);

                                        try {
                                                try (var statement = connection.createStatement()) {
                                                        statement.execute("SET TRANSACTION READ ONLY");
                                                }

                                                var jdbc = new JdbcTemplate(
                                                                new SingleConnectionDataSource(
                                                                                connection, true));

                                                String database = jdbc.queryForObject(
                                                                "SELECT DATABASE()", String.class);
                                                Integer port = jdbc.queryForObject(
                                                                "SELECT @@port", Integer.class);

                                                if (!"aiosnova_ai_local".equals(database)
                                                                || !Integer.valueOf(3307).equals(port)) {
                                                        throw new IllegalStateException(
                                                                        "Unexpected database target.");
                                                }

                                                var repository = new AiToolRepository(jdbc);
                                                var fixture = new AiChatToolIntegrationTest.Fixture(
                                                                "company-j1");
                                                fixture.calculator.fail = simulateToolFailure;

                                                fixture.transport.afterFirstResponse = () -> {
                                                        if ("before-tool".equals(cancelStage)) {
                                                                System.out.printf(
                                                                                "SIMULATION WAIT: requestId=%s, stage=before-tool%n",
                                                                                currentRequestId);
                                                                token.pause(10_000);
                                                        }
                                                        token.check();
                                                };

                                                var afterTool = new AtomicBoolean();
                                                fixture.calculator.afterExecution = () -> afterTool.set(true);
                                                Runnable checkpoint = () -> {
                                                        // Run outside the executor's tool-error catch block.
                                                        if (afterTool.compareAndSet(true, false)
                                                                        && "before-second".equals(cancelStage)) {
                                                                System.out.printf(
                                                                                "SIMULATION WAIT: requestId=%s, stage=before-second%n",
                                                                                currentRequestId);
                                                                token.pause(10_000);
                                                        }
                                                };

                                                var authorization = new AiToolAuthorizationService(
                                                                new AiToolSimulationSource(
                                                                                new AiToolDatabaseSource(repository,
                                                                                                "merchant-acme"),
                                                                                token,
                                                                                checkpoint),
                                                                List.of(
                                                                                new AiToolRegistry.Registration(
                                                                                                "calculator",
                                                                                                fixture.calculator)));

                                                var mvc = MockMvcBuilders.standaloneSetup(
                                                                new AiChatController(fixture.service, authorization,
                                                                                new AiToolChatLifecycle(fixture.service,
                                                                                                authorization,
                                                                                                new AiToolChatRequests()),
                                                                                fixture.access))
                                                                .build();

                                                var result = mvc.perform(
                                                                post(PATH)
                                                                                .contentType(
                                                                                                MediaType.APPLICATION_JSON)
                                                                                .content(requestBytes))
                                                                .andReturn();

                                                System.out.printf(
                                                                "SIMULATION: HTTP=%d, modelRequests=%d, "
                                                                                + "toolExecutions=%d%n",
                                                                result.getResponse().getStatus(),
                                                                fixture.transport.requests.size(),
                                                                fixture.calculator.executions);

                                                respond(
                                                                exchange,
                                                                result.getResponse().getStatus(),
                                                                new String(
                                                                                result.getResponse()
                                                                                                .getContentAsByteArray(),
                                                                                StandardCharsets.UTF_8));
                                        } finally {
                                                connection.rollback();
                                        }
                                }
                        } catch (ResponseStatusException error) {
                                if (error.getStatusCode().value() == 499) {
                                        System.out.println("SIMULATION CANCELLED: requestId=" + requestId);
                                        respond(exchange, 499, """
                                                        {"message":"Simulation request cancelled."}
                                                        """);
                                } else {
                                        respond(exchange, 500, """
                                                        {"message":"Local simulation failed."}
                                                        """);
                                }
                        } catch (Exception error) {
                                // Do not return database details or credentials.
                                System.err.println(
                                                "Local simulation failed: "
                                                                + error.getClass().getSimpleName());

                                respond(exchange, 500, """
                                                {"message":"Local simulation failed. Check the simulation terminal."}
                                                """);
                        } finally {
                                if (requestId != null && cancellation != null) {
                                        cancellations.remove(requestId, cancellation);
                                }
                                exchange.close();
                        }
                });

                Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                        server.stop(0);
                        executor.close();
                }));

                server.start();

                System.out.println(
                                "SIMULATION ONLY: http://127.0.0.1:8082" + PATH);
                System.out.println(
                                "Local MySQL authorization is read-only; "
                                                + "all model responses are simulated.");
        }

        private static void respond(
                        HttpExchange exchange,
                        int status,
                        String body) throws java.io.IOException {

                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);

                exchange.getResponseHeaders().set(
                                "Content-Type", "application/json;charset=UTF-8");
                exchange.getResponseHeaders().set(
                                "Cache-Control", "no-store");

                exchange.sendResponseHeaders(status, bytes.length);
                exchange.getResponseBody().write(bytes);
        }
}
