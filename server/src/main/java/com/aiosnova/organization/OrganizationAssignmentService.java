package com.aiosnova.organization;

import com.aiosnova.auth.AuthRepository;
import com.aiosnova.audit.AuditChanges;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OrganizationAssignmentService {
    private final JdbcTemplate jdbc;
    private final AuthRepository auth;
    private final OrganizationRepository organization;

    public OrganizationAssignmentService(JdbcTemplate jdbc, AuthRepository auth, OrganizationRepository organization) {
        this.jdbc = jdbc;
        this.auth = auth;
        this.organization = organization;
    }

    public String validate(String merchantId, String departmentId, String positionId) {
        if (departmentId.isEmpty()) {
            if (!positionId.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "org.invalidPlacement");
            return null;
        }
        String companyId = organization.companyFor("organization_departments", merchantId, departmentId);
        if (companyId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "org.invalidPlacement");
        if (!organization.lockCompany(merchantId, companyId)) throw new ResponseStatusException(HttpStatus.CONFLICT, "org.departmentInactive");
        var departments = organization.departments(merchantId, companyId);
        String current = departmentId;
        var visited = new HashSet<String>();
        while (current != null) {
            String id = current;
            var department = departments.stream().filter(item -> item.id().equals(id)).findFirst().orElse(null);
            if (!visited.add(id) || department == null || !"active".equals(department.status())) throw new ResponseStatusException(HttpStatus.CONFLICT, "org.departmentInactive");
            current = department.parentId();
        }
        if (!positionId.isEmpty() && organization.positions(merchantId, companyId, LocalDate.now()).stream()
                .noneMatch(position -> position.id().equals(positionId) && departmentId.equals(position.organizationId()) && "active".equals(position.status()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "org.invalidPlacement");
        }
        return companyId;
    }

    private List<Map<String,Object>> placements(String merchantId, String userId) {
        var profile = auth.directoryUser(merchantId, userId);
        String positionId = profile.positionId();
        return "invited".equals(profile.status()) ? List.<Map<String,Object>>of() : jdbc.queryForList("""
                SELECT m.id, m.company_id, p.id AS position_id, p.department_id, p.deleted_at FROM company_memberships m
                LEFT JOIN company_employee_placements pl ON pl.merchant_id = m.merchant_id AND pl.company_id = m.company_id AND pl.user_id = m.user_id
                JOIN organization_positions p ON p.merchant_id = m.merchant_id AND p.company_id = m.company_id
                  AND p.id = CASE WHEN pl.user_id IS NOT NULL THEN pl.position_id ELSE ? END
                  AND p.department_id = CASE WHEN pl.user_id IS NOT NULL THEN pl.department_id ELSE ? END
                WHERE m.merchant_id = ? AND m.user_id = ? AND m.status = 'active'
                  AND m.joined_at <= UTC_TIMESTAMP(6) AND (m.ended_at IS NULL OR m.ended_at > UTC_TIMESTAMP(6))
                """, positionId, profile.departmentId(), merchantId, userId);
    }

    public Set<String> retainedPlacements(String merchantId, String userId) {
        return placements(merchantId, userId).stream().map(this::placementKey).collect(Collectors.toSet());
    }

    private String placementKey(Map<String,Object> placement) {
        return placement.get("id") + ":" + placement.get("position_id");
    }

    @Transactional
    public void synchronize(String merchantId, String userId, String actorId) {
        synchronize(merchantId, userId, actorId, Set.of());
    }

    @Transactional
    public void synchronize(String merchantId, String userId, String actorId, Set<String> retainedPlacements) {
        var memberships = placements(merchantId, userId);
        var active = jdbc.queryForList("""
                SELECT a.id, a.membership_id, a.position_id FROM organization_position_assignments a
                JOIN company_memberships m ON m.merchant_id = a.merchant_id AND m.company_id = a.company_id AND m.id = a.membership_id
                WHERE a.merchant_id = ? AND m.user_id = ? AND a.status = 'active'
                  AND a.valid_from <= UTC_DATE() AND (a.valid_to IS NULL OR a.valid_to >= UTC_DATE()) FOR UPDATE
                """, merchantId, userId);
        for (var assignment : active) {
            if (memberships.stream().anyMatch(membership -> membership.get("id").equals(assignment.get("membership_id")) && membership.get("position_id").equals(assignment.get("position_id")))) continue;
            jdbc.update("UPDATE organization_position_assignments SET status = 'ended', valid_to = GREATEST(valid_from, UTC_DATE()), updated_by = ?, version = version + 1 WHERE id = ?", actorId, assignment.get("id"));
            auth.audit(merchantId, actorId, "identity.position_assignment.ended", "position_assignment", (String) assignment.get("id"),
                    AuditChanges.between(Map.of("status", "active"), Map.of("status", "ended")));
        }
        for (var membership : memberships) {
            String membershipId = (String) membership.get("id");
            String positionId = (String) membership.get("position_id");
            String selectedPositionId = positionId;
            if (active.stream().anyMatch(assignment -> membershipId.equals(assignment.get("membership_id")) && selectedPositionId.equals(assignment.get("position_id")))) continue;
            if (membership.get("deleted_at") != null) continue;
            // Repair only a placement retained on the same membership before this edit.
            if (!retainedPlacements.contains(placementKey(membership))) validate(merchantId, (String) membership.get("department_id"), positionId);
            String companyId = (String) membership.get("company_id");
            String id = UUID.randomUUID().toString();
            // The schema has day-level dates and one start per membership/position/day.
            jdbc.update("""
                    INSERT INTO organization_position_assignments (id, merchant_id, company_id, membership_id, position_id, valid_from, created_by, updated_by)
                    VALUES (?, ?, ?, ?, ?, UTC_DATE(), ?, ?)
                    ON DUPLICATE KEY UPDATE status = 'active', valid_to = NULL, updated_by = ?, version = version + 1
                    """, id, merchantId, companyId, membershipId, positionId, actorId, actorId, actorId);
            String savedId = jdbc.queryForObject("SELECT id FROM organization_position_assignments WHERE merchant_id = ? AND company_id = ? AND membership_id = ? AND position_id = ? AND valid_from = UTC_DATE()", String.class, merchantId, companyId, membershipId, positionId);
            auth.audit(merchantId, actorId, "identity.position_assignment.created", "position_assignment", savedId,
                    AuditChanges.between(Map.of(), Map.of("companyId", companyId, "positionId", positionId, "membershipId", membershipId, "status", "active")));
        }
    }
}
