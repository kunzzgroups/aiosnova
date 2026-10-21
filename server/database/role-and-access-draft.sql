CREATE TABLE role (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR (24) NOT NULL DEFAULT 'enabled',
    created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    updated_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_access_role_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_access_role_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_access_role_merchants FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT ck_access_role_status CHECK (status IN ('enabled', 'disabled')),
    UNIQUE KEY uq_access_role_merchants(merchant_id, id)
    UNIQUE KEY uq_access_role_merchant_name (merchant_id, name)
)ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

CREATE TABLE permission(
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    code VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    permission_name VARCHAR(200) NOT NULL
)ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

CREATE TABLE user_role(
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    merchant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    role_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    CONSTRAINT fk_access_user_role_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT FOREIGN KEY (merchant_id, role_id) REFERENCES role(merchant_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    UNIQUE KEY uq_access_user_role_user_role (merchant_id, user_id, role_id)

)ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;

CREATE TABLE role_permission(
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    role_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    permission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    CONSTRAINT fk_access_role_permission_role FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_access_role_permission_permission FOREIGN KEY (permission_id) REFERENCES permission(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    UNIQUE KEY uq_access_role_permission_role_permission (role_id, permission_id)
)ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;