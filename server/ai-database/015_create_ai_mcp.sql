-- Local development only. Run once using a schema administrator after precheck.
-- No application records are inserted. DDL is not an all-or-nothing transaction.
-- Services must enforce Merchant ownership and compare/increment version on writes.
USE aiosnova_ai_local;

CREATE TABLE ai_mcp_servers (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    merchant_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    endpoint_url VARCHAR(2048) NOT NULL,

    transport VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin
        NOT NULL DEFAULT 'streamable_http',
    protocol_version VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin
        NOT NULL DEFAULT '2025-11-25',

    auth_type VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin
        NOT NULL DEFAULT 'none',
    secret_ciphertext TEXT NULL,

    enabled TINYINT(1) NOT NULL DEFAULT 0,
    timeout_seconds INT NOT NULL DEFAULT 30,

    connection_revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
    verification_status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin
        NOT NULL DEFAULT 'not_verified',
    verification_revision BIGINT UNSIGNED NULL,
    verification_checked_at DATETIME(6) NULL,
    verification_error_code VARCHAR(64) NULL,
    verification_error_message VARCHAR(512) NULL,

    discovery_checked_at DATETIME(6) NULL,
    discovery_error_code VARCHAR(64) NULL,
    discovery_error_message VARCHAR(512) NULL,

    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_mcp_server_company (company_id, id),
    KEY ix_ai_mcp_server_scope (merchant_id, company_id, enabled),

    CONSTRAINT ck_ai_mcp_transport
        CHECK (transport = 'streamable_http'),
    CONSTRAINT ck_ai_mcp_protocol
        CHECK (protocol_version = '2025-11-25'),
    CONSTRAINT ck_ai_mcp_auth
        CHECK (auth_type IN ('none', 'api_key')),
    CONSTRAINT ck_ai_mcp_secret
        CHECK (
            (auth_type = 'none' AND secret_ciphertext IS NULL)
            OR
            (auth_type = 'api_key' AND secret_ciphertext IS NOT NULL
             AND CHAR_LENGTH(TRIM(secret_ciphertext)) > 0)
        ),
    CONSTRAINT ck_ai_mcp_server_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
    CONSTRAINT ck_ai_mcp_endpoint CHECK (CHAR_LENGTH(TRIM(endpoint_url)) > 0),
    CONSTRAINT ck_ai_mcp_enabled CHECK (enabled IN (0, 1)),
    CONSTRAINT ck_ai_mcp_timeout CHECK (timeout_seconds BETWEEN 1 AND 120),
    CONSTRAINT ck_ai_mcp_verification CHECK (
        verification_status IN ('not_verified', 'verified', 'failed')
    ),
    CONSTRAINT ck_ai_mcp_verified_revision CHECK (
        verification_status <> 'verified'
        OR (
            verification_revision IS NOT NULL
            AND verification_revision = connection_revision
            AND verification_checked_at IS NOT NULL
        )
    )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4;


CREATE TABLE ai_mcp_tools (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    server_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    remote_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    description TEXT NOT NULL,
    input_schema JSON NOT NULL,

    enabled TINYINT(1) NOT NULL DEFAULT 0,
    available TINYINT(1) NOT NULL DEFAULT 1,

    discovered_connection_revision BIGINT UNSIGNED NOT NULL,
    discovered_at DATETIME(6) NOT NULL,
    version BIGINT UNSIGNED NOT NULL DEFAULT 0,

    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_mcp_tool_company (company_id, id),
    UNIQUE KEY uq_ai_mcp_remote_tool (
        company_id, server_id, remote_name
    ),
    KEY ix_ai_mcp_tool_server (company_id, server_id, available, enabled),

    CONSTRAINT fk_ai_mcp_tool_server
        FOREIGN KEY (company_id, server_id)
        REFERENCES ai_mcp_servers (company_id, id)
        ON DELETE CASCADE,

    CONSTRAINT ck_ai_mcp_tool_enabled CHECK (enabled IN (0, 1)),
    CONSTRAINT ck_ai_mcp_tool_name CHECK (CHAR_LENGTH(TRIM(remote_name)) > 0),
    CONSTRAINT ck_ai_mcp_tool_available CHECK (available IN (0, 1)),
    CONSTRAINT ck_ai_mcp_input_schema CHECK (
        JSON_TYPE(input_schema) = 'OBJECT'
    )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4;


CREATE TABLE ai_agent_mcp_tools (
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    agent_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    tool_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (company_id, agent_id, tool_id),
    KEY ix_ai_agent_mcp_tool (company_id, tool_id),

    CONSTRAINT fk_ai_agent_mcp_agent
        FOREIGN KEY (company_id, agent_id)
        REFERENCES ai_agents (company_id, id)
        ON DELETE CASCADE,

    CONSTRAINT fk_ai_agent_mcp_tool
        FOREIGN KEY (company_id, tool_id)
        REFERENCES ai_mcp_tools (company_id, id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4;


GRANT SELECT, INSERT, UPDATE, DELETE
    ON aiosnova_ai_local.ai_mcp_servers
    TO 'ai_app'@'127.0.0.1';

GRANT SELECT, INSERT, UPDATE, DELETE
    ON aiosnova_ai_local.ai_mcp_tools
    TO 'ai_app'@'127.0.0.1';

GRANT SELECT, INSERT, UPDATE, DELETE
    ON aiosnova_ai_local.ai_agent_mcp_tools
    TO 'ai_app'@'127.0.0.1';
