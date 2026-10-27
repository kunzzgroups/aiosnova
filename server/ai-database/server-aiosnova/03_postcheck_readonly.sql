-- Prepared for shared MySQL 8.4 database aiosnova. NOT executed by preparation.
-- READ ONLY. Run after approved DDL; it does not create/fix anything.
SELECT DATABASE() AS current_database, CURRENT_USER() AS account, @@hostname AS server_host;
WITH expected AS (
    SELECT 'ai_providers' AS table_name
    UNION ALL SELECT 'ai_models' AS table_name
    UNION ALL SELECT 'ai_model_preferences' AS table_name
    UNION ALL SELECT 'ai_agents' AS table_name
    UNION ALL SELECT 'ai_agent_knowledge_bases' AS table_name
    UNION ALL SELECT 'ai_knowledge_bases' AS table_name
    UNION ALL SELECT 'ai_knowledge_base_visibility' AS table_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name
    UNION ALL SELECT 'ai_agent_document_overrides' AS table_name
    UNION ALL SELECT 'ai_knowledge_templates' AS table_name
    UNION ALL SELECT 'ai_knowledge_template_visibility' AS table_name
    UNION ALL SELECT 'ai_knowledge_skills' AS table_name
    UNION ALL SELECT 'ai_knowledge_data_sources' AS table_name
    UNION ALL SELECT 'ai_knowledge_files' AS table_name
)
SELECT e.table_name, CASE WHEN t.table_type = 'BASE TABLE' AND t.engine = 'InnoDB'
 AND t.table_collation = 'utf8mb4_0900_ai_ci' THEN 'PASS' ELSE 'FAIL' END AS result,
 t.engine, t.table_collation
FROM expected e LEFT JOIN information_schema.tables t
 ON t.table_schema = 'aiosnova' AND t.table_name = e.table_name
ORDER BY e.table_name;
-- Expected: zero rows (all required columns exist). Types/defaults checked below.
WITH expected AS (
    SELECT 'ai_providers' AS table_name, 'id' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'company_id' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'name' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'provider_type' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'base_url' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'enabled' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'api_key_ciphertext' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'api_key_key_id' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'connection_revision' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'verification_status' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'verification_revision' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'verification_model_id' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'verification_checked_at' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'verification_last_success_at' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'verification_error_code' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'verification_error_message' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'verification_attempt_id' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'version' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'created_at' AS column_name
    UNION ALL SELECT 'ai_providers' AS table_name, 'updated_at' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'id' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'company_id' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'provider_id' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'model_id' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'name' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'model_type' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'status' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'description' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'context_window' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'catalog_context_window' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'capability_chat' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'capability_vision' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'capability_tool_calling' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'capabilities_checked_at' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'capability_error' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'version' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'created_at' AS column_name
    UNION ALL SELECT 'ai_models' AS table_name, 'updated_at' AS column_name
    UNION ALL SELECT 'ai_model_preferences' AS table_name, 'company_id' AS column_name
    UNION ALL SELECT 'ai_model_preferences' AS table_name, 'default_model_config_id' AS column_name
    UNION ALL SELECT 'ai_model_preferences' AS table_name, 'recommended_model_ids' AS column_name
    UNION ALL SELECT 'ai_model_preferences' AS table_name, 'version' AS column_name
    UNION ALL SELECT 'ai_model_preferences' AS table_name, 'updated_at' AS column_name
    UNION ALL SELECT 'ai_agents' AS table_name, 'id' AS column_name
    UNION ALL SELECT 'ai_agents' AS table_name, 'company_id' AS column_name
    UNION ALL SELECT 'ai_agents' AS table_name, 'merchant_id' AS column_name
    UNION ALL SELECT 'ai_agents' AS table_name, 'name' AS column_name
    UNION ALL SELECT 'ai_agents' AS table_name, 'description' AS column_name
    UNION ALL SELECT 'ai_agents' AS table_name, 'category' AS column_name
    UNION ALL SELECT 'ai_agents' AS table_name, 'status' AS column_name
    UNION ALL SELECT 'ai_agents' AS table_name, 'provider_id' AS column_name
    UNION ALL SELECT 'ai_agents' AS table_name, 'model_config_id' AS column_name
    UNION ALL SELECT 'ai_agents' AS table_name, 'temperature' AS column_name
    UNION ALL SELECT 'ai_agents' AS table_name, 'top_p' AS column_name
    UNION ALL SELECT 'ai_agents' AS table_name, 'max_tokens' AS column_name
    UNION ALL SELECT 'ai_agents' AS table_name, 'version' AS column_name
    UNION ALL SELECT 'ai_agents' AS table_name, 'created_at' AS column_name
    UNION ALL SELECT 'ai_agents' AS table_name, 'updated_at' AS column_name
    UNION ALL SELECT 'ai_agent_knowledge_bases' AS table_name, 'company_id' AS column_name
    UNION ALL SELECT 'ai_agent_knowledge_bases' AS table_name, 'agent_id' AS column_name
    UNION ALL SELECT 'ai_agent_knowledge_bases' AS table_name, 'knowledge_base_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_bases' AS table_name, 'id' AS column_name
    UNION ALL SELECT 'ai_knowledge_bases' AS table_name, 'company_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_bases' AS table_name, 'merchant_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_bases' AS table_name, 'name' AS column_name
    UNION ALL SELECT 'ai_knowledge_bases' AS table_name, 'description' AS column_name
    UNION ALL SELECT 'ai_knowledge_bases' AS table_name, 'category' AS column_name
    UNION ALL SELECT 'ai_knowledge_bases' AS table_name, 'kind' AS column_name
    UNION ALL SELECT 'ai_knowledge_bases' AS table_name, 'version' AS column_name
    UNION ALL SELECT 'ai_knowledge_bases' AS table_name, 'created_at' AS column_name
    UNION ALL SELECT 'ai_knowledge_bases' AS table_name, 'updated_at' AS column_name
    UNION ALL SELECT 'ai_knowledge_base_visibility' AS table_name, 'owner_company_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_base_visibility' AS table_name, 'knowledge_base_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_base_visibility' AS table_name, 'allowed_company_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'id' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'company_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'knowledge_base_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'title' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'kind' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'document_type' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'status' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'mode' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'chunk_count' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'size_bytes' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'uploaded_at' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'last_indexed_at' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'file_url' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'mime_type' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'assignment_mode' AS column_name
    UNION ALL SELECT 'ai_knowledge_documents' AS table_name, 'version' AS column_name
    UNION ALL SELECT 'ai_agent_document_overrides' AS table_name, 'company_id' AS column_name
    UNION ALL SELECT 'ai_agent_document_overrides' AS table_name, 'document_id' AS column_name
    UNION ALL SELECT 'ai_agent_document_overrides' AS table_name, 'agent_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_templates' AS table_name, 'id' AS column_name
    UNION ALL SELECT 'ai_knowledge_templates' AS table_name, 'owner_company_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_templates' AS table_name, 'name' AS column_name
    UNION ALL SELECT 'ai_knowledge_templates' AS table_name, 'description' AS column_name
    UNION ALL SELECT 'ai_knowledge_templates' AS table_name, 'category' AS column_name
    UNION ALL SELECT 'ai_knowledge_templates' AS table_name, 'kind' AS column_name
    UNION ALL SELECT 'ai_knowledge_templates' AS table_name, 'documents' AS column_name
    UNION ALL SELECT 'ai_knowledge_templates' AS table_name, 'skills' AS column_name
    UNION ALL SELECT 'ai_knowledge_templates' AS table_name, 'data_sources' AS column_name
    UNION ALL SELECT 'ai_knowledge_templates' AS table_name, 'version' AS column_name
    UNION ALL SELECT 'ai_knowledge_templates' AS table_name, 'created_at' AS column_name
    UNION ALL SELECT 'ai_knowledge_templates' AS table_name, 'updated_at' AS column_name
    UNION ALL SELECT 'ai_knowledge_template_visibility' AS table_name, 'owner_company_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_template_visibility' AS table_name, 'template_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_template_visibility' AS table_name, 'allowed_company_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_skills' AS table_name, 'id' AS column_name
    UNION ALL SELECT 'ai_knowledge_skills' AS table_name, 'company_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_skills' AS table_name, 'knowledge_base_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_skills' AS table_name, 'name' AS column_name
    UNION ALL SELECT 'ai_knowledge_skills' AS table_name, 'description' AS column_name
    UNION ALL SELECT 'ai_knowledge_skills' AS table_name, 'input_schema' AS column_name
    UNION ALL SELECT 'ai_knowledge_skills' AS table_name, 'status' AS column_name
    UNION ALL SELECT 'ai_knowledge_skills' AS table_name, 'mode' AS column_name
    UNION ALL SELECT 'ai_knowledge_skills' AS table_name, 'version' AS column_name
    UNION ALL SELECT 'ai_knowledge_skills' AS table_name, 'updated_at' AS column_name
    UNION ALL SELECT 'ai_knowledge_data_sources' AS table_name, 'id' AS column_name
    UNION ALL SELECT 'ai_knowledge_data_sources' AS table_name, 'company_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_data_sources' AS table_name, 'knowledge_base_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_data_sources' AS table_name, 'name' AS column_name
    UNION ALL SELECT 'ai_knowledge_data_sources' AS table_name, 'kind' AS column_name
    UNION ALL SELECT 'ai_knowledge_data_sources' AS table_name, 'config' AS column_name
    UNION ALL SELECT 'ai_knowledge_data_sources' AS table_name, 'status' AS column_name
    UNION ALL SELECT 'ai_knowledge_data_sources' AS table_name, 'mode' AS column_name
    UNION ALL SELECT 'ai_knowledge_data_sources' AS table_name, 'last_synced_at' AS column_name
    UNION ALL SELECT 'ai_knowledge_data_sources' AS table_name, 'version' AS column_name
    UNION ALL SELECT 'ai_knowledge_files' AS table_name, 'id' AS column_name
    UNION ALL SELECT 'ai_knowledge_files' AS table_name, 'company_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_files' AS table_name, 'document_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_files' AS table_name, 'template_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_files' AS table_name, 'skill_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_files' AS table_name, 'data_source_id' AS column_name
    UNION ALL SELECT 'ai_knowledge_files' AS table_name, 'name' AS column_name
    UNION ALL SELECT 'ai_knowledge_files' AS table_name, 'mime_type' AS column_name
    UNION ALL SELECT 'ai_knowledge_files' AS table_name, 'content' AS column_name
    UNION ALL SELECT 'ai_knowledge_files' AS table_name, 'created_at' AS column_name
)
SELECT e.table_name, e.column_name AS missing_column
FROM expected e LEFT JOIN information_schema.columns c
 ON c.table_schema = 'aiosnova' AND c.table_name=e.table_name AND c.column_name=e.column_name
WHERE c.column_name IS NULL ORDER BY e.table_name, e.column_name;
-- Detailed field metadata; compare against 02_create_ai_tables.sql.
SELECT table_name, ordinal_position, column_name, column_type, is_nullable,
 column_default, extra, character_set_name, collation_name
FROM information_schema.columns WHERE table_schema='aiosnova'
 AND table_name IN ('ai_providers',
    'ai_models',
    'ai_model_preferences',
    'ai_agents',
    'ai_agent_knowledge_bases',
    'ai_knowledge_bases',
    'ai_knowledge_base_visibility',
    'ai_knowledge_documents',
    'ai_agent_document_overrides',
    'ai_knowledge_templates',
    'ai_knowledge_template_visibility',
    'ai_knowledge_skills',
    'ai_knowledge_data_sources',
    'ai_knowledge_files') ORDER BY table_name, ordinal_position;
-- Includes explicit and automatically generated foreign-key indexes.
SELECT table_name, index_name, non_unique, seq_in_index, column_name, sub_part
FROM information_schema.statistics WHERE table_schema='aiosnova'
 AND table_name IN ('ai_providers',
    'ai_models',
    'ai_model_preferences',
    'ai_agents',
    'ai_agent_knowledge_bases',
    'ai_knowledge_bases',
    'ai_knowledge_base_visibility',
    'ai_knowledge_documents',
    'ai_agent_document_overrides',
    'ai_knowledge_templates',
    'ai_knowledge_template_visibility',
    'ai_knowledge_skills',
    'ai_knowledge_data_sources',
    'ai_knowledge_files') ORDER BY table_name, index_name, seq_in_index;
SELECT table_name, constraint_name, referenced_table_name, update_rule, delete_rule
FROM information_schema.referential_constraints WHERE constraint_schema='aiosnova'
 AND table_name IN ('ai_providers',
    'ai_models',
    'ai_model_preferences',
    'ai_agents',
    'ai_agent_knowledge_bases',
    'ai_knowledge_bases',
    'ai_knowledge_base_visibility',
    'ai_knowledge_documents',
    'ai_agent_document_overrides',
    'ai_knowledge_templates',
    'ai_knowledge_template_visibility',
    'ai_knowledge_skills',
    'ai_knowledge_data_sources',
    'ai_knowledge_files') ORDER BY table_name, constraint_name;
SELECT tc.table_name, tc.constraint_name, tc.enforced, cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
 ON cc.constraint_schema=tc.constraint_schema AND cc.constraint_name=tc.constraint_name
WHERE tc.constraint_schema='aiosnova' AND tc.constraint_type='CHECK'
 AND tc.table_name IN ('ai_providers',
    'ai_models',
    'ai_model_preferences',
    'ai_agents',
    'ai_agent_knowledge_bases',
    'ai_knowledge_bases',
    'ai_knowledge_base_visibility',
    'ai_knowledge_documents',
    'ai_agent_document_overrides',
    'ai_knowledge_templates',
    'ai_knowledge_template_visibility',
    'ai_knowledge_skills',
    'ai_knowledge_data_sources',
    'ai_knowledge_files') ORDER BY tc.table_name, tc.constraint_name;
-- Exact row counts: expected 0 before any application writes.
SELECT 'ai_providers' AS table_name, COUNT(*) AS row_count FROM aiosnova.ai_providers
UNION ALL
SELECT 'ai_models' AS table_name, COUNT(*) AS row_count FROM aiosnova.ai_models
UNION ALL
SELECT 'ai_model_preferences' AS table_name, COUNT(*) AS row_count FROM aiosnova.ai_model_preferences
UNION ALL
SELECT 'ai_agents' AS table_name, COUNT(*) AS row_count FROM aiosnova.ai_agents
UNION ALL
SELECT 'ai_agent_knowledge_bases' AS table_name, COUNT(*) AS row_count FROM aiosnova.ai_agent_knowledge_bases
UNION ALL
SELECT 'ai_knowledge_bases' AS table_name, COUNT(*) AS row_count FROM aiosnova.ai_knowledge_bases
UNION ALL
SELECT 'ai_knowledge_base_visibility' AS table_name, COUNT(*) AS row_count FROM aiosnova.ai_knowledge_base_visibility
UNION ALL
SELECT 'ai_knowledge_documents' AS table_name, COUNT(*) AS row_count FROM aiosnova.ai_knowledge_documents
UNION ALL
SELECT 'ai_agent_document_overrides' AS table_name, COUNT(*) AS row_count FROM aiosnova.ai_agent_document_overrides
UNION ALL
SELECT 'ai_knowledge_templates' AS table_name, COUNT(*) AS row_count FROM aiosnova.ai_knowledge_templates
UNION ALL
SELECT 'ai_knowledge_template_visibility' AS table_name, COUNT(*) AS row_count FROM aiosnova.ai_knowledge_template_visibility
UNION ALL
SELECT 'ai_knowledge_skills' AS table_name, COUNT(*) AS row_count FROM aiosnova.ai_knowledge_skills
UNION ALL
SELECT 'ai_knowledge_data_sources' AS table_name, COUNT(*) AS row_count FROM aiosnova.ai_knowledge_data_sources
UNION ALL
SELECT 'ai_knowledge_files' AS table_name, COUNT(*) AS row_count FROM aiosnova.ai_knowledge_files;
-- Canonical definitions for full review (fields, indexes, CHECKs, foreign keys).
SHOW CREATE TABLE aiosnova.ai_providers;
SHOW CREATE TABLE aiosnova.ai_models;
SHOW CREATE TABLE aiosnova.ai_model_preferences;
SHOW CREATE TABLE aiosnova.ai_agents;
SHOW CREATE TABLE aiosnova.ai_agent_knowledge_bases;
SHOW CREATE TABLE aiosnova.ai_knowledge_bases;
SHOW CREATE TABLE aiosnova.ai_knowledge_base_visibility;
SHOW CREATE TABLE aiosnova.ai_knowledge_documents;
SHOW CREATE TABLE aiosnova.ai_agent_document_overrides;
SHOW CREATE TABLE aiosnova.ai_knowledge_templates;
SHOW CREATE TABLE aiosnova.ai_knowledge_template_visibility;
SHOW CREATE TABLE aiosnova.ai_knowledge_skills;
SHOW CREATE TABLE aiosnova.ai_knowledge_data_sources;
SHOW CREATE TABLE aiosnova.ai_knowledge_files;
