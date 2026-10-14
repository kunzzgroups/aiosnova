-- Apply once after V9. Retains account, membership, assignment and audit history.
ALTER TABLE user_directory_settings
    ADD COLUMN deleted_at DATETIME(6) NULL,
    ADD COLUMN deleted_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD CONSTRAINT fk_directory_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id);
