-- Apply once after V4. Record IDs and relationships are preserved.
ALTER TABLE organization_departments
  DROP INDEX uq_org_departments_code,
  DROP COLUMN code;

ALTER TABLE organization_positions
  DROP INDEX uq_org_positions_code,
  DROP COLUMN code;
