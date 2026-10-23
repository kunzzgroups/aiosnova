-- AI database only. Run once using a schema-administration account.
USE aiosnova_ai_local;

CREATE TABLE ai_model_preferences (
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    default_model_config_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    recommended_model_ids JSON NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (company_id)
) ENGINE = InnoDB;

-- Deliberately retain unavailable references so a missing default is reported,
-- rather than silently switching to a different account or paid model.
GRANT SELECT, INSERT, UPDATE, DELETE
ON aiosnova_ai_local.ai_model_preferences TO 'ai_app'@'127.0.0.1';
