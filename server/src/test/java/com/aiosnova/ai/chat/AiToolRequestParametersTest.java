package com.aiosnova.ai.chat;

import com.aiosnova.ai.tool.AiToolCallExecutor;
import com.aiosnova.ai.tool.AiToolCallParser;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;

class AiToolRequestParametersTest {
    private List<JsonNode> rounds(AiToolRequestParameters parameters) throws Exception {
        var fixture = new AiChatToolIntegrationTest.Fixture();
        var builder = new AiChatRequestBuilder();
        List<Map<String, Object>> messages = List.of(Map.of("role", "user", "content", "Calculate 2 + 3."));
        var first = builder.buildForToolSelectionWithParameters(
                "test/model", messages, parameters, "fake-key", fixture.registry);
        var response = fixture.transport.send(first);
        var results = new AiToolCallExecutor(fixture.registry).execute(
                new AiToolCallParser().parse(response.body()), Set.of("calc_run"));
        var second = builder.buildAfterToolExecutionWithParameters(
                "test/model", messages, parameters, "fake-key", fixture.registry, response.body(), results);
        fixture.transport.send(second);
        assertEquals(2, fixture.transport.requests.size());
        assertEquals(1, fixture.calculator.executions);
        var json = new ObjectMapper();
        return List.of(
                json.readTree(AiChatToolIntegrationTest.readRequestBody(first)),
                json.readTree(AiChatToolIntegrationTest.readRequestBody(second)));
    }

    @Test
    void bothRoundsUseTheSameParameterSnapshot() throws Exception {
        var bodies = rounds(new AiToolRequestParameters(0.7, 0.9, 1024));
        for (var body : bodies) {
            assertEquals(0.7, body.path("temperature").asDouble());
            assertEquals(0.9, body.path("top_p").asDouble());
            assertEquals(1024, body.path("max_tokens").asInt());
        }
        assertEquals("auto", bodies.get(0).path("tool_choice").asString());
        assertEquals("none", bodies.get(1).path("tool_choice").asString());
    }

    @Test
    void unsupportedParametersAreAbsentInBothRounds() throws Exception {
        for (var body : rounds(new AiToolRequestParameters(null, null, 1024))) {
            assertFalse(body.has("temperature"));
            assertFalse(body.has("top_p"));
            assertEquals(1024, body.path("max_tokens").asInt());
        }
    }

    @Test
    void zeroTemperatureIsSentInBothRounds() throws Exception {
        for (var body : rounds(new AiToolRequestParameters(0.0, null, 2048))) {
            assertTrue(body.has("temperature"));
            assertEquals(0.0, body.path("temperature").asDouble());
        }
    }

    @Test
    void invalidParameterSnapshotIsRejected() {
        assertThrows(IllegalArgumentException.class, () -> new AiToolRequestParameters(Double.NaN, null, 2048));
        assertThrows(IllegalArgumentException.class, () -> new AiToolRequestParameters(null, 0.0, 2048));
        assertThrows(IllegalArgumentException.class, () -> new AiToolRequestParameters(null, null, 0));
    }
}
