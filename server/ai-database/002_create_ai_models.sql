-- AI module only. Run once after 001_create_ai_providers.sql on LOCAL MySQL 8.
-- Use a schema-administration account; ai_app must already exist.
-- This script creates a table and grants access. It inserts no application data.

USE aiosnova_ai_local;

-- No IF NOT EXISTS: inspect an existing table rather than hiding a schema mismatch.
CREATE TABLE ai_models (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    provider_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    model_id VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(255) NOT NULL,
    model_type VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin
        NOT NULL DEFAULT 'other',
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin
        NOT NULL DEFAULT 'disabled',
    description TEXT NOT NULL,

    context_window INT NULL,
    -- NULL means unknown; FALSE means explicitly unsupported.
    capability_chat BOOLEAN NULL,
    capability_vision BOOLEAN NULL,
    capability_tool_calling BOOLEAN NULL,
    capabilities_checked_at DATETIME(6) NULL,
    capability_error VARCHAR(512) NULL,

    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_model_provider_model (company_id, provider_id, model_id),
    CONSTRAINT fk_ai_model_provider
        FOREIGN KEY (company_id, provider_id)
        REFERENCES ai_providers (company_id, id)
        ON DELETE CASCADE,
    CONSTRAINT ck_ai_model_type CHECK (
        model_type IN ('chat', 'reasoning', 'embedding', 'other')
    ),
    CONSTRAINT ck_ai_model_status CHECK (
        status IN ('enabled', 'disabled', 'error')
    ),
    CONSTRAINT ck_ai_model_context CHECK (
        context_window IS NULL OR context_window > 0
    ),
    CONSTRAINT ck_ai_model_chat CHECK (capability_chat IN (0, 1)),
    CONSTRAINT ck_ai_model_vision CHECK (capability_vision IN (0, 1)),
    CONSTRAINT ck_ai_model_tools CHECK (capability_tool_calling IN (0, 1))
) ENGINE = InnoDB;

GRANT SELECT, INSERT, UPDATE, DELETE
ON aiosnova_ai_local.ai_models
TO 'ai_app'@'127.0.0.1';

SELECT DATABASE() AS current_database;
SHOW CREATE TABLE ai_models;
SELECT COUNT(*) AS model_count FROM ai_models;
