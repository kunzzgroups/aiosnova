-- AI module only. Run manually against your LOCAL MySQL 8 development instance.
-- This script never selects or modifies the Core database.
-- Do not put passwords or API keys in this file.

CREATE DATABASE IF NOT EXISTS aiosnova_ai_local
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE aiosnova_ai_local;

-- Intentionally no IF NOT EXISTS: an existing table must be inspected before
-- applying another schema version instead of silently accepting a mismatch.
CREATE TABLE ai_providers (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(120) NOT NULL,
    provider_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin
        NOT NULL DEFAULT 'openrouter',
    base_url VARCHAR(512) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    -- Java will store encrypted bytes, never the plaintext API key.
    -- The independent AI encryption master key stays outside this database.
    api_key_ciphertext VARBINARY(8192) NULL,
    api_key_key_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,

    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_provider_company_name (company_id, name),
    UNIQUE KEY uq_ai_provider_company_id (company_id, id),
    CONSTRAINT ck_ai_provider_enabled CHECK (enabled IN (0, 1)),
    CONSTRAINT ck_ai_provider_key_pair CHECK (
        (api_key_ciphertext IS NULL AND api_key_key_id IS NULL)
        OR
        (api_key_ciphertext IS NOT NULL AND api_key_key_id IS NOT NULL)
    )
) ENGINE = InnoDB;

-- Read-only checks. The first query must report aiosnova_ai_local.
SELECT DATABASE() AS current_database;
SHOW TABLES;
SHOW CREATE TABLE ai_providers;
