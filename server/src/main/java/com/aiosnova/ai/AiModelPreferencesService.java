package com.aiosnova.ai;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@Service
public class AiModelPreferencesService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper();

    public AiModelPreferencesService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Preferences(String companyId, String defaultModelConfigId,
            List<String> recommendedModelConfigIds, long version, boolean storageReady) {}

    private String company(String value) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{1,64}"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid company ID.");
        return value;
    }

    public Preferences read(String companyId) {
        String id = company(companyId);
        try {
            var rows = jdbc.query("SELECT default_model_config_id, recommended_model_ids, version FROM ai_model_preferences WHERE company_id = ?",
                    (rs, row) -> new Preferences(id, rs.getString(1), decode(rs.getString(2)), rs.getLong(3), true), id);
            return rows.isEmpty() ? new Preferences(id, null, List.of(), 0, true) : rows.getFirst();
        } catch (DataAccessException error) {
            // Only a missing migration is recoverable; other database errors propagate.
            if (error.getMostSpecificCause() instanceof java.sql.SQLException sql &&
                    (sql.getErrorCode() == 1146 || sql.getErrorCode() == 1142))
                return new Preferences(id, null, List.of(), 0, false);
            throw error;
        }
    }

    private List<String> decode(String value) {
        var ids = new ArrayList<String>();
        for (var node : json.readTree(value)) ids.add(node.asString());
        return List.copyOf(ids);
    }

    @Transactional
    public Preferences save(String companyId, String defaultId, List<String> recommendations, Long expectedVersion) {
        String id = company(companyId);
        if (expectedVersion == null || expectedVersion < 0 || recommendations == null || recommendations.size() > 6)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose up to six recommended models and provide a valid version.");
        var ids = new HashSet<String>();
        for (String target : recommendations) {
            if (target == null || !target.matches("[A-Fa-f0-9-]{36}") || !ids.add(target))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Recommended model IDs must be valid and unique.");
        }
        if (defaultId != null) {
            if (!defaultId.matches("[A-Fa-f0-9-]{36}"))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid default model configuration ID.");
            ids.add(defaultId);
        }
        if (!read(id).storageReady())
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Run AI database migration 003 before saving model preferences.");

        jdbc.update("INSERT IGNORE INTO ai_model_preferences (company_id, recommended_model_ids) VALUES (?, JSON_ARRAY())", id);
        Long version = jdbc.queryForObject("SELECT version FROM ai_model_preferences WHERE company_id = ? FOR UPDATE", Long.class, id);
        if (version == null || version.longValue() != expectedVersion.longValue())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Model preferences changed. Reload before saving.");

        // Lock eligible target configurations while validating the preference write.
        for (String target : ids.stream().sorted().toList()) {
            List<Map<String, Object>> found = jdbc.queryForList("""
                SELECT m.id FROM ai_models m JOIN ai_providers p
                  ON p.company_id = m.company_id AND p.id = m.provider_id
                WHERE m.company_id = ? AND m.id = ? AND m.status = 'enabled'
                  AND m.model_type IN ('chat', 'reasoning')
                  AND m.capability_chat = TRUE AND m.capability_vision IS NOT NULL
                  AND m.capability_tool_calling IS NOT NULL AND m.capabilities_checked_at IS NOT NULL
                  AND (m.capability_error IS NULL OR m.capability_error = '')
                  AND p.enabled = TRUE AND p.api_key_ciphertext IS NOT NULL
                  AND p.provider_type = 'openrouter' AND p.base_url = 'https://openrouter.ai/api/v1'
                FOR UPDATE
                """, id, target);
            if (found.size() != 1)
                throw new ResponseStatusException(HttpStatus.CONFLICT, "A selected model is unavailable. Choose enabled chat models from this company.");
        }
        jdbc.update("UPDATE ai_model_preferences SET default_model_config_id = ?, recommended_model_ids = ?, version = version + 1 WHERE company_id = ? AND version = ?",
                defaultId, json.writeValueAsString(recommendations), id, expectedVersion);
        return read(id);
    }
}
