-- Apply once after V6. Saved child statuses and existing assignments remain unchanged.
DELIMITER $$
CREATE TRIGGER guard_org_assignment_insert BEFORE INSERT ON organization_position_assignments
FOR EACH ROW
BEGIN
  DECLARE locked_company CHAR(36);
  DECLARE inactive_ancestors INT DEFAULT 0;
  IF NEW.status = 'active' THEN
  SELECT id INTO locked_company FROM companies
    WHERE merchant_id = NEW.merchant_id AND id = NEW.company_id FOR UPDATE;
  WITH RECURSIVE ancestors AS (
    SELECT d.id, d.parent_id, d.status
    FROM organization_departments d JOIN organization_positions p
      ON p.merchant_id = d.merchant_id AND p.company_id = d.company_id AND p.department_id = d.id
    WHERE p.merchant_id = NEW.merchant_id AND p.company_id = NEW.company_id AND p.id = NEW.position_id
    UNION DISTINCT
    SELECT parent.id, parent.parent_id, parent.status
    FROM organization_departments parent JOIN ancestors child ON parent.id = child.parent_id
    WHERE parent.merchant_id = NEW.merchant_id AND parent.company_id = NEW.company_id
  ) SELECT COUNT(*) INTO inactive_ancestors FROM ancestors WHERE status = 'inactive';
  IF inactive_ancestors > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Assignments require an active department and active ancestors.';
  END IF;
  END IF;
END$$
CREATE TRIGGER guard_org_assignment_update BEFORE UPDATE ON organization_position_assignments
FOR EACH ROW
BEGIN
  DECLARE locked_company CHAR(36);
  DECLARE inactive_ancestors INT DEFAULT 0;
  IF NEW.status = 'active' AND (OLD.status <> 'active' OR NEW.position_id <> OLD.position_id
      OR NEW.membership_id <> OLD.membership_id OR NEW.company_id <> OLD.company_id OR NEW.merchant_id <> OLD.merchant_id) THEN
  SELECT id INTO locked_company FROM companies
    WHERE merchant_id = NEW.merchant_id AND id = NEW.company_id FOR UPDATE;
  WITH RECURSIVE ancestors AS (
    SELECT d.id, d.parent_id, d.status
    FROM organization_departments d JOIN organization_positions p
      ON p.merchant_id = d.merchant_id AND p.company_id = d.company_id AND p.department_id = d.id
    WHERE p.merchant_id = NEW.merchant_id AND p.company_id = NEW.company_id AND p.id = NEW.position_id
    UNION DISTINCT
    SELECT parent.id, parent.parent_id, parent.status
    FROM organization_departments parent JOIN ancestors child ON parent.id = child.parent_id
    WHERE parent.merchant_id = NEW.merchant_id AND parent.company_id = NEW.company_id
  ) SELECT COUNT(*) INTO inactive_ancestors FROM ancestors WHERE status = 'inactive';
  IF inactive_ancestors > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Assignments require an active department and active ancestors.';
  END IF;
  END IF;
END$$
DELIMITER ;
