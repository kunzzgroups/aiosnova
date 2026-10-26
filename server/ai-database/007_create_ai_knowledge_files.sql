-- Local AI database only. Run once after 006. No application data is inserted.
USE aiosnova_ai_local;
ALTER TABLE ai_knowledge_skills ADD UNIQUE KEY uq_ai_skill_company_id (company_id, id);
ALTER TABLE ai_knowledge_data_sources ADD UNIQUE KEY uq_ai_data_source_company_id (company_id, id);
CREATE TABLE ai_knowledge_files (
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
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4;
GRANT SELECT, INSERT, UPDATE, DELETE ON aiosnova_ai_local.ai_knowledge_files TO 'ai_app'@'127.0.0.1';
