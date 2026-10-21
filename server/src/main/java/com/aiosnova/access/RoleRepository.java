package com.aiosnova.access;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class RoleRepository {
    private final JdbcTemplate jdbc;

    public RoleRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insertRoles(String id, String merchantId, String name, String status, String actorId) {
        jdbc.update("""
                INSERT INTO roles (id, merchant_id, name, status, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?)
                """, id, merchantId, name, status, actorId, actorId);
    }

    public void insertRolePermission(String id, String roleId, String permissionId) {
        jdbc.update("""
                INSERT INTO role_permissions (id, role_id, permission_id)
                VALUES (?, ?, ?)
                """, id, roleId, permissionId);
    }

    public boolean permissionExists(String permissionId) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM permissions WHERE id = ?", Integer.class,
                permissionId);
        return count != null && count > 0;
    }

    public boolean roleNameExists(String merchantId, String name) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM roles WHERE merchant_id = ? AND name = ? ",
                Integer.class, merchantId, name);
        return count != null && count > 0;
    }

    public List<RoleSummary> listRoles(String merchantId) {
        return jdbc.query("""
                SELECT r.id, r.name, r.status, r.created_at,
                (SELECT COUNT(*) FROM user_roles ur
                WHERE ur.merchant_id = r.merchant_id
                AND ur.role_id = r.id) AS people_count
                FROM roles r
                WHERE r.merchant_id = ?
                ORDER BY r.name, r.id
                """, (rs, rowNum) -> new RoleSummary(
                rs.getString("id"),
                rs.getString("name"),
                rs.getString("status"),
                rs.getTimestamp("created_at").toLocalDateTime(),
                rs.getLong("people_count")), merchantId);
    }

    public List<String> rolePermissionCodes(String merchantId, String roleId) {
        return jdbc.query("""
                    SELECT p.code
                    FROM role_permissions rp
                    JOIN permissions p ON rp.permission_id = p.id
                    JOIN roles r ON rp.role_id = r.id
                    WHERE r.merchant_id = ?
                        AND r.id = ?
                    ORDER BY p.code
                """, (rs, rowNum) -> rs.getString("code"),
                merchantId,
                roleId);
    }

    public int renameRole(String merchantId, String roleId, String name, String actorId) {
        return jdbc.update("""
                UPDATE roles SET name = ?, updated_by = ?
                WHERE merchant_id = ? AND id = ?
                """, name, actorId, merchantId, roleId);
    }

    public int updateRoleStatus(
        String merchantId,
        String roleId,
        String status,
        String actorId) {

    return jdbc.update("""
            UPDATE roles
            SET status = ?, updated_by = ?
            WHERE merchant_id = ? AND id = ?
            """,
            status, actorId, merchantId, roleId);
}

    public record RoleSummary(String id, String name, String status, LocalDateTime createdAt, long peopleCount) {
    }
}
