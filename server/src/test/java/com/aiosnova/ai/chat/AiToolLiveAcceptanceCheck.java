package com.aiosnova.ai.chat;

import java.io.IOException;
import java.net.http.HttpRequest;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.io.PrintStream;
import java.net.URI;
import java.util.function.Supplier;
import java.math.BigDecimal;

import com.aiosnova.ai.tool.AiToolDefinition;
import com.aiosnova.ai.tool.AiToolHandler;
import com.aiosnova.ai.tool.AiToolRegistry;
import com.aiosnova.ai.tool.builtin.CalculatorTool;

public final class AiToolLiveAcceptanceCheck {

    record Plan(
            String modelId,
            int maxModelRequests,
            int maxToolExecutions) {
    }

    static Plan prepare(String mode, String modelId) {
        if (!"--prepare".equals(mode)) {
            throw new IllegalArgumentException(
                    "Only offline --prepare mode is available.");
        }

        if (modelId == null
                || modelId.isBlank()
                || modelId.length() > 255
                || !modelId.matches("[A-Za-z0-9._~:/-]+")) {
            throw new IllegalArgumentException(
                    "A valid model ID is required.");
        }

        return new Plan(modelId, 2, 1);
    }

    // One instance per acceptance run. Never retry a failed attempt.
    static final class Budget implements AiChatService.ChatTransport {
        private final AiChatService.ChatTransport delegate;
        private int modelRequests;
        private int toolExecutions;
        private boolean calculatorVerified;
        private Integer lastHttpStatus;

        Budget(AiChatService.ChatTransport delegate) {
            this.delegate = java.util.Objects.requireNonNull(delegate);
        }

        @Override
        public AiChatService.ChatHttpResult send(HttpRequest request)
                throws IOException, InterruptedException {
            if (modelRequests >= 2) {
                throw new IllegalStateException(
                        "Acceptance model-request limit reached.");
            }
            modelRequests++;
            // A failed second attempt must not retain the first response's 200.
            lastHttpStatus = null;
            var response = delegate.send(request);
            if (response != null) {
                lastHttpStatus = response.statusCode();
            }
            return response;
        }

        AiToolHandler calculator() {
            var calculator = new CalculatorTool();
            return new AiToolHandler() {
                @Override
                public AiToolDefinition definition() {
                    return calculator.definition();
                }

                @Override
                public void validateArguments(Map<String, Object> arguments) {
                    calculator.validateArguments(arguments);
                    requireExpectedArguments(arguments);
                }

                @Override
                public Map<String, Object> execute(Map<String, Object> arguments) {
                    if (toolExecutions >= 1) {
                        throw new IllegalStateException(
                                "Acceptance tool-execution limit reached.");
                    }
                    calculator.validateArguments(arguments);
                    requireExpectedArguments(arguments);
                    toolExecutions++;
                    Map<String, Object> result = calculator.execute(arguments);
                    if (!sameNumber(result.get("result"), "5")) {
                        throw new IllegalStateException(
                                "Calculator acceptance result is incorrect.");
                    }
                    calculatorVerified = true;
                    return result;
                }
            };
        }

        int modelRequests() {
            return modelRequests;
        }

        int toolExecutions() {
            return toolExecutions;
        }

        boolean calculatorVerified() {
            return calculatorVerified;
        }

        Integer lastHttpStatus() {
            return lastHttpStatus;
        }
    }

    static String runWithTransport(String modelId, String apiKey, Budget budget) {
        var calculator = budget.calculator();
        var registry = new AiToolRegistry(List.of(
                new AiToolRegistry.Registration("calculator", calculator)));
        var service = new AiToolConversationService(budget, registry);

        String reply = service.chatWithParameters(
                modelId,
                List.<Map<String, Object>>of(Map.of(
                        "role", "user",
                        "content", "Use the Calculator tool to calculate 2 + 3. "
                                + "After receiving the tool result, reply with exactly 5.")),
                new AiToolRequestParameters(null, null, 512),
                apiKey,
                Set.of(calculator.definition().functionName()));

        if (budget.modelRequests() != 2 || budget.toolExecutions() != 1) {
            throw new IllegalStateException(
                    "Acceptance requires two model requests "
                            + "and one Calculator execution.");
        }
        if (!budget.calculatorVerified()) {
            throw new IllegalStateException("Calculator result was not verified.");
        }
        if (!Set.of("5", "The answer is 5.").contains(reply.strip())) {
            throw new IllegalStateException(
                    "Final answer does not match the acceptance result.");
        }
        return reply;
    }

    static int execute(
            String[] args,
            Map<String, String> environment,
            Supplier<AiChatService.ChatTransport> transportFactory,
            PrintStream output) {
        java.util.Objects.requireNonNull(output);
        if (args == null || args.length != 2) {
            output.println("Usage: --prepare <model-id> or --run <model-id>");
            return 2;
        }
        if ("--run".equals(args[0])) {
            return runOptIn(args[1], environment, transportFactory, output);
        }
        if (!"--prepare".equals(args[0])) {
            output.println("BLOCKED: unsupported mode.");
            return 2;
        }
        try {
            Plan plan = prepare(args[0], args[1]);
            output.println("PREPARATION ONLY: no network or database access.");
            output.println("Model: " + plan.modelId());
            output.println("Allowed executor: Calculator only.");
            output.println("Planned model-request limit: " + plan.maxModelRequests());
            output.println("Planned tool-execution limit: " + plan.maxToolExecutions());
            return 0;
        } catch (IllegalArgumentException error) {
            output.println("BLOCKED: invalid preparation arguments.");
            return 2;
        }
    }

    public static void main(String[] args) {
        int exit = execute(args, System.getenv(),
                AiChatService::defaultTransport, System.out);
        if (exit != 0) {
            System.exit(exit);
        }
    }

    static final URI ALLOWED_ENDPOINT = URI.create(
            "https://openrouter.ai/api/v1/chat/completions");

    static AiChatService.ChatTransport checkedTransport(
            AiChatService.ChatTransport delegate) {

        java.util.Objects.requireNonNull(delegate);

        return request -> {
            if (request == null
                    || !"POST".equals(request.method())
                    || !ALLOWED_ENDPOINT.equals(request.uri())) {
                throw new IllegalArgumentException(
                        "Acceptance endpoint is not allowed.");
            }

            return delegate.send(request);
        };
    }

    static int runOptIn(
            String modelId,
            Map<String, String> environment,
            Supplier<AiChatService.ChatTransport> transportFactory,
            PrintStream output) {

        java.util.Objects.requireNonNull(output);

        Budget budget = null;

        try {
            prepare("--prepare", modelId);

            if (environment == null
                    || !"true".equals(environment.get(
                            "AI_RUN_TOOL_LIVE_ACCEPTANCE"))) {
                output.println(
                        "BLOCKED: explicit live-acceptance opt-in is required.");
                return 2;
            }

            String apiKey = environment.get(
                    "AI_TOOL_LIVE_API_KEY");

            if (apiKey == null
                    || apiKey.isBlank()
                    || apiKey.chars().anyMatch(Character::isWhitespace)) {
                output.println(
                        "BLOCKED: a valid temporary API key is required.");
                return 2;
            }

            // Only create the Transport after checking opt-in and key.
            var transport = checkedTransport(
                    transportFactory.get());

            budget = new Budget(transport);

            runWithTransport(modelId, apiKey, budget);

            output.printf(
                    "PASS: modelRequests=%d, toolExecutions=%d.%n",
                    budget.modelRequests(),
                    budget.toolExecutions());

            return 0;
        } catch (RuntimeException error) {
            // Never print the exception, upstream body, key or model reply.
            output.printf(
                    "FAIL: acceptance stopped; "
                            + "modelRequests=%d, toolExecutions=%d.%n",
                    budget == null ? 0 : budget.modelRequests(),
                    budget == null ? 0 : budget.toolExecutions());

            String httpStatus = budget == null || budget.lastHttpStatus() == null
                    ? "none" : Integer.toString(budget.lastHttpStatus());
            output.printf("DIAGNOSTIC: httpStatus=%s, code=%s.%n",
                    httpStatus, safeFailureCode(error));

            return 1;
        }
    }

    static String safeFailureCode(RuntimeException error) {
        if (error instanceof AiToolConversationService.Failure failure) {
            return switch (failure.code()) {
                case "upstream_http_error", "transport_failed", "interrupted",
                     "invalid_tool_flow", "tool_execution_failed",
                     "tool_round_limit", "invalid_final_answer" -> failure.code();
                default -> "acceptance_failed";
            };
        }
        return "acceptance_failed";
    }

    static boolean sameNumber(Object value, String expected) {
        if (!(value instanceof Number number)) {
            return false;
        }

        try {
            return new BigDecimal(number.toString())
                    .compareTo(new BigDecimal(expected)) == 0;
        } catch (NumberFormatException error) {
            return false;
        }
    }

    static void requireExpectedArguments(Map<String, Object> arguments) {
        if (arguments == null
                || !"add".equals(arguments.get("operation"))
                || !sameNumber(arguments.get("a"), "2")
                || !sameNumber(arguments.get("b"), "3")) {
            throw new IllegalArgumentException(
                    "Acceptance requires Calculator add(2, 3).");
        }
    }

}
