package com.aiosnova.auth;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AuthRepository {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public AuthRepository(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public User user(String email, boolean lock) {
        List<User> rows = jdbc.query("SELECT id, email, full_name, status FROM users WHERE email = ?"
                + (lock ? " FOR UPDATE" : ""), (rs, row) -> new User(rs.getString("id"),
                rs.getString("email"), rs.getString("full_name"), rs.getString("status")), email);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public void lockUser(String id) {
        jdbc.queryForObject("SELECT id FROM users WHERE id = ? FOR UPDATE", String.class, id);
    }

    public List<String> userCompanyCodes(String merchantId, String userId) {
        return jdbc.queryForList("""
                SELECT c.code FROM companies c WHERE c.merchant_id = ? AND (
                    EXISTS(SELECT 1 FROM company_memberships cm WHERE cm.merchant_id = c.merchant_id
                        AND cm.company_id = c.id AND cm.user_id = ? AND cm.status = 'active')
                    OR EXISTS(SELECT 1 FROM invitation_company_assignments a
                        JOIN invitations i ON i.merchant_id = a.merchant_id AND i.id = a.invitation_id
                        JOIN users u ON u.id = i.user_id AND u.status = 'invited'
                        WHERE a.merchant_id = c.merchant_id AND a.company_id = c.id AND i.user_id = ? AND i.status = 'sent'))
                ORDER BY c.code
                """, String.class, merchantId, userId, userId);
    }

    public boolean hasMfa(String userId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM user_mfa_methods WHERE user_id = ? AND status = 'active')", Boolean.class, userId));
    }

    public boolean hasCompanyPermission(String merchantId, String companyId, String userId, String permission) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM company_user_permission_grants
                    WHERE merchant_id = ? AND company_id = ? AND user_id = ? AND permission_code = ?)
                """, Boolean.class, merchantId, companyId, userId, permission));
    }

    public SessionService.Actor actor(String merchantId, String userId) {
        List<SessionService.Actor> rows = jdbc.query("""
                SELECT u.id, u.status, m.owner_user_id = u.id AS owner,
                    EXISTS(SELECT 1 FROM user_permission_grants g WHERE g.merchant_id = m.id
                        AND g.user_id = u.id AND g.permission_code = 'identity.users.manage') AS manage_users,
                    COALESCE(s.can_invite, FALSE) AS can_invite
                FROM users u JOIN merchants m ON m.id = ? AND m.status <> 'disabled'
                LEFT JOIN user_directory_settings s ON s.merchant_id = m.id AND s.user_id = u.id
                WHERE u.id = ? AND s.deleted_at IS NULL AND (m.owner_user_id = u.id
                    OR EXISTS(SELECT 1 FROM invitations i WHERE i.merchant_id = m.id AND i.user_id = u.id)
                    OR EXISTS(SELECT 1 FROM company_memberships cm WHERE cm.merchant_id = m.id AND cm.user_id = u.id))
                """, (rs, row) -> new SessionService.Actor(rs.getString("id"), merchantId,
                rs.getString("status"), rs.getBoolean("owner"), rs.getBoolean("manage_users"), rs.getBoolean("can_invite")), merchantId, userId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public void createSession(String id, String merchantId, String userId, String hash, String csrfHash, Instant now) {
        jdbc.update("""
                INSERT INTO auth_sessions (id, merchant_id, user_id, token_hash, csrf_hash, status,
                    otp_verified_at, mfa_verified_at, expires_at)
                VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
                """, id, merchantId, userId, hash, csrfHash, Timestamp.from(now),
                hasMfa(userId) ? Timestamp.from(now) : null, Timestamp.from(now.plusSeconds(28800)));
        jdbc.update("UPDATE users SET last_active_at = ? WHERE id = ?", Timestamp.from(now), userId);
    }

    public SessionService.Actor sessionActor(String hash, String csrfHash) {
        List<String[]> rows = jdbc.query("""
                SELECT merchant_id, user_id, mfa_verified_at FROM auth_sessions
                WHERE token_hash = ? AND status = 'active' AND expires_at > UTC_TIMESTAMP(6)
                    AND (? IS NULL OR csrf_hash = ?)
                """, (rs, row) -> new String[] { rs.getString("merchant_id"), rs.getString("user_id"),
                rs.getString("mfa_verified_at") }, hash, csrfHash, csrfHash);
        if (rows.isEmpty()) return null;
        String[] session = rows.getFirst();
        SessionService.Actor actor = actor(session[0], session[1]);
        if (actor == null || !"active".equals(actor.status())) return null;
        if (requiresMfa(actor.id()) && (session[2] == null || !hasMfa(actor.id()))) return null;
        return actor;
    }

    public void revokeSession(String hash) {
        jdbc.update("UPDATE auth_sessions SET status = 'revoked', revoked_at = UTC_TIMESTAMP(6) WHERE token_hash = ? AND status = 'active'", hash);
    }

    public DirectoryUser directoryUser(String merchantId, String userId) {
        return directoryUsers(merchantId, List.of(userId)).stream().findFirst().orElse(null);
    }

    public void updateProfile(String merchantId, String userId, DirectoryService.Profile request) {
        jdbc.update("""
                UPDATE users SET email = COALESCE(?, email), full_name = COALESCE(?, full_name),
                    display_name = COALESCE(?, display_name), phone = COALESCE(?, phone),
                    avatar_url = COALESCE(?, avatar_url), language = COALESCE(?, language),
                    timezone = COALESCE(?, timezone), status = COALESCE(?, status), version = version + 1 WHERE id = ?
                """, request.email(), request.fullName(), request.displayName(), request.phone(),
                request.avatarUrl(), request.language(), request.timezone(), request.status(), userId);
        jdbc.update("""
                INSERT INTO user_directory_settings (merchant_id, user_id, department_ref, position_ref, require_mfa, can_invite)
                VALUES (?, ?, COALESCE(?, ''), COALESCE(?, ''), COALESCE(?,
                    (SELECT MAX(i.require_mfa) FROM invitations i WHERE i.merchant_id = ? AND i.user_id = ? AND i.status IN ('sent', 'accepted')), FALSE), COALESCE(?, FALSE))
                ON DUPLICATE KEY UPDATE department_ref = COALESCE(?, department_ref),
                    position_ref = COALESCE(?, position_ref), require_mfa = COALESCE(?, require_mfa), can_invite = COALESCE(?, can_invite)
                """, merchantId, userId, request.departmentId(), request.positionId(), request.requireMfa(), merchantId, userId, request.canInvite(),
                request.departmentId(), request.positionId(), request.requireMfa(), request.canInvite());
        if (request.canManageUsers() != null) {
            jdbc.update("DELETE FROM user_permission_grants WHERE merchant_id = ? AND user_id = ? AND permission_code = 'identity.users.manage'", merchantId, userId);
            if (request.canManageUsers()) jdbc.update("INSERT INTO user_permission_grants VALUES (?, ?, 'identity.users.manage')", merchantId, userId);
        }
        if (request.email() != null) {
            jdbc.update("UPDATE invitations SET email = ? WHERE merchant_id = ? AND user_id = ? AND status = 'sent'", request.email(), merchantId, userId);
        }
        if (request.fullName() != null) jdbc.update("UPDATE invitations SET full_name = ? WHERE merchant_id = ? AND user_id = ? AND status = 'sent'", request.fullName(), merchantId, userId);
    }

    public void replaceCompanies(String merchantId, String userId, List<Company> selected) {
        jdbc.update("UPDATE company_memberships SET status = 'ended', ended_at = UTC_TIMESTAMP(6), version = version + 1 WHERE merchant_id = ? AND user_id = ? AND status = 'active'", merchantId, userId);
        List<String> invitations = jdbc.queryForList("SELECT id FROM invitations WHERE merchant_id = ? AND user_id = ? AND status = 'sent' FOR UPDATE", String.class, merchantId, userId);
        for (String invitation : invitations) {
            jdbc.update("DELETE FROM invitation_company_assignments WHERE merchant_id = ? AND invitation_id = ?", merchantId, invitation);
            for (Company company : selected) assignCompany(UUID.randomUUID().toString(), merchantId, invitation, company.id());
        }
        if (!"invited".equals(userById(userId).status())) for (Company company : selected) {
            jdbc.update("""
                    INSERT INTO company_memberships (id, merchant_id, user_id, company_id, joined_at)
                    VALUES (?, ?, ?, ?, UTC_TIMESTAMP(6))
                    ON DUPLICATE KEY UPDATE status = 'active', ended_at = NULL, version = version + 1
                    """, UUID.randomUUID().toString(), merchantId, userId, company.id());
        }
    }

    public void saveInvitationPlacement(String merchantId, String userId, String departmentId, String positionId, boolean requireMfa) {
        jdbc.update("""
                INSERT INTO user_directory_settings (merchant_id, user_id, department_ref, position_ref, require_mfa)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE department_ref = ?, position_ref = ?, require_mfa = ?
                """, merchantId, userId, departmentId, positionId, requireMfa, departmentId, positionId, requireMfa);
        var companies = jdbc.queryForList("SELECT company_id FROM organization_departments WHERE merchant_id = ? AND id = ?", String.class, merchantId, departmentId);
        if (!companies.isEmpty()) saveCompanyPlacement(merchantId, companies.getFirst(), userId, departmentId, positionId);
    }

    public List<DirectoryUser> directoryUsers(String merchantId) { return directoryUsers(merchantId, null); }

    public List<DirectoryUser> directoryUsers(String merchantId, List<String> userIds) {
        if (userIds != null && userIds.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT u.id, u.email, COALESCE(u.display_name, u.full_name, u.email) AS display_name,
                    COALESCE(u.full_name, '') AS full_name, COALESCE(u.phone, '') AS phone,
                    COALESCE(u.avatar_url, '') AS avatar_url, u.language, u.timezone, u.status,
                    u.last_active_at, u.created_at, m.owner_user_id = u.id AS is_owner,
                    (SELECT COALESCE(creator.display_name, creator.full_name, creator.email)
                     FROM invitations i LEFT JOIN users creator ON creator.id = i.invited_by
                     WHERE i.merchant_id = m.id AND i.user_id = u.id
                     ORDER BY i.created_at, i.id LIMIT 1) AS created_by,
                    COALESCE(s.department_ref, '') AS department_ref, COALESCE(s.position_ref, '') AS position_ref,
                    COALESCE(s.require_mfa, (SELECT MAX(i.require_mfa) FROM invitations i WHERE i.merchant_id = m.id AND i.user_id = u.id AND i.status IN ('sent', 'accepted')), FALSE) AS require_mfa, COALESCE(s.can_invite, FALSE) AS can_invite,
                    EXISTS(SELECT 1 FROM user_permission_grants g WHERE g.merchant_id = m.id AND g.user_id = u.id AND g.permission_code = 'identity.users.manage') AS manage_users,
                    EXISTS(SELECT 1 FROM user_mfa_methods m WHERE m.user_id = u.id AND m.status = 'active') AS mfa_enabled
                FROM users u JOIN merchants m ON m.id = ?
                LEFT JOIN user_directory_settings s ON s.merchant_id = m.id AND s.user_id = u.id
                WHERE s.deleted_at IS NULL AND (m.owner_user_id = u.id OR EXISTS(SELECT 1 FROM invitations i WHERE i.user_id = u.id AND i.merchant_id = m.id)
                    OR EXISTS(SELECT 1 FROM company_memberships cm WHERE cm.user_id = u.id AND cm.merchant_id = m.id))
                """ + (userIds == null ? "" : " AND u.id IN (" + String.join(",", java.util.Collections.nCopies(userIds.size(), "?")) + ")")
                + " ORDER BY u.created_at DESC, u.id", (rs, row) -> new DirectoryUser(rs.getString("id"), rs.getString("email"),
                rs.getString("display_name"), rs.getString("full_name"), rs.getString("phone"),
                rs.getString("avatar_url"), rs.getString("language"), rs.getString("timezone"),
                rs.getString("status"), "active".equals(rs.getString("status")) ? "otp" : null,
                rs.getBoolean("mfa_enabled"), rs.getTimestamp("last_active_at") == null ? null
                        : rs.getTimestamp("last_active_at").toInstant(), rs.getTimestamp("created_at").toInstant(),
                rs.getBoolean("is_owner"), rs.getBoolean("manage_users"), rs.getString("department_ref"),
                rs.getString("position_ref"), rs.getBoolean("require_mfa"), rs.getBoolean("can_invite"), rs.getString("created_by")), directoryArguments(merchantId, userIds));
    }

    private Object[] directoryArguments(String merchantId, List<String> values) {
        var args = new java.util.ArrayList<Object>();
        args.add(merchantId);
        if (values != null) args.addAll(values);
        return args.toArray();
    }


    public void saveCompanyPlacement(String merchantId, String companyId, String userId, String departmentId, String positionId) {
        jdbc.update("""
                INSERT INTO company_employee_placements (merchant_id, company_id, user_id, department_id, position_id)
                VALUES (?, ?, ?, NULLIF(?, ''), NULLIF(?, ''))
                ON DUPLICATE KEY UPDATE department_id = NULLIF(?, ''), position_id = NULLIF(?, ''), version = version + 1
                """, merchantId, companyId, userId, departmentId, positionId, departmentId, positionId);
    }

    public Map<String, Object> companyPlacement(String merchantId, String companyId, String userId) {
        var rows = jdbc.queryForList("SELECT department_id, position_id FROM company_employee_placements WHERE merchant_id = ? AND company_id = ? AND user_id = ?", merchantId, companyId, userId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public void clearEmployeePlacement(String merchantId, String userId) {
        jdbc.update("UPDATE company_employee_placements SET department_id = NULL, position_id = NULL, version = version + 1 WHERE merchant_id = ? AND user_id = ?", merchantId, userId);
        jdbc.update("""
                INSERT INTO user_directory_settings (merchant_id, user_id, department_ref, position_ref)
                VALUES (?, ?, '', '') ON DUPLICATE KEY UPDATE department_ref = '', position_ref = '', can_invite = FALSE
                """, merchantId, userId);
    }

    public void deleteEmployee(String merchantId, String userId, String actorId) {
        jdbc.update("UPDATE company_memberships SET status = 'ended', ended_at = GREATEST(joined_at, UTC_TIMESTAMP(6)), version = version + 1 WHERE merchant_id = ? AND user_id = ? AND status = 'active'", merchantId, userId);
        revokeInvitations(merchantId, userId);
        jdbc.update("DELETE FROM user_permission_grants WHERE merchant_id = ? AND user_id = ?", merchantId, userId);
        jdbc.update("DELETE FROM company_user_permission_grants WHERE merchant_id = ? AND user_id = ?", merchantId, userId);
        jdbc.update("UPDATE auth_sessions SET status = 'revoked', revoked_at = UTC_TIMESTAMP(6), version = version + 1 WHERE merchant_id = ? AND user_id = ? AND status IN ('active', 'restricted')", merchantId, userId);
        jdbc.update("UPDATE user_directory_settings SET deleted_at = UTC_TIMESTAMP(6), deleted_by = ? WHERE merchant_id = ? AND user_id = ?", actorId, merchantId, userId);
    }

    public List<Company> accessibleCompanies(SessionService.Actor actor) {
        return jdbc.query("""
                SELECT c.id, c.code, c.name, c.require_mfa FROM companies c
                WHERE c.merchant_id = ? AND c.status = 'active' AND (? OR EXISTS(
                    SELECT 1 FROM company_memberships cm WHERE cm.merchant_id = c.merchant_id AND cm.company_id = c.id
                    AND cm.user_id = ? AND cm.status = 'active' AND cm.joined_at <= UTC_TIMESTAMP(6)
                    AND (cm.ended_at IS NULL OR cm.ended_at > UTC_TIMESTAMP(6))))
                """, (rs, row) -> new Company(rs.getString("id"), rs.getString("code"), rs.getString("name"), rs.getBoolean("require_mfa")), actor.merchantId(), actor.owner(), actor.id());
    }

    public List<DirectoryMembership> directoryMemberships(String merchantId) { return directoryMemberships(merchantId, null); }

    public List<DirectoryMembership> directoryMemberships(String merchantId, List<String> companyCodes) {
        if (companyCodes != null && companyCodes.isEmpty()) return List.of();
        String scope = companyCodes == null ? "" : " AND c.code IN (" + String.join(",", java.util.Collections.nCopies(companyCodes.size(), "?")) + ")";
        var args = new java.util.ArrayList<Object>();
        java.util.Collections.addAll(args, directoryArguments(merchantId, companyCodes));
        java.util.Collections.addAll(args, directoryArguments(merchantId, companyCodes));
        return jdbc.query("""
                SELECT cm.id, cm.user_id, c.code AS company_code, cm.status,
                    cm.joined_at AS valid_from, cm.ended_at AS valid_to, od.id AS department_id, op.id AS position_id,
                    od.name AS department_name, op.name AS position_name, od.deleted_at IS NOT NULL AS department_deleted, op.deleted_at IS NOT NULL AS position_deleted
                FROM company_memberships cm JOIN companies c ON c.merchant_id = cm.merchant_id AND c.id = cm.company_id
                LEFT JOIN user_directory_settings ds ON ds.merchant_id = c.merchant_id AND ds.user_id = cm.user_id
                LEFT JOIN company_employee_placements pl ON pl.merchant_id = c.merchant_id AND pl.company_id = c.id AND pl.user_id = ds.user_id
                LEFT JOIN organization_departments od ON od.merchant_id = c.merchant_id AND od.company_id = c.id AND od.id = CASE WHEN pl.user_id IS NOT NULL THEN pl.department_id ELSE ds.department_ref END
                LEFT JOIN organization_positions op ON op.merchant_id = c.merchant_id AND op.company_id = c.id AND op.department_id = od.id AND op.id = CASE WHEN pl.user_id IS NOT NULL THEN pl.position_id ELSE ds.position_ref END
                WHERE cm.merchant_id = ? AND cm.status = 'active'
                    AND cm.joined_at <= UTC_TIMESTAMP(6) AND (cm.ended_at IS NULL OR cm.ended_at > UTC_TIMESTAMP(6))
                """ + scope + """
                UNION ALL
                SELECT a.id, i.user_id, c.code, 'invited', i.sent_at, NULL, od.id, op.id, od.name, op.name, od.deleted_at IS NOT NULL, op.deleted_at IS NOT NULL
                FROM invitation_company_assignments a
                JOIN invitations i ON i.merchant_id = a.merchant_id AND i.id = a.invitation_id
                JOIN companies c ON c.merchant_id = a.merchant_id AND c.id = a.company_id
                LEFT JOIN user_directory_settings ds ON ds.merchant_id = c.merchant_id AND ds.user_id = i.user_id
                LEFT JOIN company_employee_placements pl ON pl.merchant_id = c.merchant_id AND pl.company_id = c.id AND pl.user_id = ds.user_id
                LEFT JOIN organization_departments od ON od.merchant_id = c.merchant_id AND od.company_id = c.id AND od.id = CASE WHEN pl.user_id IS NOT NULL THEN pl.department_id ELSE ds.department_ref END
                LEFT JOIN organization_positions op ON op.merchant_id = c.merchant_id AND op.company_id = c.id AND op.department_id = od.id AND op.id = CASE WHEN pl.user_id IS NOT NULL THEN pl.position_id ELSE ds.position_ref END
                WHERE a.merchant_id = ? AND i.status = 'sent'
                """ + scope, (rs, row) -> new DirectoryMembership(rs.getString("id"), rs.getString("user_id"),
                rs.getString("company_code"), rs.getString("status"), rs.getTimestamp("valid_from").toInstant(),
                rs.getTimestamp("valid_to") == null ? null : rs.getTimestamp("valid_to").toInstant(), rs.getString("department_id"), rs.getString("position_id"), rs.getString("department_name"), rs.getString("position_name"), rs.getBoolean("department_deleted"), rs.getBoolean("position_deleted")), args.toArray());
    }

    public void createUser(String id, String email, String name, String language) {
        jdbc.update("INSERT INTO users (id, email, full_name, display_name, language) VALUES (?, ?, ?, ?, ?)",
                id, email, name, name, language);
    }

    public String merchantOwner(String merchantId) {
        return jdbc.queryForObject("SELECT owner_user_id FROM merchants WHERE id = ? FOR UPDATE",
                String.class, merchantId);
    }

    public List<Company> companies(String merchantId) {
        return jdbc.query("SELECT id, code, name, require_mfa FROM companies WHERE merchant_id = ? AND status = 'active'",
                (rs, row) -> new Company(rs.getString("id"), rs.getString("code"),
                        rs.getString("name"), rs.getBoolean("require_mfa")), merchantId);
    }

    public void revokeInvitations(String merchantId, String userId) {
        jdbc.update("""
                UPDATE user_mfa_methods m JOIN invitations i ON i.id = m.invitation_id
                SET m.status = 'revoked', m.version = m.version + 1
                WHERE i.merchant_id = ? AND i.user_id = ? AND i.status = 'sent' AND m.status = 'pending'
                """, merchantId, userId);
        jdbc.update("UPDATE invitations SET status = 'revoked', version = version + 1"
                + " WHERE merchant_id = ? AND user_id = ? AND status = 'sent'", merchantId, userId);
    }

    public void createInvitation(String id, String merchantId, String userId, String ownerId,
                                 String email, String name, String language, String message,
                                 String tokenHash, boolean requireMfa, Instant now, Instant expiresAt) {
        jdbc.update("""
                INSERT INTO invitations (id, merchant_id, user_id, invited_by, invitation_type,
                    email, full_name, language, personal_message, token_hash, require_mfa, status, sent_at, expires_at)
                VALUES (?, ?, ?, ?, 'employee', ?, ?, ?, ?, ?, ?, 'sent', ?, ?)
                """, id, merchantId, userId, ownerId, email, name, language, message,
                tokenHash, requireMfa, Timestamp.from(now), Timestamp.from(expiresAt));
    }

    public void assignCompany(String id, String merchantId, String invitationId, String companyId) {
        jdbc.update("INSERT INTO invitation_company_assignments (id, merchant_id, invitation_id, company_id)"
                + " VALUES (?, ?, ?, ?)", id, merchantId, invitationId, companyId);
    }

    public Invite invitation(String tokenHash, boolean lock) {
        List<Invite> rows = jdbc.query("""
                SELECT id, merchant_id, user_id, email, full_name, require_mfa, status, expires_at
                FROM invitations WHERE token_hash = ?
                """ + (lock ? " FOR UPDATE" : ""), (rs, row) -> new Invite(rs.getString("id"),
                rs.getString("merchant_id"), rs.getString("user_id"), rs.getString("email"),
                rs.getString("full_name"), rs.getBoolean("require_mfa"), rs.getString("status"),
                rs.getTimestamp("expires_at").toInstant()), tokenHash);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public List<Company> invitationCompanies(String merchantId, String invitationId) {
        return jdbc.query("""
                SELECT c.id, c.code, c.name, c.require_mfa FROM companies c
                JOIN invitation_company_assignments a ON a.merchant_id = c.merchant_id AND a.company_id = c.id
                WHERE a.merchant_id = ? AND a.invitation_id = ? AND c.status = 'active'
                """, (rs, row) -> new Company(rs.getString("id"), rs.getString("code"),
                rs.getString("name"), rs.getBoolean("require_mfa")), merchantId, invitationId);
    }

    public boolean requiresMfa(String userId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM merchants WHERE owner_user_id = ?)
                    OR EXISTS(SELECT 1 FROM invitations i LEFT JOIN user_directory_settings s ON s.merchant_id = i.merchant_id AND s.user_id = i.user_id
                        WHERE i.user_id = ? AND i.status = 'accepted' AND COALESCE(s.require_mfa, i.require_mfa) = TRUE)
                    OR EXISTS(SELECT 1 FROM company_memberships cm
                        JOIN companies c ON c.merchant_id = cm.merchant_id AND c.id = cm.company_id
                        WHERE cm.user_id = ? AND cm.status = 'active' AND c.status = 'active' AND c.require_mfa = TRUE)
                """, Boolean.class, userId, userId, userId));
    }

    public boolean accepted(String userId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM invitations"
                + " WHERE user_id = ? AND status = 'accepted')", Boolean.class, userId));
    }

    public void activate(Invite invite, List<Company> companies, Instant now) {
        jdbc.update("UPDATE users SET status = 'active', email_verified_at = ?, full_name = ?,"
                + " display_name = ?, version = version + 1 WHERE id = ?",
                Timestamp.from(now), invite.fullName(), invite.fullName(), invite.userId());
        for (Company company : companies) {
            jdbc.update("""
                    INSERT INTO company_memberships (id, merchant_id, user_id, company_id, joined_at)
                    VALUES (?, ?, ?, ?, UTC_TIMESTAMP(6))
                    ON DUPLICATE KEY UPDATE status = 'active', ended_at = NULL, version = version + 1
                    """, UUID.randomUUID().toString(), invite.merchantId(), invite.userId(),
                    company.id());
        }
        jdbc.update("UPDATE invitations SET status = 'accepted', accepted_at = ?, version = version + 1 WHERE id = ?",
                Timestamp.from(now), invite.id());
    }

    public Mfa enrollment(String invitationId) {
        List<Mfa> rows = jdbc.query("SELECT * FROM user_mfa_methods WHERE invitation_id = ? AND status = 'pending'",
                this::mfa, invitationId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public Mfa credential(String userId) {
        List<Mfa> rows = jdbc.query("SELECT * FROM user_mfa_methods WHERE user_id = ? AND status = 'active' FOR UPDATE",
                this::mfa, userId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public void createEnrollment(String id, String userId, String invitationId, byte[] encrypted) {
        jdbc.update("""
                INSERT INTO user_mfa_methods (id, user_id, invitation_id, encrypted_secret, encryption_key_ref)
                VALUES (?, ?, ?, ?, 'local-v1')
                """, id, userId, invitationId, encrypted);
    }

    public void mfaFailure(String id) {
        jdbc.update("UPDATE user_mfa_methods SET attempt_count = attempt_count + 1, version = version + 1 WHERE id = ?", id);
    }

    public void enableMfa(String id, long counter, Instant now) {
        jdbc.update("""
                UPDATE user_mfa_methods SET status = 'active', verified_at = ?, last_used_at = ?,
                    last_accepted_time_step = ?, version = version + 1 WHERE id = ?
                """, Timestamp.from(now), Timestamp.from(now), counter, id);
    }

    public void useMfa(String id, long counter) {
        jdbc.update("UPDATE user_mfa_methods SET last_accepted_time_step = ?, last_used_at = UTC_TIMESTAMP(6),"
                + " version = version + 1 WHERE id = ?", counter, id);
    }

    public void createTicket(String id, String userId, String tokenHash, Instant now) {
        jdbc.update("INSERT INTO auth_sessions (id, user_id, token_hash, otp_verified_at, expires_at) VALUES (?, ?, ?, ?, ?)",
                id, userId, tokenHash, Timestamp.from(now), Timestamp.from(now.plusSeconds(300)));
    }

    public Ticket ticket(String tokenHash, boolean lock) {
        List<Ticket> rows = jdbc.query("SELECT id, user_id, status, expires_at, attempt_count FROM auth_sessions"
                + " WHERE token_hash = ?" + (lock ? " FOR UPDATE" : ""), (rs, row) -> new Ticket(
                rs.getString("id"), rs.getString("user_id"), rs.getString("status"),
                rs.getTimestamp("expires_at").toInstant(), rs.getInt("attempt_count")), tokenHash);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public User userById(String id) {
        return jdbc.queryForObject("SELECT id, email, full_name, status FROM users WHERE id = ?",
                (rs, row) -> new User(rs.getString("id"), rs.getString("email"),
                        rs.getString("full_name"), rs.getString("status")), id);
    }

    public void ticketFailure(String id) {
        jdbc.update("UPDATE auth_sessions SET attempt_count = attempt_count + 1, version = version + 1 WHERE id = ?", id);
    }

    public void consumeTicket(String id) {
        jdbc.update("UPDATE auth_sessions SET status = 'revoked', revoked_at = UTC_TIMESTAMP(6),"
                + " mfa_verified_at = UTC_TIMESTAMP(6), version = version + 1 WHERE id = ?", id);
    }

    public void audit(String merchantId, String actorId, String action, String resourceType, String resourceId, Map<String, Object> changes) {
        jdbc.update("""
                INSERT INTO audit_logs (id, merchant_id, actor_user_id, action, resource_type, resource_id, changes, result)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'success')
                """, UUID.randomUUID().toString(), merchantId, actorId, action, resourceType, resourceId, json.writeValueAsString(changes));
    }

    private Mfa mfa(ResultSet rs, int row) throws SQLException {
        Long counter = rs.getObject("last_accepted_time_step", Long.class);
        return new Mfa(rs.getString("id"), rs.getBytes("encrypted_secret"), rs.getString("encryption_key_ref"),
                rs.getInt("attempt_count"), counter == null ? -1 : counter);
    }

    public record User(String id, String email, String fullName, String status) { }
    public record Company(String id, String code, String name, boolean requireMfa) { }
    public record Invite(String id, String merchantId, String userId, String email, String fullName,
                         boolean requireMfa, String status, Instant expiresAt) { }
    public record Mfa(String id, byte[] encryptedSecret, String keyRef, int attempts, long lastCounter) { }
    public record Ticket(String id, String userId, String status, Instant expiresAt, int attempts) { }
    public record DirectoryUser(String id, String email, String displayName, String fullName, String phone,
                                String avatarUrl, String language, String timezone, String status,
                                String signInMethod, boolean mfaEnabled, Instant lastActiveAt, Instant createdAt,
                                boolean isOwner, boolean canManageUsers, String departmentId, String positionId,
                                boolean requireMfa, boolean canInvite, String createdBy) {
        public DirectoryUser hidePhone() {
            return new DirectoryUser(id, email, displayName, fullName, phone.isBlank() ? "" : "••••••••",
                    avatarUrl, language, timezone, status, signInMethod, mfaEnabled, lastActiveAt, createdAt,
                    isOwner, canManageUsers, departmentId, positionId, requireMfa, canInvite, createdBy);
        }
    }
    public record DirectoryMembership(String id, String userId, String companyCode, String status,
                                      Instant validFrom, Instant validTo, String departmentId, String positionId, String departmentName, String positionName, boolean departmentDeleted, boolean positionDeleted) { }
}
