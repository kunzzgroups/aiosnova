USE aiosnova_ai_local;

-- 为任务表提供带公司归属的文件外键。
ALTER TABLE ai_knowledge_files
    ADD UNIQUE KEY uq_ai_file_company_id (company_id, id);

CREATE TABLE ai_knowledge_processing_jobs (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    file_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin
        NOT NULL DEFAULT 'queued',
    attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
    max_attempts INT UNSIGNED NOT NULL DEFAULT 3,
    available_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    claim_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    lease_expires_at DATETIME(6) NULL,

    error_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    error_message VARCHAR(512) NULL,

    started_at DATETIME(6) NULL,
    finished_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_processing_file (company_id, file_id),
    KEY ix_ai_processing_queue (status, available_at),
    KEY ix_ai_processing_lease (status, lease_expires_at),

    CONSTRAINT fk_ai_processing_file
        FOREIGN KEY (company_id, file_id)
        REFERENCES ai_knowledge_files (company_id, id)
        ON DELETE CASCADE,

    CONSTRAINT ck_ai_processing_status CHECK (
        status IN (
            'queued', 'running', 'succeeded', 'failed', 'unsupported'
        )
    ),
    CONSTRAINT ck_ai_processing_attempts CHECK (
        max_attempts BETWEEN 1 AND 10
        AND attempt_count <= max_attempts
    ),
    CONSTRAINT ck_ai_processing_claim CHECK (
        (
            status = 'running'
            AND claim_token IS NOT NULL
            AND lease_expires_at IS NOT NULL
        )
        OR
        (
            status <> 'running'
            AND claim_token IS NULL
            AND lease_expires_at IS NULL
        )
    )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON aiosnova_ai_local.ai_knowledge_processing_jobs
    TO 'ai_app'@'127.0.0.1';