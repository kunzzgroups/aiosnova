-- AI local database only. Run once as schema administrator after 004.
-- Storage only: does not seed data or switch frontend behavior.
USE aiosnova_ai_local;

CREATE TABLE ai_knowledge_bases (
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
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4;

-- Owner always has read access; rows here represent additional readable companies.
-- Sharing never changes ownership or grants Agent assignment/write permission.
CREATE TABLE ai_knowledge_base_visibility (
    owner_company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    knowledge_base_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    allowed_company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (owner_company_id, knowledge_base_id, allowed_company_id),
    KEY ix_ai_knowledge_visible_company (allowed_company_id, knowledge_base_id),
    CONSTRAINT fk_ai_knowledge_visibility_base FOREIGN KEY (owner_company_id, knowledge_base_id)
        REFERENCES ai_knowledge_bases (company_id, id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- Metadata only: no file bytes, embeddings, or RAG index are stored here.
CREATE TABLE ai_knowledge_documents (
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
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4;

CREATE TABLE ai_agent_document_overrides (
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    document_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    agent_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (company_id, document_id, agent_id),
    KEY ix_ai_document_override_agent (company_id, agent_id),
    CONSTRAINT fk_ai_override_document FOREIGN KEY (company_id, document_id)
        REFERENCES ai_knowledge_documents (company_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_override_agent FOREIGN KEY (company_id, agent_id)
        REFERENCES ai_agents (company_id, id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- Existing base bindings remain in ai_agent_knowledge_bases from 004.
-- Service/import must validate base existence, ownership, and active Agent status.
-- Do not add a base FK here: historical dangling links must be audited first.
GRANT SELECT, INSERT, UPDATE, DELETE ON aiosnova_ai_local.ai_knowledge_bases TO 'ai_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON aiosnova_ai_local.ai_knowledge_base_visibility TO 'ai_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON aiosnova_ai_local.ai_knowledge_documents TO 'ai_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON aiosnova_ai_local.ai_agent_document_overrides TO 'ai_app'@'127.0.0.1';
