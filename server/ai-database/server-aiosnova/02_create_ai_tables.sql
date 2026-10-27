-- Prepared for shared MySQL 8.4 database aiosnova. NOT executed by preparation.
-- New installation only: all 14 target tables must be absent.
-- Run precheck separately and review it first. Do not use mysql --force.
-- DDL commits implicitly; failure may leave a partially created schema.
-- No grants, seed/import data, existing-table alterations, or database creation.
USE aiosnova;

CREATE TABLE aiosnova.ai_providers (
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

    connection_revision
        BIGINT UNSIGNED NOT NULL DEFAULT 0,

    verification_status
        VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin
        NOT NULL DEFAULT 'not_verified',

    verification_revision
        BIGINT UNSIGNED NULL,

    verification_model_id
        VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NULL,

    verification_checked_at
        DATETIME(6) NULL,

    verification_last_success_at
        DATETIME(6) NULL,

    verification_error_code
        VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,

    verification_error_message
        VARCHAR(512) NULL,

    verification_attempt_id
        CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
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
    ),
    CONSTRAINT ck_ai_provider_verification_status
        CHECK (
            verification_status IN (
                'not_verified',
                'verified',
                'failed'
            )
        )
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE aiosnova.ai_models (
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
    catalog_context_window INT NULL,
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
    CONSTRAINT ck_ai_model_tools CHECK (capability_tool_calling IN (0, 1)),
    CONSTRAINT ck_ai_model_catalog_context CHECK (
        catalog_context_window IS NULL OR catalog_context_window > 0
    )
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE aiosnova.ai_model_preferences (
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    default_model_config_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    recommended_model_ids JSON NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (company_id)

) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE aiosnova.ai_agents (
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

) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE aiosnova.ai_agent_knowledge_bases (
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    agent_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    knowledge_base_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (company_id, agent_id, knowledge_base_id),
    KEY ix_ai_agent_base (company_id, knowledge_base_id),
    CONSTRAINT fk_ai_agent_base_agent FOREIGN KEY (company_id, agent_id)
        REFERENCES ai_agents (company_id, id) ON DELETE CASCADE

) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE aiosnova.ai_knowledge_bases (
    id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    merchant_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'General',
    kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'document',
    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_knowledge_company_id (company_id, id),
    CONSTRAINT ck_ai_knowledge_kind CHECK (kind IN ('document', 'skill', 'data'))

) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE aiosnova.ai_knowledge_base_visibility (
    owner_company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    knowledge_base_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    allowed_company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (owner_company_id, knowledge_base_id, allowed_company_id),
    KEY ix_ai_knowledge_visible_company (allowed_company_id, knowledge_base_id),
    CONSTRAINT fk_ai_knowledge_visibility_base FOREIGN KEY (owner_company_id, knowledge_base_id)
        REFERENCES ai_knowledge_bases (company_id, id) ON DELETE CASCADE

) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE aiosnova.ai_knowledge_documents (
    id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    knowledge_base_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title VARCHAR(512) NOT NULL,
    kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    document_type VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    mode VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'active',
    chunk_count INT UNSIGNED NOT NULL DEFAULT 0,
    size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
    uploaded_at DATETIME(6) NOT NULL,
    last_indexed_at DATETIME(6) NULL,
    file_url TEXT NULL,
    mime_type VARCHAR(255) NULL,
    -- override with zero link rows means explicitly assigned to no agents.
    assignment_mode VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'inherit',
    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_knowledge_document_company (company_id, id),
    KEY ix_ai_knowledge_document_base (company_id, knowledge_base_id),
    CONSTRAINT fk_ai_knowledge_document_base FOREIGN KEY (company_id, knowledge_base_id)
        REFERENCES ai_knowledge_bases (company_id, id) ON DELETE CASCADE,
    CONSTRAINT ck_ai_knowledge_document_kind CHECK (kind IN ('file', 'record')),
    CONSTRAINT ck_ai_knowledge_document_type CHECK (document_type IN ('contract', 'invoice', 'policy', 'record')),
    CONSTRAINT ck_ai_knowledge_document_status CHECK (status IN ('ready', 'processing', 'failed')),
    CONSTRAINT ck_ai_knowledge_document_mode CHECK (mode IN ('active', 'paused', 'testing')),
    CONSTRAINT ck_ai_knowledge_assignment_mode CHECK (assignment_mode IN ('inherit', 'override'))

) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE aiosnova.ai_agent_document_overrides (
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    document_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    agent_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (company_id, document_id, agent_id),
    KEY ix_ai_document_override_agent (company_id, agent_id),
    CONSTRAINT fk_ai_override_document FOREIGN KEY (company_id, document_id)
        REFERENCES ai_knowledge_documents (company_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_override_agent FOREIGN KEY (company_id, agent_id)
        REFERENCES ai_agents (company_id, id) ON DELETE CASCADE

) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE aiosnova.ai_knowledge_templates (
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

) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE aiosnova.ai_knowledge_template_visibility (
    owner_company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    template_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    allowed_company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (owner_company_id, template_id, allowed_company_id),
    KEY ix_ai_template_recipient (allowed_company_id, template_id),
    CONSTRAINT fk_ai_template_visibility FOREIGN KEY (owner_company_id, template_id)
        REFERENCES ai_knowledge_templates (owner_company_id, id) ON DELETE CASCADE

) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE aiosnova.ai_knowledge_skills (
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
    UNIQUE KEY uq_ai_skill_company_id (company_id, id),
    KEY ix_ai_skill_base (company_id, knowledge_base_id),
    CONSTRAINT fk_ai_skill_base FOREIGN KEY (company_id, knowledge_base_id)
        REFERENCES ai_knowledge_bases (company_id, id) ON DELETE CASCADE,
    CONSTRAINT ck_ai_skill_status CHECK (status IN ('draft', 'ready', 'failed')),
    CONSTRAINT ck_ai_skill_mode CHECK (mode IN ('active', 'paused', 'testing')),
    CONSTRAINT ck_ai_skill_schema CHECK (input_schema IS NULL OR JSON_TYPE(input_schema) = 'OBJECT')

) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE aiosnova.ai_knowledge_data_sources (
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
    UNIQUE KEY uq_ai_data_source_company_id (company_id, id),
    KEY ix_ai_data_source_base (company_id, knowledge_base_id),
    CONSTRAINT fk_ai_data_source_base FOREIGN KEY (company_id, knowledge_base_id)
        REFERENCES ai_knowledge_bases (company_id, id) ON DELETE CASCADE,
    CONSTRAINT ck_ai_data_source_kind CHECK (kind IN ('table', 'api', 'database')),
    CONSTRAINT ck_ai_data_source_status CHECK (status IN ('connected', 'disconnected', 'error')),
    CONSTRAINT ck_ai_data_source_mode CHECK (mode IN ('active', 'paused', 'testing')),
    CONSTRAINT ck_ai_data_source_config CHECK (JSON_TYPE(config) = 'OBJECT')

) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE aiosnova.ai_knowledge_files (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    document_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    template_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    skill_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    data_source_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    name VARCHAR(512) NOT NULL,
    mime_type VARCHAR(255) NOT NULL,
    content MEDIUMBLOB NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY ix_ai_file_document (company_id, document_id),
    KEY ix_ai_file_template (company_id, template_id),
    CONSTRAINT fk_ai_file_document FOREIGN KEY (company_id, document_id)
        REFERENCES ai_knowledge_documents (company_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_file_template FOREIGN KEY (company_id, template_id)
        REFERENCES ai_knowledge_templates (owner_company_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_file_skill FOREIGN KEY (company_id, skill_id)
        REFERENCES ai_knowledge_skills (company_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_file_data_source FOREIGN KEY (company_id, data_source_id)
        REFERENCES ai_knowledge_data_sources (company_id, id) ON DELETE CASCADE,
    CONSTRAINT ck_ai_file_parent CHECK (
        (document_id IS NOT NULL) + (template_id IS NOT NULL) +
        (skill_id IS NOT NULL) + (data_source_id IS NOT NULL) = 1
    )

) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
