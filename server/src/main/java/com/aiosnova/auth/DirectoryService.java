package com.aiosnova.auth;

import java.util.List;
import java.util.Locale;
import java.util.LinkedHashMap;
import java.util.Map;

import com.aiosnova.access.PermissionService;
import com.aiosnova.access.RoleService;
import com.aiosnova.audit.AuditChanges;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DirectoryService {
    private final AuthRepository repository;
    private final com.aiosnova.organization.OrganizationAssignmentService assignments;
    private final RoleService roles;
    private final PermissionService permissions;

    public DirectoryService(AuthRepository repository, com.aiosnova.organization.OrganizationAssignmentService assignments, RoleService roles, PermissionService permissions) {
        this.repository = repository;
        this.assignments = assignments;
        this.roles = roles;
        this.permissions = permissions;
    }

    @Transactional(readOnly = true)
    public InvitationService.Directory directory(SessionService.Actor actor, String companyId, String userId) {
        actor = repository.actor(actor.merchantId(), actor.id());
        if (actor == null || !"active".equals(actor.status())) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        final var current = actor;
        var accessible = repository.accessibleCompanies(actor);
        var company = accessible.stream().filter(item -> item.id().equals(companyId)).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN));
        var allowedCodes = accessible.stream().map(AuthRepository.Company::code).toList();
        var memberships = repository.directoryMemberships(actor.merchantId(), allowedCodes);
        var selectedUserIds = memberships.stream().filter(item -> item.companyCode().equals(company.code()))
                .map(AuthRepository.DirectoryMembership::userId).distinct().toList();
        if (userId != null && !selectedUserIds.contains(userId) && !actor.id().equals(userId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        var users = repository.directoryUsers(actor.merchantId(), userId == null ? selectedUserIds : List.of(userId)).stream()
                .filter(user -> current.owner() || current.manageUsers() || current.id().equals(user.id()) || !user.isOwner())
                .map(user -> current.owner() || current.manageUsers() || current.id().equals(user.id()) ? user : user.hidePhone()).toList();
        var visibleUserIds = users.stream().map(AuthRepository.DirectoryUser::id).toList();
        return new InvitationService.Directory(users, memberships.stream().filter(item -> visibleUserIds.contains(item.userId())).toList());
    }

    @Transactional
    public AuthRepository.DirectoryUser update(SessionService.Actor actor, String userId, Profile request) {
        repository.merchantOwner(actor.merchantId());
        // Re-read grants after taking the merchant lock so revocation and edits cannot race.
        actor = repository.actor(actor.merchantId(), actor.id());
        if (actor == null || !"active".equals(actor.status())) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        if (request.roleIds() != null
                && !actor.owner()
                && !permissions.hasPermission(actor, "roles.assign")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        AuthRepository.DirectoryUser target = repository.directoryUser(actor.merchantId(), userId);
        if (target == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        boolean manager = actor.owner() || actor.manageUsers();
        if (!manager
                && !actor.id().equals(userId)
                && !(request.rolesOnly()
                        && permissions.hasPermission(actor, "roles.assign"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (!manager && (request.companyCodes() != null || request.departmentId() != null || request.positionId() != null
                || request.requireMfa() != null || request.canInvite() != null || request.placementCompanyId() != null)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (!actor.owner() && (request.canManageUsers() != null || request.status() != null)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (target.isOwner() && (request.status() != null || request.canManageUsers() != null)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (request.status() != null && (!List.of("active", "disabled").contains(request.status())
                || "invited".equals(target.status()))) throw new ResponseStatusException(HttpStatus.CONFLICT);
        if ((request.email() != null && (request.email().isBlank() || !request.email().contains("@")))
                || (request.fullName() != null && request.fullName().isBlank())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if (request.email() != null) {
            AuthRepository.User existing = repository.user(request.email(), false);
            if (existing != null && !existing.id().equals(userId)) throw new ResponseStatusException(HttpStatus.CONFLICT);
        }
        List<AuthRepository.Company> selected = null;
        if (request.companyCodes() != null) {
            selected = repository.companies(actor.merchantId()).stream().filter(c -> request.companyCodes().contains(c.code())).toList();
            if (selected.size() != request.companyCodes().size()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        repository.lockUser(userId);
        AuthRepository.DirectoryUser before = repository.directoryUser(actor.merchantId(), userId);
        if (request.version() == null || request.version() < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "users.profileVersionRequired");
        if (before.version() != request.version()) throw new ResponseStatusException(HttpStatus.CONFLICT, "users.profileConflict");
        List<String> previousCompanies = repository.userCompanyCodes(actor.merchantId(), userId);
        if ((request.departmentId() != null || request.positionId() != null) && request.placementCompanyId() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        var scoped = request.placementCompanyId() == null ? null : repository.companyPlacement(actor.merchantId(), request.placementCompanyId(), userId);
        String previousDepartmentId = scoped == null ? before.departmentId() : java.util.Objects.toString(scoped.get("department_id"), "");
        String previousPositionId = scoped == null ? before.positionId() : java.util.Objects.toString(scoped.get("position_id"), "");
        String departmentId = request.departmentId() == null ? previousDepartmentId : request.departmentId();
        String positionId = request.positionId() == null ? previousPositionId : request.positionId();
        if (request.placementCompanyId() != null && repository.accessibleCompanies(actor).stream().noneMatch(company -> company.id().equals(request.placementCompanyId()))) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (!departmentId.equals(previousDepartmentId) || !positionId.equals(previousPositionId)) {
            String placementCompanyId = assignments.validate(actor.merchantId(), departmentId, positionId);
            if (placementCompanyId != null && (request.placementCompanyId() != null && !request.placementCompanyId().equals(placementCompanyId)
                    || repository.accessibleCompanies(actor).stream().noneMatch(company -> company.id().equals(placementCompanyId)))) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        var retainedPlacements = manager ? assignments.retainedPlacements(actor.merchantId(), userId) : java.util.Set.<String>of();
        if (request.roleIds() != null) {
            roles.updateUserRoles(actor, userId, request.roleIds());
        }
        repository.updateProfile(actor.merchantId(), userId, request);
        if (manager && request.placementCompanyId() != null && (request.departmentId() != null || request.positionId() != null)) repository.saveCompanyPlacement(actor.merchantId(), request.placementCompanyId(), userId, departmentId, positionId);
        if (selected != null) repository.replaceCompanies(actor.merchantId(), userId, selected);
        if (manager) assignments.synchronize(actor.merchantId(), userId, actor.id(), retainedPlacements);
        AuthRepository.DirectoryUser after = repository.directoryUser(actor.merchantId(), userId);
        Map<String, Object> changes = AuditChanges.between(auditFields(before), auditFields(after));
        AuditChanges.add(changes, "companyCodes", previousCompanies, repository.userCompanyCodes(actor.merchantId(), userId));
        AuditChanges.personal(changes, "email", before.email(), after.email());
        AuditChanges.personal(changes, "fullName", before.fullName(), after.fullName());
        AuditChanges.personal(changes, "displayName", before.displayName(), after.displayName());
        AuditChanges.personal(changes, "phone", before.phone(), after.phone());
        AuditChanges.personal(changes, "avatarUrl", before.avatarUrl(), after.avatarUrl());
        repository.auditMerchant(actor.merchantId(), actor.id(), "identity.user.updated", "user", userId, changes);
        return after;
    }

    private Map<String, Object> auditFields(AuthRepository.DirectoryUser user) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("status", user.status());
        fields.put("language", user.language());
        fields.put("timezone", user.timezone());
        fields.put("departmentId", user.departmentId());
        fields.put("positionId", user.positionId());
        fields.put("requireMfa", user.requireMfa());
        fields.put("canInvite", user.canInvite());
        fields.put("canManageUsers", user.canManageUsers());
        return fields;
    }

    @Transactional
    public void delete(SessionService.Actor actor, List<String> userIds) {
        repository.merchantOwner(actor.merchantId());
        actor = repository.actor(actor.merchantId(), actor.id());
        if (actor == null || !"active".equals(actor.status())) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "users.deleteSessionExpired");
        if (!actor.owner()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "users.deleteOwnerOnly");
        if (userIds == null || userIds.isEmpty() || userIds.stream().anyMatch(id -> id == null || id.isBlank())
                || userIds.stream().distinct().count() != userIds.size()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "users.deleteInvalidRequest");
        var targets = new java.util.ArrayList<AuthRepository.DirectoryUser>();
        for (String userId : userIds.stream().sorted().toList()) {
            repository.lockUser(userId);
            var target = repository.directoryUser(actor.merchantId(), userId);
            if (target == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "users.deleteNotFound");
            if (target.isOwner() || actor.id().equals(userId)) throw new ResponseStatusException(HttpStatus.CONFLICT, "users.deleteProtectedAccount");
            if (!"disabled".equals(target.status())) throw new ResponseStatusException(HttpStatus.CONFLICT, "users.deleteInactiveRequired");
            targets.add(target);
        }
        for (var target : targets) {
            var companies = repository.userCompanyCodes(actor.merchantId(), target.id());
            repository.clearEmployeePlacement(actor.merchantId(), target.id());
            assignments.synchronize(actor.merchantId(), target.id(), actor.id());
            repository.deleteEmployee(actor.merchantId(), target.id(), actor.id());
            repository.auditMerchant(actor.merchantId(), actor.id(), "identity.user.deleted", "user", target.id(),
                    AuditChanges.between(Map.of("deleted", false, "companyCodes", companies), Map.of("deleted", true, "companyCodes", List.of())));
        }
    }

    public record Profile(String email, String fullName, String displayName, String phone, String avatarUrl,
                          String language, String timezone, String status, String departmentId, String positionId,
                          Boolean requireMfa, Boolean canInvite, Boolean canManageUsers, List<String> companyCodes, String placementCompanyId, Long version, List<String> roleIds) {
        public Profile {
            if (email != null) email = email.trim().toLowerCase(Locale.ROOT);
            if (fullName != null) fullName = fullName.trim();
            if (displayName != null) displayName = displayName.trim();
            if (phone != null) phone = phone.trim();
            if (departmentId != null) departmentId = departmentId.trim();
            if (positionId != null) positionId = positionId.trim();
        }

        public boolean rolesOnly() {
            return roleIds != null
                    && email == null
                    && fullName == null
                    && displayName == null
                    && phone == null
                    && avatarUrl == null
                    && language == null
                    && timezone == null
                    && status == null
                    && departmentId == null
                    && positionId == null
                    && requireMfa == null
                    && canInvite == null
                    && canManageUsers == null
                    && companyCodes == null
                    && placementCompanyId == null;
        }
    }
}
