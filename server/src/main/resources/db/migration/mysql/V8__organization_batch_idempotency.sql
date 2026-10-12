-- Apply after V6; V7's optional trigger guards are not a prerequisite.
CREATE TABLE organization_batch_requests (
  merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  department_ids JSON NOT NULL,
  position_ids JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (merchant_id,company_id,actor_user_id,request_id),
  CONSTRAINT fk_org_batch_company FOREIGN KEY (merchant_id,company_id) REFERENCES companies(merchant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_org_batch_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;
