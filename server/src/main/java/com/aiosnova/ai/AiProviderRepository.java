package com.aiosnova.ai;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AiProviderRepository {

    private final JdbcTemplate jdbc;

    public AiProviderRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record ProviderSummary(
            String id,
            String companyId,
            String name,
            String providerType,
            String baseUrl,
            boolean enabled,
            boolean hasApiKey,
            long version) {
    }

    public record ProviderExecutionConfig(
            String id,
            String companyId,
            String providerType,
            String baseUrl,
            boolean enabled,
            byte[] encryptedApiKey,
            String keyId) {
    }

    public List<ProviderSummary> findByCompany(String companyId) {
        return jdbc.query(
                """
                        SELECT
                            id,
                            company_id,
                            name,
                            provider_type,
                            base_url,
                            enabled,
                            api_key_ciphertext IS NOT NULL AS has_api_key,
                            version
                        FROM ai_providers
                        WHERE company_id = ?
                        ORDER BY name, id
                        """,
                (result, rowNumber) -> new ProviderSummary(
                        result.getString("id"),
                        result.getString("company_id"),
                        result.getString("name"),
                        result.getString("provider_type"),
                        result.getString("base_url"),
                        result.getBoolean("enabled"),
                        result.getBoolean("has_api_key"),
                        result.getLong("version")),
                companyId);
    }

    public void insert(
            String id,
            String companyId,
            String name,
            String baseUrl,
            boolean enabled,
            byte[] encryptedApiKey,
            String keyId) {
        int affected = jdbc.update(
                """
                        INSERT INTO ai_providers (
                            id,
                            company_id,
                            name,
                            provider_type,
                            base_url,
                            enabled,
                            api_key_ciphertext,
                            api_key_key_id
                        )
                        VALUES (?, ?, ?, 'openrouter', ?, ?, ?, ?)
                        """,
                id,
                companyId,
                name,
                baseUrl,
                enabled,
                encryptedApiKey,
                keyId);

        if (affected != 1) {
            throw new IllegalStateException("Unable to save the Provider.");
        }
    }

    public int update(
            String companyId,
            String id,
            String name,
            String baseUrl,
            boolean enabled,
            byte[] encryptedApiKey,
            String keyId,
            long expectedVersion) {

        return jdbc.update(
                """
                        UPDATE ai_providers
                        SET
                            name = ?,
                            base_url = ?,
                            enabled = ?,
                            api_key_ciphertext =
                                CASE WHEN ? IS NULL
                                    THEN api_key_ciphertext
                                    ELSE ?
                                END,
                            api_key_key_id =
                                CASE WHEN ? IS NULL
                                    THEN api_key_key_id
                                    ELSE ?
                                END,
                            version = version + 1
                        WHERE company_id = ?
                            AND id = ?
                            AND version = ?
                        """,
                name,
                baseUrl,
                enabled,
                encryptedApiKey,
                encryptedApiKey,
                encryptedApiKey,
                keyId,
                companyId,
                id,
                expectedVersion);
    }

    public int updateEnabled(
            String companyId,
            String id,
            boolean enabled,
            long expectedVersion) {

        return jdbc.update(
                """
                        UPDATE ai_providers
                        SET
                            enabled = ?,
                            version = version + 1
                        WHERE company_id = ?
                            AND id = ?
                            AND version = ?
                        """,
                enabled,
                companyId,
                id,
                expectedVersion);
    }

    public int deleteDisabled(
            String companyId,
            String providerId,
            long expectedVersion) {

        return jdbc.update(
                """
                        DELETE FROM ai_providers
                        WHERE company_id = ?
                            AND id = ?
                            AND enabled = FALSE
                            AND version = ?
                        """,
                companyId,
                providerId,
                expectedVersion);
    }

    public Optional<ProviderExecutionConfig> findExecutionConfig(
            String companyId,
            String providerId) {

        var items = jdbc.query(
                """
                        SELECT
                            id,
                            company_id,
                            provider_type,
                            base_url,
                            enabled,
                            api_key_ciphertext,
                            api_key_key_id
                        FROM ai_providers
                        WHERE company_id = ?
                          AND id = ?
                        """,
                (result, rowNumber) -> new ProviderExecutionConfig(
                        result.getString("id"),
                        result.getString("company_id"),
                        result.getString("provider_type"),
                        result.getString("base_url"),
                        result.getBoolean("enabled"),
                        result.getBytes("api_key_ciphertext"),
                        result.getString("api_key_key_id")),
                companyId,
                providerId);

        return items.stream().findFirst();
    }

    public boolean lockForModelSync(
            String companyId,
            String providerId,
            long expectedVersion) {

        var items = jdbc.query(
                """
                        SELECT id
                        FROM ai_providers
                        WHERE company_id = ?
                          AND id = ?
                          AND version = ?
                        FOR UPDATE
                        """,
                (result, rowNumber) -> result.getString("id"),
                companyId,
                providerId,
                expectedVersion);

        return items.size() == 1;
    }
}
