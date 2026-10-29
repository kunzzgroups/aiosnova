ALTER TABLE audit_logs
    ADD COLUMN scope_kind VARCHAR(16)
        CHARACTER SET ascii
        COLLATE ascii_bin
        NOT NULL
        AFTER company_id,

    ADD CONSTRAINT ck_audit_scope_kind
        CHECK (scope_kind IN ('merchant', 'company')),

    ADD CONSTRAINT ck_audit_scope_company
        CHECK (
            (scope_kind = 'merchant' AND company_id IS NULL)
            OR
            (scope_kind = 'company' AND company_id IS NOT NULL)
        );