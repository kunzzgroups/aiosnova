package com.aiosnova.ai.chat;

import java.util.Optional;

import com.aiosnova.ai.tool.AiToolRepository;
import com.aiosnova.ai.tool.AiToolRepository.AgentExecutionParameters;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class AiAgentExecutionParameterValidatorTest {

    static final class FakeRepository extends AiToolRepository {

        AgentExecutionParameters stored = row(0.7, 0.9, 1024);

        FakeRepository() {
            super(new JdbcTemplate());
        }

        @Override
        public Optional<AgentExecutionParameters> findAgentExecutionParameters(
                String company,
                String merchant,
                String agent) {

            assertEquals("company-test", company);
            assertEquals("merchant-test", merchant);
            assertEquals("agent-test", agent);

            return Optional.ofNullable(stored);
        }
    }

    private static AgentExecutionParameters row(
            double temperature,
            double topP,
            int maxTokens) {

        return new AgentExecutionParameters(
                "company-test", "merchant-test", "agent-test",
                "active", temperature, topP, maxTokens, 0L);
    }

    private final FakeRepository repository = new FakeRepository();

    private final AiAgentExecutionParameterValidator validator =
            new AiAgentExecutionParameterValidator(
                    repository, "merchant-test");

    private AiAgentExecutionParameterValidator.Parameters read() {
        return validator.requireParameters(
                "company-test", "agent-test", 32000);
    }

    private void expectStatus(int status) {
        var error = assertThrows(
                ResponseStatusException.class, this::read);

        assertEquals(status, error.getStatusCode().value());
    }

    @Test
    void validStoredParametersArePreserved() {
        var result = read();

        assertEquals(0.7, result.temperature(), 0.000001);
        assertEquals(0.9, result.topP(), 0.000001);
        assertEquals(1024, result.maxTokens());
    }

    @Test
    void zeroTemperatureIsValid() {
        repository.stored = row(0, 1, 2048);

        assertEquals(0.0, read().temperature(), 0.000001);
    }

    @Test
    void unsupportedTemperatureBecomesOmittedValue() {
        var result = read();

        assertNull(result.temperatureFor(false));
        assertEquals(0.7, result.temperatureFor(true), 0.000001);
    }

    @Test
    void invalidTemperatureIsRejected() {
        for (double value : new double[]{
                -0.1, 2.1, Double.NaN, Double.POSITIVE_INFINITY}) {
            repository.stored = row(value, 1, 2048);
            expectStatus(409);
        }
    }

    @Test
    void invalidTopPIsRejected() {
        for (double value : new double[]{
                0, -0.1, 1.1, Double.NaN, Double.POSITIVE_INFINITY}) {
            repository.stored = row(0.7, value, 2048);
            expectStatus(409);
        }
    }

    @Test
    void invalidTokenLimitOrContextIsRejected() {
        for (int value : new int[]{0, -1, 32001}) {
            repository.stored = row(0.7, 1, value);
            expectStatus(409);
        }

        repository.stored = row(0.7, 1, 2048);

        for (Integer context : new Integer[]{null, 0, -1}) {
            var error = assertThrows(
                    ResponseStatusException.class,
                    () -> validator.requireParameters(
                            "company-test", "agent-test", context));

            assertEquals(409, error.getStatusCode().value());
        }
    }

    @Test
    void absentOrInactiveAgentIsRejected() {
        repository.stored = null;
        expectStatus(403);

        repository.stored = new AgentExecutionParameters(
                "company-test", "merchant-test", "agent-test",
                "disabled", 0.7, 1, 2048, 0L);
        expectStatus(403);
    }

    @Test
    void returnedOwnershipMustMatchAllScopeFields() {
        repository.stored = new AgentExecutionParameters(
                "other-company", "merchant-test", "agent-test",
                "active", 0.7, 1, 2048, 0L);
        expectStatus(403);

        repository.stored = new AgentExecutionParameters(
                "company-test", "other-merchant", "agent-test",
                "active", 0.7, 1, 2048, 0L);
        expectStatus(403);

        repository.stored = new AgentExecutionParameters(
                "company-test", "merchant-test", "other-agent",
                "active", 0.7, 1, 2048, 0L);
        expectStatus(403);
    }
}
