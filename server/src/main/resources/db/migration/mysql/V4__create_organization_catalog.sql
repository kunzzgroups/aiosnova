-- MySQL 8.4 organization catalogs and position assignments.
-- Apply once after V1-V3; no data backfill.

CREATE TABLE organization_departments (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  parent_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  executive_position_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  updated_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_org_departments_scope (merchant_id,company_id,id),
  UNIQUE KEY uq_org_departments_code (merchant_id,company_id,code),
  KEY ix_org_departments_tree (merchant_id,company_id,parent_id,sort_order,id),
  KEY ix_org_departments_executive (merchant_id,company_id,executive_position_id),
  CONSTRAINT fk_org_departments_company FOREIGN KEY (merchant_id,company_id) REFERENCES companies(merchant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_org_departments_parent FOREIGN KEY (merchant_id,company_id,parent_id) REFERENCES organization_departments(merchant_id,company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_org_departments_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_org_departments_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_org_departments_status CHECK (status IN ('active','inactive')),
  CONSTRAINT ck_org_departments_parent CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT ck_org_departments_management CHECK (parent_id IS NULL OR executive_position_id IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

CREATE TABLE organization_positions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  department_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  level VARCHAR(24) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  updated_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_org_positions_scope (merchant_id,company_id,id),
  UNIQUE KEY uq_org_positions_code (merchant_id,company_id,code),
  KEY ix_org_positions_department (merchant_id,company_id,department_id),
  KEY ix_org_positions_directory (merchant_id,company_id,status,level,name,id),
  CONSTRAINT fk_org_positions_company FOREIGN KEY (merchant_id,company_id) REFERENCES companies(merchant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_org_positions_department FOREIGN KEY (merchant_id,company_id,department_id) REFERENCES organization_departments(merchant_id,company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_org_positions_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_org_positions_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_org_positions_status CHECK (status IN ('active','inactive')),
  CONSTRAINT ck_org_positions_placement CHECK (
    (department_id IS NULL AND level = 'executive') OR
    (department_id IS NOT NULL AND level IN ('manager','staff'))
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

ALTER TABLE organization_departments
  ADD CONSTRAINT fk_org_departments_executive FOREIGN KEY (merchant_id,company_id,executive_position_id)
    REFERENCES organization_positions(merchant_id,company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE company_memberships
  ADD UNIQUE KEY uq_memberships_org_scope (merchant_id,company_id,id);

CREATE TABLE organization_position_assignments (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  membership_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  position_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  valid_from DATE NOT NULL,
  valid_to DATE NULL,
  created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  updated_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_org_assignments_start (merchant_id,company_id,membership_id,position_id,valid_from),
  KEY ix_org_assignments_membership (merchant_id,company_id,membership_id,status),
  KEY ix_org_assignments_count (merchant_id,company_id,position_id,status,valid_from,valid_to),
  CONSTRAINT fk_org_assignments_membership FOREIGN KEY (merchant_id,company_id,membership_id) REFERENCES company_memberships(merchant_id,company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_org_assignments_position FOREIGN KEY (merchant_id,company_id,position_id) REFERENCES organization_positions(merchant_id,company_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_org_assignments_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_org_assignments_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_org_assignments_status CHECK (status IN ('active','ended')),
  CONSTRAINT ck_org_assignments_dates CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT ck_org_assignments_ended CHECK (status <> 'ended' OR valid_to IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

