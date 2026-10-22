package com.aiosnova.access;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.aiosnova.audit.AuditChanges;
import com.aiosnova.auth.AuthRepository;
import com.aiosnova.auth.SessionService;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class RoleService {
    private final RoleRepository repository;
    private final AuthRepository auth;

    public RoleService(RoleRepository repository, AuthRepository auth) {
        this.repository = repository;
        this.auth = auth;
    }

    @Transactional
    public CreatedRole createRole(
            SessionService.Actor actor,
            String name,
            String status,
            List<String> permissionIds) {
        if (!actor.owner()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }

        String id = UUID.randomUUID().toString();
        String normalizedName = name.trim();
        if (normalizedName.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Role name must not be blank");
        }
        String normalizedStatus;
        if (status == null) {
            normalizedStatus = "enabled";
        } else {
            normalizedStatus = status;
        }
        if (!"enabled".equals(normalizedStatus) && !"disabled".equals(normalizedStatus)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status must be enabled or disabled");
        }
        List<String> normalizedPermissionIds;
        if (permissionIds == null) {
            normalizedPermissionIds = List.of();
        } else {
            normalizedPermissionIds = permissionIds;
        }

        int originalCount = normalizedPermissionIds.size();
        int uniqueCount = new HashSet<>(normalizedPermissionIds).size();

        if (originalCount != uniqueCount) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot add same permissions");
        }

        for (String permissionId : normalizedPermissionIds) {
            if (!repository.permissionExists(permissionId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
            }
        }

        if (repository.roleNameExists(actor.merchantId(), normalizedName)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Role name already exists.");
        }

        try {
            repository.insertRoles(id, actor.merchantId(), normalizedName, normalizedStatus, actor.id());
        } catch (DuplicateKeyException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Role name already exists.");
        }

        for (String permissionId : normalizedPermissionIds) {
            repository.insertRolePermission(UUID.randomUUID().toString(), id, permissionId);
        }

        return new CreatedRole(id, normalizedName, normalizedStatus, normalizedPermissionIds);
    }

    public List<RoleListItem> listRoles(SessionService.Actor actor) {
        if (!actor.owner()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        List<RoleListItem> items = new ArrayList<>();
        List<RoleRepository.RoleSummary> summaries = repository.listRoles(actor.merchantId());

        for (RoleRepository.RoleSummary role : summaries) {
            List<String> permissions = repository.rolePermissionCodes(actor.merchantId(), role.id());
            items.add(new RoleListItem(role.id(),
                    role.name(),
                    role.status(),
                    role.createdAt(),
                    role.peopleCount(),
                    permissions));
        }

        return items;
    }

    @Transactional
    public void renameRole(SessionService.Actor actor, String roleId, String name) {
        if (!actor.owner()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }

        if (name == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Role name must not be blank");
        }

        String normalizedName = name.trim();

        if (normalizedName.isEmpty() || normalizedName.length() > 80) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Role name must contains 1-80 characters");
        }

        try {
            int updated = repository.renameRole(actor.merchantId(), roleId, normalizedName, actor.id());

            if (updated == 0) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Role not found");
            }
        } catch (DuplicateKeyException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Role name already exists.", ex);
        }
    }

    @Transactional
    public void updateRoleStatus(
            SessionService.Actor actor,
            String roleId,
            String status) {

        if (!actor.owner()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }

        if (!"enabled".equals(status) && !"disabled".equals(status)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Status must be enabled or disabled");
        }

        int updated = repository.updateRoleStatus(
                actor.merchantId(),
                roleId,
                status,
                actor.id());

        if (updated == 0) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Role not found");
        }
    }

    public List<RoleRepository.PermissionItem> listPermissions(SessionService.Actor actor) {
        if (!actor.owner()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return repository.listPermissions();

    }

    @Transactional
    public void updateRolePermissions(
            SessionService.Actor actor,
            String roleId,
            List<String> permissionIds) {
        if (!actor.owner()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }

        RoleRepository.RoleSummary role = repository.lockRole(actor.merchantId(), roleId);

        if (role == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Role not found");
        }

        if (!"enabled".equals(role.status())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Disabled role permissions cannot be changed");
        }

        if (permissionIds == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PermissionIds is required");
        }

        int originalCount = permissionIds.size();
        int uniqueCount = new HashSet<>(permissionIds).size();

        if (originalCount != uniqueCount) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Permission IDs must not contain duplicates");
        }

        for (String permissionId : permissionIds) {
            if (permissionId == null || permissionId.isBlank()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Permission ID must not be blank");
            }
            if (!repository.permissionExists(permissionId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
            }
        }
        List<String> beforePermissions = repository.rolePermissionCodes(actor.merchantId(), roleId);
        repository.deleteRolePermissions(actor.merchantId(), roleId);
        for (String permissionId : permissionIds) {
            repository.insertRolePermission(
                    UUID.randomUUID().toString(),
                    roleId,
                    permissionId);
        }
        repository.touchRole(actor.merchantId(), roleId, actor.id());
        List<String> afterPermissions = repository.rolePermissionCodes(actor.merchantId(), roleId);

        Map<String, Object> changes = AuditChanges.between(
                Map.of("permissions", beforePermissions),
                Map.of("permissions", afterPermissions));

        if (!changes.isEmpty()) {
            auth.audit(
                    actor.merchantId(),
                    actor.id(),
                    "identity.role.permissions.updated",
                    "role",
                    roleId,
                    changes);
        }
    }

    @Transactional
    public void updateUserRoles(
            SessionService.Actor actor,
            String userId,
            List<String> roleIds) {
        if (!actor.owner()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (roleIds == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "roleIds is required");
        }

        int originalCount = roleIds.size();
        int uniqueCount = new HashSet<>(roleIds).size();

        if (originalCount != uniqueCount) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Role IDs must not contain duplicates");
        }
    }

    public record RoleListItem(String id, String name, String status, LocalDateTime createdAt, long peopleCount,
            List<String> permissions) {
    }

    public record CreatedRole(String id, String name, String status, List<String> permissionIds) {

    }
}
