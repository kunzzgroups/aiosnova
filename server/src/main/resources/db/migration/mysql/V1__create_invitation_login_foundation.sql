-- AIOS Nova V1: invitation/login foundation, Oracle MySQL 8.4.
-- Select aiosnova as the default schema in Workbench before running this file ONCE.
-- Empty schema only. No credentials, grants, demo accounts or destructive statements.
-- MySQL DDL implicitly commits. Stop on error and inspect before retrying.
-- Application supplies canonical UUIDs; normalize emails with trim/lowercase.
-- All DATETIME(6) values are UTC: runtime connections must use UTC sessions.
-- MySQL explicitly requested by user; project standards otherwise specify PostgreSQL.
-- Groups, departments, positions and business permissions are deferred to later migrations.
-- Schema structure does not implement authentication, invitation delivery or authorization.

CREATE TABLE users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  full_name VARCHAR(200) NULL,
  display_name VARCHAR(200) NULL,
  phone VARCHAR(32) NULL,
  avatar_url VARCHAR(2048) NULL,
  language VARCHAR(16) NOT NULL DEFAULT 'en',
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  status VARCHAR(24) NOT NULL DEFAULT 'invited',
  email_verified_at DATETIME(6) NULL,
  last_active_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT ck_users_status CHECK (status IN ('invited','active','disabled')),
  CONSTRAINT ck_users_email CHECK (CHAR_LENGTH(TRIM(email)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

CREATE TABLE merchants (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  owner_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_merchants_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_merchants_status CHECK (status IN ('pending','active','disabled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

CREATE TABLE companies (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  require_mfa BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_companies_scope (merchant_id,id),
  UNIQUE KEY uq_companies_code (merchant_id,code),
  CONSTRAINT fk_companies_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_companies_status CHECK (status IN ('active','inactive')),
  CONSTRAINT ck_companies_mfa CHECK (require_mfa IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

CREATE TABLE company_memberships (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  joined_at DATETIME(6) NOT NULL,
  ended_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_memberships_user_company (user_id,company_id),
  KEY ix_memberships_switcher (merchant_id,user_id,status),
  KEY ix_memberships_employees (merchant_id,company_id,status),
  CONSTRAINT fk_memberships_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_memberships_company FOREIGN KEY (merchant_id,company_id) REFERENCES companies(merchant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_memberships_status CHECK (status IN ('active','ended')),
  CONSTRAINT ck_memberships_dates CHECK (ended_at IS NULL OR ended_at >= joined_at),
  CONSTRAINT ck_memberships_ended CHECK ((status='active' AND ended_at IS NULL) OR (status='ended' AND ended_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

CREATE TABLE invitations (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  invited_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  platform_actor_ref VARCHAR(200) NULL,
  invitation_type VARCHAR(16) NOT NULL,
  email VARCHAR(254) NOT NULL,
  full_name VARCHAR(200) NULL,
  phone VARCHAR(32) NULL,
  language VARCHAR(16) NOT NULL DEFAULT 'en',
  personal_message TEXT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  sent_at DATETIME(6) NULL,
  expires_at DATETIME(6) NULL,
  accepted_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_invitations_scope (merchant_id,id),
  KEY ix_invitations_recipient (merchant_id,email,status),
  CONSTRAINT fk_invitations_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_invitations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_invitations_inviter FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_invitations_type CHECK (invitation_type IN ('owner','employee')),
  CONSTRAINT ck_invitations_actor CHECK ((invitation_type='owner' AND invited_by IS NULL AND platform_actor_ref IS NOT NULL) OR (invitation_type='employee' AND invited_by IS NOT NULL AND platform_actor_ref IS NULL)),
  CONSTRAINT ck_invitations_status CHECK (status IN ('draft','pending','sent','accepted','expired','revoked')),
  CONSTRAINT ck_invitations_email CHECK (CHAR_LENGTH(TRIM(email)) > 0),
  CONSTRAINT ck_invitations_sent CHECK (status <> 'sent' OR (token_hash IS NOT NULL AND sent_at IS NOT NULL AND expires_at IS NOT NULL)),
  CONSTRAINT ck_invitations_dates CHECK (expires_at IS NULL OR sent_at IS NULL OR expires_at > sent_at),
  CONSTRAINT ck_invitations_accepted CHECK (status <> 'accepted' OR (accepted_at IS NOT NULL AND user_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

CREATE TABLE invitation_company_assignments (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  invitation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_invitation_company (invitation_id,company_id),
  CONSTRAINT fk_assignments_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_assignments_invitation FOREIGN KEY (merchant_id,invitation_id) REFERENCES invitations(merchant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_assignments_company FOREIGN KEY (merchant_id,company_id) REFERENCES companies(merchant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

CREATE TABLE otp_challenges (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  code_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  attempt_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  consumed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  KEY ix_otp_user (user_id,created_at),
  KEY ix_otp_cleanup (expires_at),
  CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_otp_attempts CHECK (max_attempts > 0 AND attempt_count <= max_attempts),
  CONSTRAINT ck_otp_expiry CHECK (expires_at > created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

CREATE TABLE user_mfa_methods (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  encrypted_secret VARBINARY(2048) NOT NULL,
  encryption_key_ref VARCHAR(128) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  verified_at DATETIME(6) NULL,
  last_used_at DATETIME(6) NULL,
  last_accepted_time_step BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  KEY ix_mfa_user (user_id,status),
  CONSTRAINT fk_mfa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_mfa_status CHECK (status IN ('pending','active','revoked')),
  CONSTRAINT ck_mfa_verified CHECK (status <> 'active' OR verified_at IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

CREATE TABLE auth_sessions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  status VARCHAR(24) NOT NULL DEFAULT 'restricted',
  otp_verified_at DATETIME(6) NOT NULL,
  mfa_verified_at DATETIME(6) NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  KEY ix_sessions_user (user_id,status),
  KEY ix_sessions_cleanup (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_sessions_status CHECK (status IN ('restricted','active','revoked')),
  CONSTRAINT ck_sessions_expiry CHECK (expires_at > created_at),
  CONSTRAINT ck_sessions_revoked CHECK ((status='revoked' AND revoked_at IS NOT NULL) OR (status <> 'revoked' AND revoked_at IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

CREATE TABLE audit_logs (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  platform_actor_ref VARCHAR(200) NULL,
  company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  changes JSON NULL,
  result VARCHAR(16) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY ix_audit_timeline (merchant_id,created_at,id),
  KEY ix_audit_company (merchant_id,company_id,created_at),
  CONSTRAINT fk_audit_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_audit_company FOREIGN KEY (merchant_id,company_id) REFERENCES companies(merchant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_audit_result CHECK (result IN ('success','failure'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;
