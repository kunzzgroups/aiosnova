-- Apply once after V11. Placement is independent of company access.
CREATE TABLE company_employee_placements (
    merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    department_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    position_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (merchant_id, company_id, user_id),
    FOREIGN KEY (merchant_id, company_id) REFERENCES companies(merchant_id, id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (merchant_id, company_id, department_id) REFERENCES organization_departments(merchant_id, company_id, id),
    FOREIGN KEY (merchant_id, company_id, position_id) REFERENCES organization_positions(merchant_id, company_id, id)
) ENGINE=InnoDB;

INSERT INTO company_employee_placements (merchant_id, company_id, user_id, department_id, position_id)
SELECT s.merchant_id, d.company_id, s.user_id, d.id, p.id
FROM user_directory_settings s
JOIN organization_departments d ON d.merchant_id = s.merchant_id AND d.id = s.department_ref
LEFT JOIN organization_positions p ON p.merchant_id = d.merchant_id AND p.company_id = d.company_id
    AND p.department_id = d.id AND p.id = s.position_ref
WHERE s.deleted_at IS NULL;
