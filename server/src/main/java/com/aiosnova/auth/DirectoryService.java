package com.aiosnova.auth;

import java.util.List;
import java.util.Locale;
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
    public InvitationService.Directory directory(SessionService.Actor actor) {
        List<AuthRepository.DirectoryUser> users = repository.directoryUsers(actor.merchantId()).stream()
                .map(user -> actor.owner() || actor.manageUsers() || actor.id().equals(user.id()) ? user : user.hidePhone())
                .toList();
        return new InvitationService.Directory(users, repository.directoryMemberships(actor.merchantId()));
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
        repository.updateProfile(actor.merchantId(), userId, request);
        if (selected != null) repository.replaceCompanies(actor.merchantId(), userId, selected);
        repository.audit(actor.merchantId(), actor.id(), "identity.user.updated", "user", userId);
        return repository.directoryUser(actor.merchantId(), userId);
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
