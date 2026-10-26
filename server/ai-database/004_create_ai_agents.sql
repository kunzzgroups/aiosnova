-- AI database only. Run once with a schema-administration account.
-- Creates storage only; does not import or replace frontend mock data.
USE aiosnova_ai_local;

CREATE TABLE ai_agents (
    id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    merchant_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'General',
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'draft',
    -- NULL pair means follow the Assistant model. Retain unavailable bindings.
    provider_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    model_config_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    temperature DOUBLE NOT NULL DEFAULT 0.3,
    top_p DOUBLE NOT NULL DEFAULT 1,
    max_tokens INT NOT NULL DEFAULT 2048,
    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_agent_company_id (company_id, id),
    KEY ix_ai_agent_company_status (company_id, status),
    CONSTRAINT ck_ai_agent_status CHECK (status IN ('active', 'draft', 'disabled')),
    CONSTRAINT ck_ai_agent_binding CHECK (
        (provider_id IS NULL AND model_config_id IS NULL) OR
        (provider_id IS NOT NULL AND model_config_id IS NOT NULL)
    ),
    CONSTRAINT ck_ai_agent_temperature CHECK (temperature BETWEEN 0 AND 2),
    CONSTRAINT ck_ai_agent_top_p CHECK (top_p > 0 AND top_p <= 1),
    CONSTRAINT ck_ai_agent_max_tokens CHECK (max_tokens > 0)
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4;

-- Keep existing mock Agent/base IDs during import so links remain stable.
-- Knowledge bases currently have no SQL table; validate their company in Service.
CREATE TABLE ai_agent_knowledge_bases (
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    agent_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    knowledge_base_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (company_id, agent_id, knowledge_base_id),
    KEY ix_ai_agent_base (company_id, knowledge_base_id),
    CONSTRAINT fk_ai_agent_base_agent FOREIGN KEY (company_id, agent_id)
        REFERENCES ai_agents (company_id, id) ON DELETE CASCADE
) ENGINE = InnoDB;

GRANT SELECT, INSERT, UPDATE, DELETE
ON aiosnova_ai_local.ai_agents TO 'ai_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE
ON aiosnova_ai_local.ai_agent_knowledge_bases TO 'ai_app'@'127.0.0.1';
