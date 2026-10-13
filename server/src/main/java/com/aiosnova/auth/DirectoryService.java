package com.aiosnova.auth;

import java.util.List;
import java.util.Locale;
import java.util.LinkedHashMap;
import java.util.Map;
import com.aiosnova.audit.AuditChanges;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DirectoryService {
    private final AuthRepository repository;

    public DirectoryService(AuthRepository repository) {
        this.repository = repository;
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
        AuthRepository.DirectoryUser target = repository.directoryUser(actor.merchantId(), userId);
        if (target == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        boolean manager = actor.owner() || actor.manageUsers();
        if (!manager && !actor.id().equals(userId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (!manager && (request.companyCodes() != null || request.departmentId() != null || request.positionId() != null
                || request.requireMfa() != null || request.canInvite() != null)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
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
        List<String> previousCompanies = repository.userCompanyCodes(actor.merchantId(), userId);
        repository.updateProfile(actor.merchantId(), userId, request);
        if (selected != null) repository.replaceCompanies(actor.merchantId(), userId, selected);
        AuthRepository.DirectoryUser after = repository.directoryUser(actor.merchantId(), userId);
        Map<String, Object> changes = AuditChanges.between(auditFields(before), auditFields(after));
        AuditChanges.add(changes, "companyCodes", previousCompanies, repository.userCompanyCodes(actor.merchantId(), userId));
        AuditChanges.personal(changes, "email", before.email(), after.email());
        AuditChanges.personal(changes, "fullName", before.fullName(), after.fullName());
        AuditChanges.personal(changes, "displayName", before.displayName(), after.displayName());
        AuditChanges.personal(changes, "phone", before.phone(), after.phone());
        AuditChanges.personal(changes, "avatarUrl", before.avatarUrl(), after.avatarUrl());
        repository.audit(actor.merchantId(), actor.id(), "identity.user.updated", "user", userId, changes);
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

    public record Profile(String email, String fullName, String displayName, String phone, String avatarUrl,
                          String language, String timezone, String status, String departmentId, String positionId,
                          Boolean requireMfa, Boolean canInvite, Boolean canManageUsers, List<String> companyCodes) {
        public Profile {
            if (email != null) email = email.trim().toLowerCase(Locale.ROOT);
            if (fullName != null) fullName = fullName.trim();
            if (displayName != null) displayName = displayName.trim();
            if (phone != null) phone = phone.trim();
        }
    }
}
