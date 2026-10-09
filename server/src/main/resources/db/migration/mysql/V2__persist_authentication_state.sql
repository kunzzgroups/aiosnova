-- Apply once after the manually installed V1; do not rerun V1 or seed data.
ALTER TABLE invitations ADD COLUMN require_mfa BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_mfa_methods
  ADD COLUMN invitation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN attempt_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ADD CONSTRAINT fk_mfa_invitation FOREIGN KEY (invitation_id) REFERENCES invitations(id),
  ADD CONSTRAINT ck_mfa_attempts CHECK (attempt_count <= 5),
  ADD UNIQUE KEY uq_mfa_invitation (invitation_id);

ALTER TABLE auth_sessions
  ADD COLUMN attempt_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ADD CONSTRAINT ck_session_attempts CHECK (attempt_count <= 5);

CREATE TABLE otp_rate_limits (
  bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  resets_at DATETIME(6) NOT NULL,
  request_count INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;
