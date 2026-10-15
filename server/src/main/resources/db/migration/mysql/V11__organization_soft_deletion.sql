-- Apply once after V10. Existing catalog and employee history are preserved.
ALTER TABLE organization_departments
    ADD COLUMN deleted_at DATETIME(6) NULL,
    ADD COLUMN deleted_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD CONSTRAINT fk_org_departments_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE organization_positions
    ADD COLUMN deleted_at DATETIME(6) NULL,
    ADD COLUMN deleted_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD CONSTRAINT fk_org_positions_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id);
