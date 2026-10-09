# Invitation and login database foundation

Target: Oracle MySQL 8.4, existing empty `aiosnova` database.
V1 defines the foundation; the local backend now connects through JDBC and uses these tables for invitation, activation, OTP and MFA state.
The user explicitly selected MySQL; repository standards otherwise specify PostgreSQL.
V1 inserts no demo users, passwords, application grants or company data.

## Local demo seed

After V1, run `server/database/seed_local_demo.sql` once in Workbench against the empty local database. This separate development script inserts the existing `demo@aios.dev` owner, Acme merchant and five frontend demo companies. Retail requires MFA; the other four companies do not. The final query returns five company rows.

The owner remains invited and the merchant pending until backend owner onboarding and mandatory MFA are implemented. The existing frontend demo login remains mocked; this seed does not create a password, MFA secret, invitation or authenticated backend session. Frontend mock IDs are not database IDs: the script uses fixed canonical UUIDs, with company codes identifying their frontend counterparts.

Execute with Workbench's stop-on-error option enabled. If a statement fails before COMMIT, run ROLLBACK in the same connection and inspect the error; do not execute the remaining statements or blindly rerun the script. The script is not an automatic startup seed or a production migration.

## Workbench: create the tables

1. Open the existing connection to the assigned development database.
2. Run `USE aiosnova;`, `SELECT DATABASE(), VERSION();` and `SHOW TABLES;`.
   Expect aiosnova, MySQL 8.4 and an empty table list.
3. Open `server/src/main/resources/db/migration/mysql/V1__create_invitation_login_foundation.sql` using File > Open SQL Script.
4. Double-click aiosnova in Schemas to select it as the default schema.
5. Execute the entire migration once. Stop on the first error.
6. Refresh Tables, then execute the read-only `server/database/verify_foundation.sql`.
   Expect ten base tables and no missing table rows. Review the constraints result too.

MySQL DDL implicitly commits. A later statement failing does not undo earlier created tables.
Do not blindly rerun, drop tables, or disable foreign keys to recover. Save the error and inspect what succeeded.
The migration deliberately has no IF NOT EXISTS clauses, so it cannot silently accept conflicting existing tables.

## Ten tables

| Table | Purpose |
|---|---|
| users | Shared account/profile, verified email and global lifecycle |
| merchants | Workspace with exactly one non-null owner reference |
| companies | Merchant-owned companies and company MFA policy |
| company_memberships | Company selection access and company employee listing |
| invitations | Owner/employee drafts, sender, hashed verification token, delivery and acceptance |
| invitation_company_assignments | Company access proposed in an invitation |
| otp_challenges | Expiring single-use email login challenges and attempt counters |
| user_mfa_methods | Pending/verified/revoked MFA credentials |
| auth_sessions | Restricted onboarding sessions, authenticated sessions and revocation |
| audit_logs | Append-only identity/security activity, written by backend |

All primary IDs are canonical UUID strings supplied by the backend; choose one generation strategy.
Email uniqueness is case-insensitive and accent-sensitive. Backend must trim/lowercase before storing and validate addresses.
Timestamps are UTC DATETIME(6); application connections must set session time_zone to +00:00.
Mutable tables have a version field: optimistic locking requires backend implementation.
Foreign keys restrict deletion; important identity history is retained.
Composite merchant/company/invitation references prevent cross-merchant assignments.
Audit logs deliberately have no mutable timestamp or version; runtime authorization/privileges must prevent audit editing.

## Required backend behavior

### Owner onboarding

Create an invited user and pending merchant referencing that user, then create the platform-issued owner invitation.
Use a traceable platform_actor_ref, never a fixed anonymous admin account.
The service must verify the owner invitation user/email match merchants.owner_user_id; a foreign key alone does not prove this.

Acceptance verifies email and records accepted_at. Owner has restricted onboarding access until MFA enrollment and verification succeed.
Owner MFA is mandatory regardless of company policy; derive it from merchant ownership rather than a toggle.
Future owner sessions require login OTP plus MFA. Never activate a session based solely on invitation acceptance.

### Employee onboarding

Only the owner can manage invitations in V1. Delegated administrators remain unavailable until scoped permissions are implemented.
Save company selections in invitation_company_assignments. Do not provision memberships for a draft.
On acceptance, resolve/create the email account, verify the invitation and expiry, and activate selected company memberships in one transaction.
Users must have accepted an authorized invitation before login OTP delivery; do not recreate the current mock's any-email behavior.

An employee with memberships can select those active companies and appears in each company's employee page.
No role tables exist in V1: ALL business-module access is denied by default. Membership alone is not HRM or other business authorization.
The empty shell may show its company switcher and own profile; employee-directory access itself is restricted to the owner.
Require MFA if ANY active company membership in an active company requires it. Re-evaluate policy on requests and membership/policy changes.
Company membership ended status disables that company access even if a session is still valid.

### Security and consistency

The schema stores state; backend must check user/merchant/company status, membership, expiry, replay and permission on every relevant request.
Prevent duplicate open invitations transactionally; ensure inviter belongs to and is authorized for the target merchant.
Owners can access all their merchant's companies without individual membership rows.
One user/company membership is enforced; reactivation updates that row and records history through Audit.
The product currently uses one merchant; backend bootstrap must prevent accidental creation of additional workspaces.
Company group linkage is not represented yet. A later migration will add groups and nullable group_id with same-merchant constraints.
Department/position columns are deferred until their referenced tables exist, rather than creating unvalidated IDs now.

Store random high-entropy invitation/session token hashes, never raw tokens.
Six-digit OTPs need a salted strong verifier or server-keyed HMAC; do not use plain unsalted SHA-256.
Apply atomic attempt/consumption updates, expiry, resend throttling and rate limits. Purge expired challenge/session records by retention policy.
MFA uses authenticator-app TOTP only. The table therefore needs no method selector or generic credential JSON.
Encrypt each user's randomly generated TOTP secret with an external managed key; encryption_key_ref identifies that key, not its contents.
Generate the enrollment QR code from the secret on demand; do not store the QR image or provisioning URI in the database or logs.
Verify an authenticator code before setting the enrollment active. Use a consistent provisioning/verification configuration (initially SHA-1, six digits, 30-second steps).
Atomically compare/update last_accepted_time_step for enrollment and later verification; reject previously accepted or older steps to prevent replay, including concurrent requests. last_used_at alone is not a replay counter.
Do not store authentication secrets in audit changes, API responses, frontend env variables or Git.
TOTP verification, rate limits, recovery and required enrollment enforcement remain backend work before deployment.
Restricted sessions permit only approved onboarding/profile/logout endpoints and must expire.
User disable must revoke sessions. Access checks must continue to validate current policy after session issuance.
Audit sender/actor and sanitized changes for acceptance, grants, revocation, session/security changes; nullable actors identify system/anonymous events.

## Later integration

The backend uses Spring JDBC and MySQL Connector/J with the local datasource configuration. It does not execute migrations automatically; no JPA or Flyway has been added.
Apply `V2__persist_authentication_state.sql` after V1 for persistent enrollment/ticket attempts, explicit invitation MFA policy and throttle buckets. V2 has already been applied to the configured development database. Preserve V1 and the existing seed data.
When adding Flyway, use location `classpath:db/migration/mysql`.
If manually applied first, inspect the full schema and deliberately baseline at version 1 before applying V2; do not automatically baseline arbitrary databases.
Once V1 is applied to a shared database, preserve its contents and introduce changes as V2/V3 migrations.
Follow server/README.md for Java/backend checks when backend integration starts.

## Verification limits

Static verification checks table count, foreign-key creation order and matching column types,
unique referenced keys, unique constraint names and absence of destructive/data-writing SQL.
The configured MySQL 8.4 development database contains V1, V2 and the local demo seed. JDBC activation, OTP, cooldown, throttling and pending-MFA persistence were checked inside a transaction whose temporary records were rolled back. Full end-to-end MFA login verification remains outstanding.
UsersPage directory data, invitation authorization and authenticated sessions continue to use frontend mocks; the invitation bridge now uses database UUIDs and seeded company codes.
