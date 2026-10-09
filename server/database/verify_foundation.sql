-- Read-only verification: execute after V1 in Workbench.
USE aiosnova;
SELECT DATABASE() AS selected_database, VERSION() AS mysql_version;

-- Expect 10 matching base tables.
SELECT COUNT(*) AS foundation_table_count
FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
  AND table_name IN ('users', 'merchants', 'companies', 'company_memberships', 'invitations', 'invitation_company_assignments', 'otp_challenges', 'user_mfa_methods', 'auth_sessions', 'audit_logs');

-- Expect zero rows (no missing tables).
WITH expected_tables AS (
  SELECT 'users' AS table_name
  UNION ALL SELECT 'merchants' AS table_name
  UNION ALL SELECT 'companies' AS table_name
  UNION ALL SELECT 'company_memberships' AS table_name
  UNION ALL SELECT 'invitations' AS table_name
  UNION ALL SELECT 'invitation_company_assignments' AS table_name
  UNION ALL SELECT 'otp_challenges' AS table_name
  UNION ALL SELECT 'user_mfa_methods' AS table_name
  UNION ALL SELECT 'auth_sessions' AS table_name
  UNION ALL SELECT 'audit_logs' AS table_name
)
SELECT e.table_name AS missing_table
FROM expected_tables e
LEFT JOIN information_schema.tables t ON t.table_schema=DATABASE() AND t.table_name=e.table_name
WHERE t.table_name IS NULL;

SELECT table_name, constraint_name, constraint_type, enforced
FROM information_schema.table_constraints
WHERE constraint_schema=DATABASE()
  AND table_name IN ('users', 'merchants', 'companies', 'company_memberships', 'invitations', 'invitation_company_assignments', 'otp_challenges', 'user_mfa_methods', 'auth_sessions', 'audit_logs')
ORDER BY table_name, constraint_type, constraint_name;

SHOW CREATE TABLE company_memberships;
SHOW CREATE TABLE invitation_company_assignments;

