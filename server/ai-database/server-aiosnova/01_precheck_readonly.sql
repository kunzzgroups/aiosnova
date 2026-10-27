-- Prepared for shared MySQL 8.4 database aiosnova. NOT executed by preparation.
-- READ ONLY. Expected: database aiosnova, MySQL 8.4, all 14 ABSENT.
SELECT DATABASE() AS current_database, CURRENT_USER() AS account,
       @@hostname AS server_host, @@port AS server_port, VERSION() AS mysql_version;
SHOW GRANTS FOR CURRENT_USER();
SELECT schema_name, default_character_set_name, default_collation_name
FROM information_schema.schemata WHERE schema_name = 'aiosnova';
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
SELECT e.table_name, CASE WHEN t.table_name IS NULL THEN 'ABSENT' ELSE 'STOP_EXISTS' END AS result,
       t.table_type, t.engine
FROM expected e LEFT JOIN information_schema.tables t
 ON t.table_schema = 'aiosnova' AND t.table_name = e.table_name
ORDER BY e.table_name;
-- Existing constraint names would collide even when tables have other names.
-- Expected: zero rows.
SELECT table_name, constraint_name
FROM information_schema.table_constraints
WHERE constraint_schema = 'aiosnova'
 AND constraint_name IN ('ck_ai_provider_enabled', 'ck_ai_provider_key_pair', 'ck_ai_provider_verification_status', 'fk_ai_model_provider', 'ck_ai_model_type', 'ck_ai_model_status', 'ck_ai_model_context', 'ck_ai_model_chat', 'ck_ai_model_vision', 'ck_ai_model_tools', 'ck_ai_model_catalog_context', 'ck_ai_agent_status', 'ck_ai_agent_binding', 'ck_ai_agent_temperature', 'ck_ai_agent_top_p', 'ck_ai_agent_max_tokens', 'fk_ai_agent_base_agent', 'ck_ai_knowledge_kind', 'fk_ai_knowledge_visibility_base', 'fk_ai_knowledge_document_base', 'ck_ai_knowledge_document_kind', 'ck_ai_knowledge_document_type', 'ck_ai_knowledge_document_status', 'ck_ai_knowledge_document_mode', 'ck_ai_knowledge_assignment_mode', 'fk_ai_override_document', 'fk_ai_override_agent', 'ck_ai_template_kind', 'ck_ai_template_documents', 'ck_ai_template_skills', 'ck_ai_template_sources', 'fk_ai_template_visibility', 'fk_ai_skill_base', 'ck_ai_skill_status', 'ck_ai_skill_mode', 'ck_ai_skill_schema', 'fk_ai_data_source_base', 'ck_ai_data_source_kind', 'ck_ai_data_source_status', 'ck_ai_data_source_mode', 'ck_ai_data_source_config', 'fk_ai_file_document', 'fk_ai_file_template', 'fk_ai_file_skill', 'fk_ai_file_data_source', 'ck_ai_file_parent');
-- Inventory only: keep this output for comparison after deployment.
SELECT table_name, table_type, engine, table_collation
FROM information_schema.tables
WHERE table_schema = 'aiosnova' ORDER BY table_name;
