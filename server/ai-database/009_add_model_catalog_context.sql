USE aiosnova_ai_local;

ALTER TABLE ai_models
    ADD COLUMN catalog_context_window INT NULL
        AFTER context_window,
    ADD CONSTRAINT ck_ai_model_catalog_context
        CHECK (
            catalog_context_window IS NULL
            OR catalog_context_window > 0
        );

SHOW COLUMNS
FROM ai_models
LIKE '%context_window';