-- Prepare only. Apply manually to the intended database before enabling processing.
USE aiosnova_ai_local;
ALTER TABLE ai_knowledge_documents
    DROP CHECK ck_ai_knowledge_document_status,
    ADD CONSTRAINT ck_ai_knowledge_document_status
        CHECK (status IN ('ready','processing','failed','stored_only'));
-- No records or bindings are changed.
