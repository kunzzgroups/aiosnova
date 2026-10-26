-- Run once against the local AI database.
-- No credentials or application records are inserted.

USE aiosnova_ai_local;

ALTER TABLE ai_providers
    ADD COLUMN connection_revision
        BIGINT UNSIGNED NOT NULL DEFAULT 0,

    ADD COLUMN verification_status
        VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin
        NOT NULL DEFAULT 'not_verified',

    ADD COLUMN verification_revision
        BIGINT UNSIGNED NULL,

    ADD COLUMN verification_model_id
        VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NULL,

    ADD COLUMN verification_checked_at
        DATETIME(6) NULL,

    ADD COLUMN verification_last_success_at
        DATETIME(6) NULL,

    ADD COLUMN verification_error_code
        VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,

    ADD COLUMN verification_error_message
        VARCHAR(512) NULL,

    ADD COLUMN verification_attempt_id
        CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,

    ADD CONSTRAINT ck_ai_provider_verification_status
        CHECK (
            verification_status IN (
                'not_verified',
                'verified',
                'failed'
            )
        );