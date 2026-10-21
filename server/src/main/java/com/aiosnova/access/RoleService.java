package com.aiosnova.access;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.aiosnova.auth.SessionService;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

@Service
public class RoleService {
    private final RoleRepository repository;

    public RoleService(RoleRepository repository) {
        this.repository = repository;
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

    public record RoleListItem(String id, String name, String status, LocalDateTime createdAt, long peopleCount,
            List<String> permissions) {
    }

    public record CreatedRole(String id, String name, String status, List<String> permissionIds) {

    }
}
