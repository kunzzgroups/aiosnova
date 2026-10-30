package com.aiosnova.audit;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.util.UUID;

import com.aiosnova.auth.SessionService;

import com.aiosnova.auth.AuthRepository;

@Service
public class AuditAccessPolicy {
    private final AuthRepository auth;
    private final JdbcTemplate jdbc;

    public AuditAccessPolicy(AuthRepository auth, JdbcTemplate jdbc) {
        this.auth = auth;
        this.jdbc = jdbc;
    }

    public Scope resolve(SessionService.Actor authenticatedActor, String requestedScope, String companyId) {
        if (authenticatedActor == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        var actor = auth.actor(
                authenticatedActor.merchantId(),
                authenticatedActor.id());
        if (actor == null || !"active".equals(actor.status())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        String scope = requestedScope == null
                ? "company"
                : requestedScope;
        if (!"merchant".equals(scope) && !"company".equals(scope)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid activity scope");
        }
        if ("merchant".equals(scope)) {
            if (companyId != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
            }
            if (!actor.owner()) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN);
            }
            return new Scope(actor.merchantId(), null);
        }
        if (companyId == null || companyId.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "companyId is required");
        }
        String selectedCompany;

        try {
            selectedCompany = UUID.fromString(companyId).toString();

            if (!selectedCompany.equalsIgnoreCase(companyId)) {
                throw new IllegalArgumentException();
            }
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid companyId");
        }
        if (actor.owner()) {
            boolean allowed = Boolean.TRUE.equals(jdbc.queryForObject("""
                        SELECT EXISTS(
                            SELECT 1
                            FROM companies
                            WHERE merchant_id = ? AND id = ?
                        )
                    """, Boolean.class, actor.merchantId(), selectedCompany));

            if (!allowed) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN);
            }

            return new Scope(actor.merchantId(), selectedCompany);
        }
        boolean companyAvailable = Boolean.TRUE.equals(
                jdbc.queryForObject("""
                        SELECT EXISTS(
                            SELECT 1
                            FROM companies
                            WHERE merchant_id = ?
                              AND id = ?
                              AND status = 'active'
                        )
                        """,
                        Boolean.class,
                        actor.merchantId(),
                        selectedCompany));

        if (!companyAvailable) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        boolean activeMember = Boolean.TRUE.equals(
                jdbc.queryForObject("""
                        SELECT EXISTS(
                            SELECT 1
                            FROM company_memberships
                            WHERE merchant_id = ?
                              AND company_id = ?
                              AND user_id = ?
                              AND status = 'active'
                              AND joined_at <= UTC_TIMESTAMP(6)
                              AND (ended_at IS NULL OR ended_at > UTC_TIMESTAMP(6))
                        )""", Boolean.class,
                        actor.merchantId(),
                        selectedCompany,
                        actor.id()));

        if (!activeMember) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        boolean canRead = auth.hasCompanyPermission(
                actor.merchantId(),
                selectedCompany,
                actor.id(),
                "audit.read");

        if (!canRead) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return new Scope(actor.merchantId(), selectedCompany);
    }

    public record Scope(String merchantId, String companyId) {
        public boolean merchantWide() {
            return companyId == null;
        }
    }
}
