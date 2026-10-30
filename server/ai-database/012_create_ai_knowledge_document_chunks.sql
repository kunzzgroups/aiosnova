USE aiosnova_ai_local;

CREATE TABLE ai_knowledge_document_chunks (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    document_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    file_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    chunk_index INT UNSIGNED NOT NULL,
    content MEDIUMTEXT NOT NULL,
    source_label VARCHAR(255) NULL,

    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),

    UNIQUE KEY uq_ai_chunk_file_index (
        company_id, file_id, chunk_index
    ),

    KEY ix_ai_chunk_document (
        company_id, document_id, file_id, chunk_index
    ),

    CONSTRAINT fk_ai_chunk_document
        FOREIGN KEY (company_id, document_id)
        REFERENCES ai_knowledge_documents (company_id, id)
        ON DELETE CASCADE,

    CONSTRAINT fk_ai_chunk_file
        FOREIGN KEY (company_id, file_id)
        REFERENCES ai_knowledge_files (company_id, id)
        ON DELETE CASCADE,

    CONSTRAINT ck_ai_chunk_content CHECK (
        CHAR_LENGTH(TRIM(content)) > 0
    )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON aiosnova_ai_local.ai_knowledge_document_chunks
    TO 'ai_app'@'127.0.0.1';