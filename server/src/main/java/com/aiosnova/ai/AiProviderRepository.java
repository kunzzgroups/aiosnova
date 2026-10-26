package com.aiosnova.ai;

import java.util.List;
import java.util.Optional;
import java.time.LocalDateTime;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

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
            long version,
            long connectionRevision,
            String verificationStatus,
            Long verificationRevision,
            String verificationModelId,
            LocalDateTime verificationCheckedAt,
            LocalDateTime verificationLastSuccessAt,
            String verificationErrorCode,
            String verificationErrorMessage) {

        // Compatibility constructor for existing test fixtures.
        public ProviderSummary(
                String id,
                String companyId,
                String name,
                String providerType,
                String baseUrl,
                boolean enabled,
                boolean hasApiKey,
                long version) {

            this(
                    id,
                    companyId,
                    name,
                    providerType,
                    baseUrl,
                    enabled,
                    hasApiKey,
                    version,
                    0L,
                    "not_verified",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null);
        }
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

    public record ProviderVerificationState(
            String id,
            String companyId,
            long version,
            long connectionRevision,
            String verificationStatus,
            Long verificationRevision,
            String verificationModelId,
            LocalDateTime verificationCheckedAt,
            LocalDateTime verificationLastSuccessAt,
            String verificationErrorCode,
            String verificationErrorMessage,
            String verificationAttemptId) {
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
                        version,
                        connection_revision,
                        verification_status,
                        verification_revision,
                        verification_model_id,
                        verification_checked_at,
                        verification_last_success_at,
                        verification_error_code,
                        verification_error_message
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
                        result.getLong("version"),
                        result.getLong("connection_revision"),
                        result.getString("verification_status"),
                        result.getObject("verification_revision", Long.class),
                        result.getString("verification_model_id"),
                        result.getObject(
                                "verification_checked_at",
                                LocalDateTime.class),
                        result.getObject(
                                "verification_last_success_at",
                                LocalDateTime.class),
                        result.getString("verification_error_code"),
                        result.getString("verification_error_message")),
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

    public Optional<ProviderVerificationState> findVerificationState(
            String companyId,
            String providerId) {

        var items = jdbc.query(
                """
                        SELECT
                            id,
                            company_id,
                            version,
                            connection_revision,
                            verification_status,
                            verification_revision,
                            verification_model_id,
                            verification_checked_at,
                            verification_last_success_at,
                            verification_error_code,
                            verification_error_message,
                            verification_attempt_id
                        FROM ai_providers
                        WHERE company_id = ?
                          AND id = ?
                        """,
                (result, rowNumber) -> new ProviderVerificationState(
                        result.getString("id"),
                        result.getString("company_id"),
                        result.getLong("version"),
                        result.getLong("connection_revision"),
                        result.getString("verification_status"),
                        result.getObject("verification_revision", Long.class),
                        result.getString("verification_model_id"),
                        result.getObject(
                                "verification_checked_at",
                                LocalDateTime.class),
                        result.getObject(
                                "verification_last_success_at",
                                LocalDateTime.class),
                        result.getString("verification_error_code"),
                        result.getString("verification_error_message"),
                        result.getString("verification_attempt_id")),
                companyId,
                providerId);

        return items.stream().findFirst();
    }

    public int beginVerification(
            String companyId,
            String providerId,
            long expectedVersion,
            long connectionRevision,
            String attemptId) {

        return jdbc.update(
                """
                        UPDATE ai_providers
                        SET
                            verification_attempt_id = ?,
                            version = version + 1
                        WHERE company_id = ?
                          AND id = ?
                          AND version = ?
                          AND connection_revision = ?
                          AND enabled = TRUE
                          AND api_key_ciphertext IS NOT NULL
                        """,
                attemptId,
                companyId,
                providerId,
                expectedVersion,
                connectionRevision);
    }

    public int completeVerification(
            String companyId,
            String providerId,
            long connectionRevision,
            String attemptId,
            String modelId,
            boolean verified,
            String errorCode,
            String errorMessage) {

        return jdbc.update(
                """
                        UPDATE ai_providers
                        SET
                            verification_status = ?,
                            verification_revision = ?,
                            verification_model_id = ?,
                            verification_checked_at = UTC_TIMESTAMP(6),
                            verification_last_success_at =
                                CASE WHEN ?
                                    THEN UTC_TIMESTAMP(6)
                                    ELSE verification_last_success_at
                                END,
                            verification_error_code = ?,
                            verification_error_message = ?,
                            verification_attempt_id = NULL,
                            version = version + 1
                        WHERE company_id = ?
                          AND id = ?
                          AND connection_revision = ?
                          AND verification_attempt_id = ?
                          AND enabled = TRUE
                        """,
                verified ? "verified" : "failed",
                connectionRevision,
                modelId,
                verified,
                verified ? null : errorCode,
                verified ? null : errorMessage,
                companyId,
                providerId,
                connectionRevision,
                attemptId);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public int invalidateVerificationAfterConnectionChange(
            String companyId,
            String providerId,
            long updatedVersion) {

        return jdbc.update(
                """
                        UPDATE ai_providers
                        SET
                            connection_revision = connection_revision + 1,
                            verification_status = 'not_verified',
                            verification_revision = NULL,
                            verification_model_id = NULL,
                            verification_checked_at = NULL,
                            verification_error_code = NULL,
                            verification_error_message = NULL,
                            verification_attempt_id = NULL
                        WHERE company_id = ?
                          AND id = ?
                          AND version = ?
                        """,
                companyId,
                providerId,
                updatedVersion);
    }
}
