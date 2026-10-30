-- OPTIONAL manual migration. Not executed by the application or tests.
-- Back up first; only enqueue existing uploaded documents stuck in processing.
USE aiosnova_ai_local;
INSERT INTO ai_knowledge_processing_jobs(id,company_id,file_id)
SELECT UUID(),f.company_id,f.id
FROM ai_knowledge_files f
JOIN ai_knowledge_documents d ON d.company_id=f.company_id AND d.id=f.document_id
WHERE d.status='processing'
AND NOT EXISTS(SELECT 1 FROM ai_knowledge_processing_jobs j
               WHERE j.company_id=f.company_id AND j.file_id=f.id);
-- Original file/document IDs and Agent links are unchanged.
