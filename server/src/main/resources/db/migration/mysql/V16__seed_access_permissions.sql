INSERT INTO permissions (id, code, permission_name)
VALUES
    (UUID(), 'roles.read', 'View roles'),
    (UUID(), 'roles.create', 'Create roles'),
    (UUID(), 'roles.rename', 'Rename roles'),
    (UUID(), 'roles.permissions.update', 'Update role permissions'),
    (UUID(), 'roles.status.update', 'Enable or disable roles'),
    (UUID(), 'roles.assign', 'Assign roles'),
    (UUID(), 'roles.delete', 'Delete roles');