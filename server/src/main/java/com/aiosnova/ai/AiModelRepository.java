package com.aiosnova.ai;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AiModelRepository {

        private final JdbcTemplate jdbc;

        public AiModelRepository(JdbcTemplate jdbc) {
                this.jdbc = jdbc;
        }

        public record ModelSummary(
                        String id,
                        String companyId,
                        String providerId,
                        String modelId,
                        String name,
                        String type,
                        String status,
                        String description,
                        Integer contextWindow,
                        ModelCapabilities capabilities,
                        Instant capabilitiesCheckedAt,
                        String capabilityError,
                        long version) {
        }

        public List<ModelSummary> findByProvider(
                        String companyId,
                        String providerId) {

                return jdbc.query(
                                """
                                                SELECT
                                                    id,
                                                    company_id,
                                                    provider_id,
                                                    model_id,
                                                    name,
                                                    model_type,
                                                    status,
                                                    description,
                                                    context_window,
                                                    capability_chat,
                                                    capability_vision,
                                                    capability_tool_calling,
                                                    capabilities_checked_at,
                                                    capability_error,
                                                    version
                                                FROM ai_models
                                                WHERE company_id = ?
                                                  AND provider_id = ?
                                                ORDER BY name, id
                                                """,
                                (result, rowNumber) -> readModel(result),
                                companyId,
                                providerId);
        }

        public void insertFromCatalog(
                        String id,
                        String companyId,
                        String providerId,
                        OpenRouterModelService.CatalogModel entry,
                        LocalDateTime checkedAt) {

                ModelCapabilities capabilities = entry.capabilities();

                String type = capabilities != null && capabilities.chat()
                                ? "chat"
                                : "other";

                int affected = jdbc.update(
                                """
                                                INSERT INTO ai_models (
                                                    id,
                                                    company_id,
                                                    provider_id,
                                                    model_id,
                                                    name,
                                                    model_type,
                                                    status,
                                                    description,
                                                    context_window,
                                                    capability_chat,
                                                    capability_vision,
                                                    capability_tool_calling,
                                                    capabilities_checked_at,
                                                    capability_error
                                                )
                                                VALUES (?, ?, ?, ?, ?, ?, 'disabled', ?, ?, ?, ?, ?, ?, ?)
                                                """,
                                id,
                                companyId,
                                providerId,
                                entry.modelId(),
                                entry.name(),
                                type,
                                entry.description(),
                                capabilities == null ? null : capabilities.contextWindow(),
                                capabilities == null ? null : capabilities.chat(),
                                capabilities == null ? null : capabilities.vision(),
                                capabilities == null ? null : capabilities.toolCalling(),
                                checkedAt,
                                entry.capabilityError());

                if (affected != 1) {
                        throw new IllegalStateException("Unable to save the model.");
                }
        }

        public int updateCatalogCapabilities(
                        String companyId,
                        String providerId,
                        String id,
                        OpenRouterModelService.CatalogModel entry,
                        LocalDateTime checkedAt,
                        long expectedVersion) {

                ModelCapabilities capabilities = entry.capabilities();

                return jdbc.update(
                                """
                                                UPDATE ai_models
                                                SET
                                                    capability_chat = ?,
                                                    capability_vision = ?,
                                                    capability_tool_calling = ?,
                                                    capabilities_checked_at = ?,
                                                    capability_error = ?,
                                                    version = version + 1
                                                WHERE company_id = ?
                                                  AND provider_id = ?
                                                  AND id = ?
                                                  AND model_id = ?
                                                  AND version = ?
                                                """,
                                capabilities == null ? null : capabilities.chat(),
                                capabilities == null ? null : capabilities.vision(),
                                capabilities == null ? null : capabilities.toolCalling(),
                                checkedAt,
                                entry.capabilityError(),
                                companyId,
                                providerId,
                                id,
                                entry.modelId(),
                                expectedVersion);
        }

        public int updateEnabled(
                        String companyId,
                        String providerId,
                        String id,
                        boolean enabled,
                        long expectedVersion) {

                return jdbc.update(
                                """
                                                UPDATE ai_models
                                                SET
                                                    status = ?,
                                                    version = version + 1
                                                WHERE company_id = ?
                                                  AND provider_id = ?
                                                  AND id = ?
                                                  AND version = ?
                                                """,
                                enabled ? "enabled" : "disabled",
                                companyId,
                                providerId,
                                id,
                                expectedVersion);
        }

        public int updateConfiguration(
                        String companyId,
                        String providerId,
                        String id,
                        String name,
                        String type,
                        boolean enabled,
                        String description,
                        Integer contextWindow,
                        long expectedVersion) {

                return jdbc.update(
                                """
                                                UPDATE ai_models
                                                SET
                                                    name = ?,
                                                    model_type = ?,
                                                    status = ?,
                                                    description = ?,
                                                    context_window = ?,
                                                    version = version + 1
                                                WHERE company_id = ?
                                                  AND provider_id = ?
                                                  AND id = ?
                                                  AND version = ?
                                                """,
                                name,
                                type,
                                enabled ? "enabled" : "disabled",
                                description,
                                contextWindow,
                                companyId,
                                providerId,
                                id,
                                expectedVersion);
        }

        public int deleteDisabled(
                        String companyId,
                        String providerId,
                        String modelConfigId,
                        long expectedVersion) {

                return jdbc.update(
                                """
                                                DELETE FROM ai_models
                                                WHERE company_id = ?
                                                  AND provider_id = ?
                                                  AND id = ?
                                                  AND status = 'disabled'
                                                  AND version = ?
                                                """,
                                companyId,
                                providerId,
                                modelConfigId,
                                expectedVersion);
        }

        public Optional<ModelSummary> findByExternalId(
                        String companyId,
                        String providerId,
                        String modelId) {

                var items = jdbc.query(
                                """
                                                SELECT
                                                    id,
                                                    company_id,
                                                    provider_id,
                                                    model_id,
                                                    name,
                                                    model_type,
                                                    status,
                                                    description,
                                                    context_window,
                                                    capability_chat,
                                                    capability_vision,
                                                    capability_tool_calling,
                                                    capabilities_checked_at,
                                                    capability_error,
                                                    version
                                                FROM ai_models
                                                WHERE company_id = ?
                                                  AND provider_id = ?
                                                  AND model_id = ?
                                                """,
                                (result, rowNumber) -> readModel(result),
                                companyId,
                                providerId,
                                modelId);

                return items.stream().findFirst();
        }

        private ModelSummary readModel(ResultSet result)
                        throws SQLException {

                Integer contextWindow = result.getObject(
                                "context_window",
                                Integer.class);

                Boolean chat = nullableBoolean(result, "capability_chat");
                Boolean vision = nullableBoolean(result, "capability_vision");
                Boolean tools = nullableBoolean(result, "capability_tool_calling");

                ModelCapabilities capabilities = null;

                if (chat != null && vision != null && tools != null) {
                        capabilities = new ModelCapabilities(
                                        chat,
                                        vision,
                                        tools,
                                        contextWindow);
                }

                LocalDateTime checkedAt = result.getObject(
                                "capabilities_checked_at",
                                LocalDateTime.class);

                return new ModelSummary(
                                result.getString("id"),
                                result.getString("company_id"),
                                result.getString("provider_id"),
                                result.getString("model_id"),
                                result.getString("name"),
                                result.getString("model_type"),
                                result.getString("status"),
                                result.getString("description"),
                                contextWindow,
                                capabilities,
                                checkedAt == null
                                                ? null
                                                : checkedAt.toInstant(ZoneOffset.UTC),
                                result.getString("capability_error"),
                                result.getLong("version"));
        }

        private Boolean nullableBoolean(
                        ResultSet result,
                        String column) throws SQLException {

                if (result.getObject(column) == null) {
                        return null;
                }

                return result.getBoolean(column);
        }

        public record DeleteModelTarget(
                        String id,
                        long version) {
        }

        public int deleteManyDisabled(
                        String companyId,
                        String providerId,
                        java.util.List<DeleteModelTarget> targets) {

                int deleted = 0;

                for (DeleteModelTarget target : targets) {
                        int affected = deleteDisabled(
                                        companyId,
                                        providerId,
                                        target.id(),
                                        target.version());

                        if (affected != 1) {
                                throw new org.springframework.web.server.ResponseStatusException(
                                                org.springframework.http.HttpStatus.CONFLICT,
                                                "Some model configurations changed. Reload and try again.");
                        }

                        deleted += affected;
                }

                return deleted;
        }

        public int insertManual(
                        String id,
                        String companyId,
                        String providerId,
                        String modelId,
                        String name,
                        String type,
                        String description,
                        Integer contextWindow) {

                return jdbc.update(
                                """
                                                INSERT INTO ai_models (
                                                    id,
                                                    company_id,
                                                    provider_id,
                                                    model_id,
                                                    name,
                                                    model_type,
                                                    status,
                                                    description,
                                                    context_window,
                                                    capability_chat,
                                                    capability_vision,
                                                    capability_tool_calling,
                                                    capabilities_checked_at,
                                                    capability_error
                                                )
                                                VALUES (
                                                    ?, ?, ?, ?, ?, ?,
                                                    'disabled',
                                                    ?, ?,
                                                    NULL, NULL, NULL, NULL,
                                                    '尚未读取模型能力'
                                                )
                                                """,
                                id,
                                companyId,
                                providerId,
                                modelId,
                                name,
                                type,
                                description,
                                contextWindow);
        }
}