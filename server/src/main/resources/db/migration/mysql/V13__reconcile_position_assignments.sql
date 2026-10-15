-- Apply after V12 with application writes stopped. No assignment history is backdated.
START TRANSACTION;

CREATE TEMPORARY TABLE missing_position_assignments AS
SELECT COALESCE(today.id, UUID()) AS id, pl.merchant_id, pl.company_id,
       m.id AS membership_id, pl.position_id, merchant.owner_user_id AS actor_id
FROM company_employee_placements pl
JOIN merchants merchant ON merchant.id = pl.merchant_id
JOIN users u ON u.id = pl.user_id AND u.status IN ('active', 'disabled')
LEFT JOIN user_directory_settings settings
  ON settings.merchant_id = pl.merchant_id AND settings.user_id = pl.user_id
JOIN company_memberships m
  ON m.merchant_id = pl.merchant_id AND m.company_id = pl.company_id AND m.user_id = pl.user_id
JOIN organization_positions p
  ON p.merchant_id = pl.merchant_id AND p.company_id = pl.company_id
 AND p.id = pl.position_id AND p.department_id = pl.department_id
JOIN organization_departments d
  ON d.merchant_id = pl.merchant_id AND d.company_id = pl.company_id AND d.id = pl.department_id
LEFT JOIN organization_position_assignments today
  ON today.merchant_id = pl.merchant_id AND today.company_id = pl.company_id
 AND today.membership_id = m.id AND today.position_id = pl.position_id AND today.valid_from = UTC_DATE()
WHERE settings.deleted_at IS NULL AND p.deleted_at IS NULL AND d.deleted_at IS NULL
  AND m.status = 'active' AND m.joined_at <= UTC_TIMESTAMP(6)
  AND (m.ended_at IS NULL OR m.ended_at > UTC_TIMESTAMP(6))
  AND NOT EXISTS (
      SELECT 1 FROM organization_position_assignments current_assignment
      WHERE current_assignment.merchant_id = pl.merchant_id AND current_assignment.company_id = pl.company_id
        AND current_assignment.membership_id = m.id AND current_assignment.position_id = pl.position_id
        AND current_assignment.status = 'active' AND current_assignment.valid_from <= UTC_DATE()
        AND (current_assignment.valid_to IS NULL OR current_assignment.valid_to >= UTC_DATE())
  );

INSERT INTO organization_position_assignments
    (id, merchant_id, company_id, membership_id, position_id, valid_from, created_by, updated_by)
SELECT id, merchant_id, company_id, membership_id, position_id, UTC_DATE(), actor_id, actor_id
FROM missing_position_assignments
ON DUPLICATE KEY UPDATE status = 'active', valid_to = NULL, updated_by = VALUES(updated_by), version = version + 1;

INSERT INTO audit_logs (id, merchant_id, actor_user_id, action, resource_type, resource_id, changes, result)
SELECT UUID(), merchant_id, actor_id, 'identity.position_assignment.reconciled', 'position_assignment', id,
       JSON_OBJECT('source', 'V13', 'companyId', company_id, 'positionId', position_id,
                   'membershipId', membership_id, 'validFrom', UTC_DATE()), 'success'
FROM missing_position_assignments;

DROP TEMPORARY TABLE missing_position_assignments;
COMMIT;
