-- Apply once after V8. Existing user-management grants are not copied.
CREATE TABLE company_user_permission_grants (
    merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    permission_code VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (merchant_id, company_id, user_id, permission_code),
    CONSTRAINT fk_company_grants_company FOREIGN KEY (merchant_id, company_id) REFERENCES companies(merchant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_company_grants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
