package com.aiosnova.auth;

import jakarta.servlet.http.HttpServletRequest;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Authenticated, company-scoped directory reads; no invitation or mock
 * operations.
 */
@RestController
@RequestMapping("/api/identity")
public class DirectoryController {
    private final SessionService sessions;
    private final DirectoryService directory;

    public DirectoryController(SessionService sessions, DirectoryService directory) {
        this.sessions = sessions;
        this.directory = directory;
    }

    @GetMapping("/directory")
    public ResponseEntity<InvitationService.Directory> read(@RequestParam String companyId,
            @RequestParam(required = false) String userId, HttpServletRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "private, no-store")
                .body(directory.directory(sessions.authenticate(request), companyId, userId));
    }

    @PatchMapping("/users/{userId}")
    public ResponseEntity<?> update(
            @PathVariable String userId,
            @RequestBody DirectoryService.Profile profile,
            HttpServletRequest request) {
        try {
            return ResponseEntity.ok()
                    .header("Cache-Control", "private, no-store")
                    .body(directory.update(
                            sessions.authenticate(request), userId, profile));
        } catch (ResponseStatusException error) {
            if (!"users.profileConflict".equals(error.getReason())
                    && !"users.profileVersionRequired".equals(error.getReason())) {
                throw error;
            }
            return ResponseEntity.status(error.getStatusCode())
                    .body(Map.of("message", error.getReason()));
        }
    }
}
