-- Local AI database only. Run once as schema administrator after 005.
-- Schema only: no snapshot is imported.
USE aiosnova_ai_local;

CREATE TABLE ai_knowledge_templates (
    id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    owner_company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    -- Independent content snapshots; no source Agent links or live base references.
    documents JSON NOT NULL,
    skills JSON NOT NULL,
    data_sources JSON NOT NULL,
    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    -- Current Mock templates have no timestamps: these track SQL storage only.
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_template_owner_id (owner_company_id, id),
    CONSTRAINT ck_ai_template_kind CHECK (kind IN ('document', 'skill', 'data')),
    CONSTRAINT ck_ai_template_documents CHECK (JSON_TYPE(documents) = 'ARRAY'),
    CONSTRAINT ck_ai_template_skills CHECK (JSON_TYPE(skills) = 'ARRAY'),
    CONSTRAINT ck_ai_template_sources CHECK (JSON_TYPE(data_sources) = 'ARRAY')
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4;

CREATE TABLE ai_knowledge_template_visibility (
    owner_company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    template_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    allowed_company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (owner_company_id, template_id, allowed_company_id),
    KEY ix_ai_template_recipient (allowed_company_id, template_id),
    CONSTRAINT fk_ai_template_visibility FOREIGN KEY (owner_company_id, template_id)
        REFERENCES ai_knowledge_templates (owner_company_id, id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE ai_knowledge_skills (
    id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    knowledge_base_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    input_schema JSON NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    mode VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'active',
    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY ix_ai_skill_base (company_id, knowledge_base_id),
    CONSTRAINT fk_ai_skill_base FOREIGN KEY (company_id, knowledge_base_id)
        REFERENCES ai_knowledge_bases (company_id, id) ON DELETE CASCADE,
    CONSTRAINT ck_ai_skill_status CHECK (status IN ('draft', 'ready', 'failed')),
    CONSTRAINT ck_ai_skill_mode CHECK (mode IN ('active', 'paused', 'testing')),
    CONSTRAINT ck_ai_skill_schema CHECK (input_schema IS NULL OR JSON_TYPE(input_schema) = 'OBJECT')
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4;

CREATE TABLE ai_knowledge_data_sources (
    id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    knowledge_base_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(255) NOT NULL,
    kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    -- Non-secret metadata only. Credentials require a separate encrypted store.
    config JSON NOT NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    mode VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'active',
    last_synced_at DATETIME(6) NULL,
    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY ix_ai_data_source_base (company_id, knowledge_base_id),
    CONSTRAINT fk_ai_data_source_base FOREIGN KEY (company_id, knowledge_base_id)
        REFERENCES ai_knowledge_bases (company_id, id) ON DELETE CASCADE,
    CONSTRAINT ck_ai_data_source_kind CHECK (kind IN ('table', 'api', 'database')),
    CONSTRAINT ck_ai_data_source_status CHECK (status IN ('connected', 'disconnected', 'error')),
    CONSTRAINT ck_ai_data_source_mode CHECK (mode IN ('active', 'paused', 'testing')),
    CONSTRAINT ck_ai_data_source_config CHECK (JSON_TYPE(config) = 'OBJECT')
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4;

GRANT SELECT, INSERT, UPDATE, DELETE ON aiosnova_ai_local.ai_knowledge_templates TO 'ai_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON aiosnova_ai_local.ai_knowledge_template_visibility TO 'ai_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON aiosnova_ai_local.ai_knowledge_skills TO 'ai_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON aiosnova_ai_local.ai_knowledge_data_sources TO 'ai_app'@'127.0.0.1';
