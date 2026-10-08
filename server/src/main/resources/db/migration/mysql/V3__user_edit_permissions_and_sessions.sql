-- Apply once after V2. Existing MFA challenge rows remain restricted/revoked.
ALTER TABLE auth_sessions
    ADD COLUMN merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD COLUMN csrf_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD CONSTRAINT fk_sessions_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id);

CREATE TABLE user_permission_grants (
    merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    permission_code VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (merchant_id, user_id, permission_code),
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE user_directory_settings (
    merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    department_ref VARCHAR(100) NOT NULL DEFAULT '',
    position_ref VARCHAR(100) NOT NULL DEFAULT '',
    require_mfa BOOLEAN NOT NULL DEFAULT FALSE,
    can_invite BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (merchant_id, user_id),
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
