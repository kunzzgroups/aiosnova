package com.aiosnova.organization;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

@Repository
public class OrganizationRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public OrganizationRepository(JdbcTemplate jdbc, ObjectMapper json) { this.jdbc = jdbc; this.json = json; }

    public CompletedBatch completedBatch(String merchantId, String companyId, String actorId, String requestId) {
        var rows = jdbc.query("""
                SELECT request_hash, department_ids, position_ids FROM organization_batch_requests
                WHERE merchant_id = ? AND company_id = ? AND actor_user_id = ? AND request_id = ?
                """, (rs, row) -> new CompletedBatch(rs.getString("request_hash"),
                List.of(json.readValue(rs.getString("department_ids"), String[].class)),
                List.of(json.readValue(rs.getString("position_ids"), String[].class))), merchantId, companyId, actorId, requestId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public void completeBatch(String merchantId, String companyId, String actorId, String requestId, String hash, List<String> departments, List<String> positions) {
        jdbc.update("""
                INSERT INTO organization_batch_requests (merchant_id, company_id, actor_user_id, request_id, request_hash, department_ids, position_ids)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, merchantId, companyId, actorId, requestId, hash, json.writeValueAsString(departments), json.writeValueAsString(positions));
    }

    public List<Company> companies(String merchantId, String userId, boolean owner) {
        return jdbc.query("""
                SELECT c.id, c.code, c.name FROM companies c
                WHERE c.merchant_id = ? AND c.status = 'active' AND (? OR EXISTS(
                    SELECT 1 FROM company_memberships m WHERE m.merchant_id = c.merchant_id
                    AND m.company_id = c.id AND m.user_id = ? AND m.status = 'active'
                    AND m.joined_at <= UTC_TIMESTAMP(6) AND (m.ended_at IS NULL OR m.ended_at > UTC_TIMESTAMP(6))))
                ORDER BY c.name, c.id
                """, (rs, row) -> new Company(rs.getString("id"), rs.getString("code"), rs.getString("name")), merchantId, owner, userId);
    }

    public boolean lockCompany(String merchantId, String companyId) {
        return !jdbc.queryForList("SELECT id FROM companies WHERE merchant_id = ? AND id = ? AND status = 'active' FOR UPDATE",
                String.class, merchantId, companyId).isEmpty();
    }

    public List<Department> departments(String merchantId, String companyId) {
        return jdbc.query("SELECT * FROM organization_departments WHERE merchant_id = ? AND company_id = ? ORDER BY sort_order, name, id",
                this::department, merchantId, companyId);
    }

    public List<Position> positions(String merchantId, String companyId, LocalDate date) {
        return jdbc.query("""
                SELECT p.*,
                    (SELECT COUNT(*) FROM organization_position_assignments a WHERE a.merchant_id = p.merchant_id
                        AND a.company_id = p.company_id AND a.position_id = p.id) AS assignment_count,
                    (SELECT COUNT(DISTINCT m.user_id) FROM organization_position_assignments a
                        JOIN company_memberships m ON m.merchant_id = a.merchant_id AND m.company_id = a.company_id AND m.id = a.membership_id
                        JOIN users u ON u.id = m.user_id AND u.status = 'active'
                        WHERE a.merchant_id = p.merchant_id AND a.company_id = p.company_id AND a.position_id = p.id
                        AND a.status = 'active' AND m.status = 'active' AND a.valid_from <= ? AND (a.valid_to IS NULL OR a.valid_to >= ?)
                        AND m.joined_at <= UTC_TIMESTAMP(6) AND (m.ended_at IS NULL OR m.ended_at > UTC_TIMESTAMP(6))) AS employee_count
                FROM organization_positions p WHERE p.merchant_id = ? AND p.company_id = ? ORDER BY p.name, p.id
                """, this::position, date, date, merchantId, companyId);
    }

    public String companyFor(String table, String merchantId, String id) {
        List<String> rows = jdbc.queryForList("SELECT company_id FROM " + table + " WHERE merchant_id = ? AND id = ?", String.class, merchantId, id);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public void createDepartment(Department d, String actorId) {
        jdbc.update("""
                INSERT INTO organization_departments (id, merchant_id, company_id, parent_id, executive_position_id, name, status, sort_order, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, d.id(), d.merchantId(), d.companyId(), d.parentId(), d.managerPositionId(), d.name(), d.status(), d.sortOrder(), actorId, actorId);
    }

    public int updateDepartment(Department d, String actorId) {
        return jdbc.update("""
                UPDATE organization_departments SET parent_id = ?, executive_position_id = ?, name = ?, status = ?, updated_by = ?, version = version + 1
                WHERE merchant_id = ? AND company_id = ? AND id = ? AND version = ?
                """, d.parentId(), d.managerPositionId(), d.name(), d.status(), actorId, d.merchantId(), d.companyId(), d.id(), d.version());
    }

    public void createPosition(Position p, String actorId) {
        jdbc.update("""
                INSERT INTO organization_positions (id, merchant_id, company_id, department_id, name, level, status, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, p.id(), p.merchantId(), p.companyId(), p.organizationId(), p.name(), p.level(), p.status(), actorId, actorId);
    }

    public int updatePosition(Position p, String actorId) {
        return jdbc.update("""
                UPDATE organization_positions SET department_id = ?, name = ?, level = ?, status = ?, updated_by = ?, version = version + 1
                WHERE merchant_id = ? AND company_id = ? AND id = ? AND version = ?
                """, p.organizationId(), p.name(), p.level(), p.status(), actorId, p.merchantId(), p.companyId(), p.id(), p.version());
    }

    public void delete(String table, String merchantId, String companyId, String id, long version) {
        jdbc.update("DELETE FROM " + table + " WHERE merchant_id = ? AND company_id = ? AND id = ? AND version = ?", merchantId, companyId, id, version);
    }

    private Department department(ResultSet rs, int row) throws SQLException {
        return new Department(rs.getString("id"), rs.getString("merchant_id"), rs.getString("company_id"), rs.getString("parent_id"),
                rs.getString("executive_position_id"), rs.getString("name"), "department", rs.getString("status"), rs.getInt("sort_order"), rs.getLong("version"));
    }

    private Position position(ResultSet rs, int row) throws SQLException {
        return new Position(rs.getString("id"), rs.getString("merchant_id"), rs.getString("company_id"), rs.getString("department_id"),
                rs.getString("name"), rs.getString("level"), rs.getString("status"),
                rs.getLong("version"), rs.getInt("employee_count"), rs.getInt("assignment_count"));
    }

    public record Company(String id, String code, String name) { }
    public record CompletedBatch(String requestHash, List<String> departmentIds, List<String> positionIds) { }
    public record Department(String id, String merchantId, String companyId, String parentId, String managerPositionId,
                             String name, String type, String status, int sortOrder, long version) { }
    public record Position(String id, String merchantId, String companyId, String organizationId, String name,
                           String level, String status, long version, int employeeCount, int assignmentCount) { }
}
