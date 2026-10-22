package com.aiosnova.access;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aiosnova.auth.SessionService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/identity")
public class RoleController {
    private final RoleService service;
    private final SessionService sessions;

    public RoleController(RoleService service, SessionService sessions) {
        this.service = service;
        this.sessions = sessions;
    }

    @PostMapping("/roles")
    public ResponseEntity<RoleService.CreatedRole> roles(@Valid @RequestBody CreateRole input,
            HttpServletRequest request) {
        return ResponseEntity.status(201).body(service.createRole(sessions.authenticate(request), input.name(),
                input.status(), input.permissionIds()));
    }

    @GetMapping("/roles")
    public List<RoleService.RoleListItem> listRoles(HttpServletRequest request) {
        return service.listRoles(sessions.authenticate(request));
    }

    @GetMapping ("/permissions")
    public List<RoleRepository.PermissionItem> listPermissions(HttpServletRequest request){
        return service.listPermissions(sessions.authenticate(request));
    }

    @PatchMapping("/roles/{id}")
    public ResponseEntity<Void> renameRole(
            @PathVariable("id") String id,
            @Valid @RequestBody RenameRole input,
            HttpServletRequest request) {
        service.renameRole(sessions.authenticate(request), id, input.name());

        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/roles/{id}/status")
    public ResponseEntity<Void> updateRoleStatus(
            @PathVariable("id") String id,
            @Valid @RequestBody UpdateRoleStatus input,
            HttpServletRequest request) {

        service.updateRoleStatus(
                sessions.authenticate(request),
                id,
                input.status());

        return ResponseEntity.noContent().build();
    }

    @PutMapping ("/roles/{id}/permissions")
    public ResponseEntity<Void> updateRolePermissions(@PathVariable("id") String id, @Valid @RequestBody UpdateRolePermissions input, HttpServletRequest request){
        service.updateRolePermissions(sessions.authenticate(request), id, input.permissionIds());

        return ResponseEntity.noContent().build();
    }

    public record UpdateRolePermissions(@NotNull List<@NotBlank String> permissionIds){
    }

    public record UpdateRoleStatus(@NotBlank String status) {
    }

    public record RenameRole(@NotBlank @Size(max = 80) String name) {
    }

    public record CreateRole(@NotBlank @Size(max = 80) String name, String status, List<String> permissionIds) {
    }
}
