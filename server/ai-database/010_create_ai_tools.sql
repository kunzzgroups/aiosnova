-- Local AI database only. New tables, no seed/import data.
-- MySQL DDL implicitly commits. Stop and inspect on error.
USE aiosnova_ai_local;

CREATE TABLE aiosnova_ai_local.ai_tools (
    id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    module VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    action VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    -- Identifier of a trusted Java executor, not a class name or script.
    executor_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    risk VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin
        NOT NULL DEFAULT 'low',

    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin
        NOT NULL DEFAULT 'disabled',

    timeout_seconds INT NOT NULL DEFAULT 30,
    requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,

    -- Non-secret configuration only.
    configuration JSON NOT NULL,

    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_tool_company_id (company_id, id),
    UNIQUE KEY uq_ai_tool_company_action (company_id, action),
    KEY ix_ai_tool_company_status (company_id, status),

    CONSTRAINT ck_ai_tool_module CHECK (
        module IN ('Retrieval', 'Utility', 'Data', 'Communication', 'Files')
    ),
    CONSTRAINT ck_ai_tool_risk CHECK (
        risk IN ('low', 'medium', 'high')
    ),
    CONSTRAINT ck_ai_tool_status CHECK (
        status IN ('active', 'disabled', 'error')
    ),
    CONSTRAINT ck_ai_tool_timeout CHECK (
        timeout_seconds BETWEEN 1 AND 600
    ),
    CONSTRAINT ck_ai_tool_confirmation CHECK (
        requires_confirmation IN (0, 1)
    ),
    CONSTRAINT ck_ai_tool_high_risk CHECK (
        risk <> 'high' OR requires_confirmation = 1
    ),
    CONSTRAINT ck_ai_tool_configuration CHECK (
        JSON_TYPE(configuration) = 'OBJECT'
    )
) ENGINE = InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE aiosnova_ai_local.ai_agent_tools (
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    agent_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    tool_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (company_id, agent_id, tool_id),
    KEY ix_ai_agent_tool_target (company_id, tool_id),

    CONSTRAINT fk_ai_agent_tool_agent
        FOREIGN KEY (company_id, agent_id)
        REFERENCES aiosnova_ai_local.ai_agents (company_id, id)
        ON DELETE CASCADE,

    CONSTRAINT fk_ai_agent_tool_tool
        FOREIGN KEY (company_id, tool_id)
        REFERENCES aiosnova_ai_local.ai_tools (company_id, id)
        ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;