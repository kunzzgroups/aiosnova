## Role & Access database foundation (V14)

`src/main/resources/db/migration/mysql/V14__create_role_access_tables.sql`
was manually applied to the development database on 2026-10-21.
Do not rerun it on this database.

V14 creates `role`, `permission`, `user_role`, and `role_permission`.
Role names are case-insensitive unique within each merchant.
User-role assignments use a composite foreign key to enforce matching
merchant scope.

Manual database verification passed:
- Duplicate user-role assignments were rejected.
- Assignments with mismatched merchant scope were rejected.
- Deleting a role assigned to a user was rejected.
- After unassignment, deleting a role removed its role-permission
  associations while preserving permission records.
- Test data was rolled back successfully.

This migration adds the database structure only. Role APIs and frontend
integration are not implemented. Existing direct-grant authorization
remains unchanged.

## Selective employee reassignment during department removal

Removal impact responses now include `employees` (user ID, display name and source department/position) only for actors with both Organization management and employee-management/owner access. Aggregate counts remain available under the existing Organization read rules. The dialog lists affected employees without search, supports selection/select-all, stages department/position destinations for each selected group and provides Undo. Queued changes apply only when removal succeeds; unassigned employees retain removed placement references and appear under Needs reassignment.

`POST /api/identity/organizations/{id}/remove` accepts `employeeMappings: [{userId, departmentId, positionId}]` alongside the existing mode, version and impact snapshot. Each employee must belong to the affected subtree; IDs must be unique, and each destination must be an active position in an available department outside the subtree in the same company. All mappings are validated before writes. Reassignment, assignment history, audits and subtree removal share the existing transaction. Other-company placements/access stay unchanged. Legacy group mappings remain supported for older clients. No database migration is required; deploy/restart the backend with the frontend.

Verification: frontend build, Maven package and rolled-back MySQL checks passed for partial reassignment to different destinations, retained employees/removed markers, other-company preservation, unrelated/duplicate/foreign/stale/permission rejection, employee-identity privacy and legacy mapping. Browser interaction remains unverified; existing bundle warnings remain.

## Inactive placement labels

Directory memberships expose `departmentInactive` and `positionInactive` for existing placements, including inactivity inherited from ancestor departments. Employee view/edit fields show the existing localized Inactive badge beside the department/position field label; removed labels retain precedence. Selected names are truncated within the field and available through its title, keeping long values from overflowing adjacent fields. Selection values, assignment eligibility and account status are unchanged. No migration is needed. Frontend/Maven builds and rolled-back database checks passed for active placements, inactive positions, inactive ancestors and reactivation; rendered browser verification remains pending.

## Assignment reconciliation (V13)

V13 reconciles missing current assignment rows from company-scoped saved placements and effective company memberships. It excludes invited/removed employees and removed catalog records, retains inactive placements, starts repaired assignments on the current UTC date and records reconciliation audit events. Existing effective assignment rows are unchanged; reruns do not duplicate assignments or audit entries. Apply the SQL with application writes stopped. The local application through V12 has no V7 triggers; environments with those optional legacy triggers installed must review their inactive-placement restrictions before applying this repair.

V13 has been applied locally under merchant write locks; zero rows required repair because the current placements were already synchronized. No account/access changes were made. Runtime synchronization now checks assignment effective dates and repairs retained inactive placements on unrelated employee edits, using the membership/position snapshot taken before the edit. New placements and newly granted memberships retain active-department/position validation. Activation, employee edits and department reassignment continue to synchronize in their existing transactions.

Verification: Maven package and rolled-back MySQL fixtures passed for missing-row count recovery, reconciliation auditing/idempotency, unchanged inactive-placement edits, expired assignment recovery and rejection of new inactive placements. Browser flows remain unverified; the original Demo2 mismatch predates its profile-save repair and its precise trigger remains unconfirmed.

## Employee edit concurrency

Employee directory responses include `users.version`. Profile edits and status changes must submit the loaded version; missing versions return 400 and stale versions return 409 with `users.profileConflict`. The conditional profile update and settings, company access, placement, assignment and audit changes share one transaction. Company placement writes also advance the employee version so bulk reassignment invalidates open editors. The frontend keeps the editor open on conflict and asks the user to reload. No schema migration is required.

Verification: frontend build and Maven package passed. Rolled-back MySQL checks verified fresh saves, stale-version rejection without profile/access changes, missing-version rejection and placement version invalidation. Two-tab browser interaction remains unverified.

## Company-scoped Organization permissions (V9)

V9 has been applied to the configured development database. It adds the shared identity table `company_user_permission_grants` (merchant, company, user, permission). No existing employee-management grants or company memberships are copied into Organization grants. Existing owner access is preserved; other users default to no Organization access until explicitly granted `organization.read` or `organization.manage` for that company. Manage implies read, but neither permission grants company membership or access to another company.

All Organization reads and writes enforce these grants server-side, including batch replays. `GET /api/identity/organization-companies` keeps accessible companies and adds `canRead`/`canManage` for navigation; `GET /organizations` also returns these capabilities. Company switching remains independent. The frontend hides Organization navigation without read access and existing mutation controls without management access; direct URLs still enforce backend denial. Navigation capability failures default to hidden; opening the page uses the existing translated error/retry state.

The existing role/access pages remain mocked: this extends the backend's direct-grant model, not a database-backed role assignment system. Permission administration UI/API and audited grant delegation remain pending; do not assign grants from employee position names or employee-management toggles. No non-owner grants were provisioned. Restart the backend after updating. V7 remains pending and is not required by V9.

Verification: frontend build, Maven package and rolled-back database checks passed for owner access, default denial, independence from employee management, read-only mutation denial, manage-implies-read, company/membership scope and revoked batch retries. Browser interactions have not been verified; existing Vite chunk/import warnings remain.

# Deployed test-site owner shortcut

For the current unfinished deployed site, the existing login form can accept a fixed
six-digit test credential for one explicitly configured, already active database owner.
Enter the email and test code and click Sign in directly: **do not click Send OTP**.
This skips email OTP delivery and the MFA challenge for that credential only. Normal
OTP/MFA login remains available and MFA enrollment/policies are not changed.

After deploying this backend, set these **backend** environment variables/secrets:

```properties
TEST_LOGIN_ENABLED=true
TEST_LOGIN_EMAIL=your-existing-owner@example.com
TEST_LOGIN_CODE_SHA256=<lowercase SHA-256 of your chosen six-digit code>
TEST_LOGIN_EXPIRES_AT=2026-11-01T00:00:00Z
```

The example expiry is 1 November 2026, 08:00 Singapore time. Choose a suitable future
UTC expiry for your test window. Generate the hash locally in PowerShell 7 without
putting the code in command history:

```powershell
$testLoginCode = Read-Host 'Choose a private six-digit test code' -MaskInput
if ($testLoginCode -notmatch '^[0-9]{6}$') { throw 'Enter exactly six digits' }
[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($testLoginCode))).ToLowerInvariant()
Remove-Variable testLoginCode
```

Keep the hash in deployment secrets, never in frontend `VITE_*` variables or Git.
A six-digit hash can be guessed offline; treat it as a secret too. No code or hash is
preconfigured in this repository. The email must identify the existing active owner of
the backend's configured `LOCAL_MERCHANT_ID`. The account must have completed invitation
activation and any required MFA enrollment once; the existing login eligibility check
still applies before the shortcut. This feature neither creates/activates a
user nor grants ownership. No schema migration is needed. It works with the deployment's
existing backend profile/configuration; do not enable `LOCAL_TEST_LOGIN_ENABLED` for it.

The shortcut is disabled by default, fails startup on incomplete enabled configuration,
expires automatically, uses the existing persisted verification throttle (20 attempts per
email per 15 minutes), and issues an ordinary database session with a
`identity.session.deployed_test_login` audit event. Database owner/status/merchant checks
remain authoritative. Incorrect codes fall back to normal OTP verification.
Only use this while the deployed site contains test data. Turn `TEST_LOGIN_ENABLED=false`
and restart/redeploy when testing ends; existing sessions retain their ordinary lifetime
and disabling the shortcut does not revoke them.

Verification: three unit tests cover credential scope, incorrect codes, expiry, disabled/
incomplete configuration, inactive/non-owner/foreign-merchant denial and session/audit
creation. `mvnw.cmd '-Dmaven.repo.local=.m2/repository' clean test package` passed.
Deployed HTTP, browser and MySQL integration for this shortcut remain unverified.

# Deployed backend profile

Use `SPRING_PROFILES_ACTIVE=prod` to load `application-prod.yml`. This profile
uses Resend explicitly (no mock email fallback) and reads `DB_HOST`, `DB_PORT`
(default 3306), `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, `AUTH_STORAGE_KEY`,
`LOCAL_MERCHANT_ID`, `FRONTEND_URL`, `EMAIL_FROM` and `RESEND_API_KEY` from the
backend environment. It does not import `.env.local`. Set `FRONTEND_URL` to the
full frontend origin, for example `https://www.aiosnova.com`, without `/login`.
The existing `TEST_LOGIN_*` mappings remain in shared `application.yml`.

The login eligibility/MFA service is available in prod. Local invitation
controllers, mock inbox and local test-login endpoint remain excluded. Existing
accounts must already be activated; this does not add production invitation APIs.
Apply required database migrations separately; schema initialization is disabled.

Redeploy the backend to apply configuration changes. After the persisted send
limit expires, request one OTP and inspect backend logs and the Resend delivery
record. HTTP 429 means sending was blocked before contacting Resend. A successful
send response means Resend accepted the request, not confirmed inbox delivery.
Resend rejection logs include the HTTP status; connection/timeout errors are
logged separately. Never log or share OTPs, API keys or authentication keys.

# Backend development

## Department removal with employee reassignment (V12)

V12 has been applied to the configured local database after V11. It creates company-scoped employee placement records and backfills valid existing department/position references with their original IDs, including removed placements. Company access remains independent. New environments must apply V12 before using this backend. Employee placement edits now require `placementCompanyId`; the frontend adapter resolves the sidebar company to its database UUID. Clearing or changing placement affects that company only.

Department removal loads `GET /api/identity/organizations/{id}/removal-impact`, showing distinct affected employees (including pending/inactive accounts with effective company access), grouped by source position or department-only placement. Users may map those groups to active positions in an available department outside the subtree, or remove without reassignment. `POST /organizations/{id}/remove` rechecks company/Organization management permission, root version and the complete impact snapshot. Reassignment additionally requires owner or employee-management permission. Target validation, company-scoped placement updates, ended/new assignment history, audits and subtree soft removal commit in one transaction; stale impact and invalid/foreign destinations reject the whole operation. Company membership/access and other-company placements are preserved.

Retained removed placements show their actual names with a localized removed suffix, and employee listings provide a Needs reassignment placement filter and badge scoped to the selected company. The filter includes all account statuses when selected. Already removed departments are found through this employee filter and may be corrected using employee edit; the pre-removal batch mapping flow applies to departments still visible in Organization. No restore or post-removal batch reassignment flow is added.

Verification: frontend/Maven builds and rolled-back local MySQL checks passed for 50-person reassignment, two source-position mappings, other-company placement/access/assignment preservation, scoped employee saves, retain-mode markers/names, stale impact, foreign-destination rollback and permission separation. Browser interaction remains unverified. Email/Google and other directory capabilities retain their existing local/mock limitations.

## Organization soft deletion (V11)

V11 has been applied to the configured local database after V10. It adds nullable `deleted_at` and `deleted_by` to departments and positions, without changing existing rows. New environments must apply `V11__organization_soft_deletion.sql` before running this backend; no triggers or SUPER privilege are required. The schema reference is updated.

Department removal marks the department subtree and its positions in one transaction. Position removal also marks its row. Employee placement and assignment history remain linked to the original IDs; references/history no longer prevent removal. Executive positions managing a removed department are retained. Removing an executive still requires reassigning its visible managed departments; department positions still require their own inactive status for individual/bulk removal. Permissions, versions, transaction rollback and per-record audits remain enforced.

Normal catalog/structure/selection reads exclude removed rows. New assignments and placement changes cannot target them. Existing assignments and unchanged employee placement remain valid for historical display; employee reads retain the original references and expose removed markers, translated as Removed department/Removed position. No assignment history is transferred to newly created records. Uniqueness excludes removed records, so a reused name creates a new UUID and an empty department. The UI says Remove, retains cascade warnings, and omits irreversible-deletion claims. There is no restore UI or API.

Verification: frontend/Maven builds and rolled-back local database checks passed for retained subtree rows, employee placement and history, executive preservation, catalog/picker exclusion, removed markers, unchanged employee saves, name reuse/new IDs, new-assignment denial and stale-version rejection. Browser interaction remains unverified. Direct database writes remain an administrative responsibility; the previously deferred V7 trigger migration is still unapplied.

## Persistent employee deletion (V10)

V10 has been applied to the configured local database. It adds merchant-scoped `deleted_at`/`deleted_by` to `user_directory_settings`; existing rows remain unchanged. New environments must apply `V10__employee_directory_deletion.sql` after V9 before running this backend. It does not require the deferred V7 triggers or SUPER privileges.

`DELETE /api/identity/users/{userId}` and `POST /api/identity/users/bulk-delete` with `{userIds:[...]}` require a real backend session and current owner access. Only disabled employees in the owner's merchant can be deleted; the owner/self cannot be deleted. Bulk deletion prechecks all targets and commits atomically. Deletion persists a directory marker, clears placement, ends assignments/memberships, revokes merchant permissions/sessions and pending invitations, and audits each employee. Account and membership/assignment/audit history are retained; deleted records are excluded from directory reads and actor lookup. There is no restore/reinvitation flow for deleted accounts.

MSW passes deletion through to the backend; bulk deletion uses one request instead of sequential browser deletes. Confirmation copy explains retention in English and Chinese. Mock-only accounts cannot be deleted through this backend. Restart backend and Vite after updating. Other employee flows still use the existing local backend/MSW integration; this does not fix the separately identified employee-edit isolation gaps.

Verification: frontend build, Maven package and rolled-back local database checks passed for persistence, owner/inactive enforcement, protected accounts, merchant scope, bulk atomicity, ended assignment history, revoked sessions/grants and audits. Rendered browser interaction remains unverified.

## Employee position assignment synchronization

Employee edits and invitation activation now synchronize real position assignments with the saved placement and effective company membership. Pending invitations do not increase employee counts. Reassignment, clearing placement and removing company access end old assignments; repeated saves retain the current assignment. Availability is checked before creating assignments, using the same company lock as Organization writes. Assignment changes are audited and share the calling transaction. Membership activation uses the database UTC clock, matching membership eligibility checks.

Department/position deletion is blocked by saved employee placement references, including pending invitations, as well as assignment history. Moving a referenced position to another department is blocked. Employee edit pickers use the active company's real invitation catalog for authorized managers and preserve the existing selection when it is no longer selectable. No schema migration is required; existing saved placements synchronize on the next manager save, and no historical assignments are inferred automatically. The existing schema uses day-level assignment dates, so returning to the same position on the same day reuses that day's assignment row.

Verification: frontend build, Maven package and rolled-back local database checks passed for counts, duplicate-save prevention, reassignment/history, clearing, activation, company-access removal and inactive placement. Browser interaction remains unverified. Invitation delivery and several directory features remain local/mocked.

## Organization catalog (V4)

`src/main/resources/db/migration/mysql/V4__create_organization_catalog.sql` was applied to the configured MySQL development database on 2026-10-12. Do not rerun it. It creates `organization_departments`, `organization_positions`, and `organization_position_assignments`, and adds the scoped membership unique key. Department executive links use `executive_position_id`.

All three tables are initially empty. The schema was verified with 13 foreign keys and 8 check constraints; no existing data was backfilled.

### Organization codes removed (V5)

`src/main/resources/db/migration/mysql/V5__remove_organization_codes.sql` was applied on 2026-10-12. It removes department/position `code` columns and their unique indexes. All other values in 9 departments and 12 positions, and all 13 foreign keys, were preserved. Do not rerun V5. For a new database, apply V1 through V5 in order; preserve the already-applied V4. Company codes remain unchanged.

### Organization APIs

`V8__organization_batch_idempotency.sql` was applied on 2026-10-12 after V6; it does not require the deferred V7 triggers. Batch creation now requires a UUID `requestId`. The request key is scoped to merchant/company/actor, checked after current authorization, and recorded atomically with created IDs and audits. Identical retries reuse the created IDs and return current catalog data; using a key with different content returns 409. Failed transactions leave no completed-request record.

OrganizationPage keeps the same key when retrying an unchanged queued batch; changed content or a newly opened dialog starts a new request. Closing/reloading the page does not retain its queue or retry key. Successful position edits update the local record/version and close the dialog before refreshing related data. A refresh failure shows a saved-but-refresh-failed notice; its Retry button only reads data, and stale-data mutations stay disabled until refresh succeeds. Authentication/access errors clear cached catalog data.

Backend/frontend builds, rolled-back MySQL replay/scope/conflict checks and simulated frontend save/refresh failures passed. Browser rendering has not been verified. Restart the backend after updating; deployments must apply V8 before using the new batch contract.

Department availability now includes every ancestor's status. Deactivating a department preserves saved child statuses; children display inherited inactivity and previously active children become available again on reactivation. OrganizationPage confirms deactivation of departments with descendants from both the status toggle and edit dialog. New/moved positions are rejected if any department in their ancestor chain is inactive. Executive headers omit status controls; position status remains available in the Positions tab.

`V7__guard_inactive_department_assignments.sql` is prepared but **not applied**: the configured database account cannot create triggers while binary logging requires SUPER privileges. A database administrator must apply V7; server settings were not changed. It serializes assignment insertion/reassignment with company updates and blocks new active assignments under inactive branches, while preserving existing assignments and allowing them to end. Assignment CRUD remains unconnected to the UI. V1–V6 remain the applied schema baseline.

`src/main/resources/db/migration/mysql/V6__remove_position_description.sql` was applied on 2026-10-12. It removes the unused position `description` column; all other values in 12 positions and all 13 foreign keys were preserved. Do not rerun V6. New database setup must apply V1 through V6 in order. Department/position API records no longer expose codes or descriptions.

OrganizationPage now uses Spring JDBC APIs under `/api/identity`. Reads and writes require a real backend session; mock Google/password tokens are rejected. Reads require active company access and `organization.read` or `organization.manage`; writes require `organization.manage`. Existing owner access is preserved. Database company IDs are resolved by company code at the frontend adapter boundary while the existing company switcher remains mocked.

- `GET /organization-companies`: accessible active database companies.
- `GET /organizations?companyId=UUID`: departments and current management capability.
- `GET /positions?companyId=UUID&date=YYYY-MM-DD`: positions, distinct active employee counts and assignment-history counts.
- `POST /organizations`, `POST /positions`: create a department or position.
- `PATCH /organizations/{id}`, `PATCH /positions/{id}`: update using the current `version` in the request body.
- `DELETE /organizations/{id}?version=N`, `DELETE /positions/{id}?version=N`: delete an unreferenced record.
- `POST /organization-batches`: atomically create queued departments or positions for a company; executive position creation can include `managedDepartmentIds`.
- `POST /positions/bulk-delete`: atomically delete inactive positions using `{companyId, items:[{id,version}]}`.

The API preserves the frontend field `managerPositionId`, mapped to `executive_position_id` in MySQL. Company/merchant scope, hierarchy cycles, executive management, active department placement, stale versions and deletion dependencies are enforced server-side. Writes and their audit records share a transaction. Department and position records use UUID IDs; they do not expose separate codes.

Employee counts use `organization_position_assignments`, active effective company memberships and active users. Assignment CRUD, invitation/edit picker integration and migration of existing mock `department_ref`/`position_ref` values remain pending. Historical assignments prevent hard deletion; keep referenced positions inactive. No sample departments or positions are seeded automatically.

Development Vite proxies these organization routes to port 8080; MSW passes them through. Restart the backend and Vite after updating. Deployment must route these API paths to the backend; frontend build success does not establish production hosting or database connectivity.

Verification: Maven package, frontend build, rolled-back MySQL service checks for CRUD/hierarchy/counts/permissions/batch failures, and isolated HTTP checks rejecting mock sessions passed. Browser interaction with a real OTP/MFA session has not been verified.

## Saved user edits and sessions (V3)

Audit `changes` now stores JSON for new user profile, department/position CRUD, executive-management and invitation lifecycle events. Only changed fields are included as `{field:{before:...,after:...}}`; creation/deletion uses null for the absent side. Profile email, names, phone and avatar changes use `{changed:true,redacted:true}` instead of copying personal values. Authentication tokens, OTPs, MFA credentials and invitation messages are never included. Updates without business-field changes store `{}`.

Company changes include active memberships and pending invitation assignments. Audit inserts participate in their operation's existing transaction. Historical null entries cannot be backfilled reliably and are preserved. No schema migration is required. Maven package and rolled-back MySQL checks verified JSON persistence, before/after values, related management updates, pending company changes, redaction and no-op updates.

`src/main/resources/db/migration/mysql/V3__user_edit_permissions_and_sessions.sql` has been applied to the configured development database. Do not rerun it. It adds session merchant/CSRF hashes, merchant-scoped permission grants and directory settings.

OTP/MFA success issues a random 256-bit bearer token and an HttpOnly, SameSite=Lax session cookie. Token and CSRF hashes persist in MySQL; sessions expire after eight hours. Refresh restores the same session without extending expiry; logout revokes it. Cookies use Secure over HTTPS (local HTTP is development-only). Refresh/logout require the cookie and matching CSRF header. Backend requests re-read account status and grants; restricted MFA tickets and mock `access_<userId>` tokens cannot authorize edits.

`PATCH /api/mock/invitations/users/{userId}` saves profiles and company selections in a transaction with an audit event. The merchant comes from the session. Owners can edit everyone and grant/revoke user management. Grantees can edit other profiles/company selections and change Require MFA and Can invite users. Regular users can edit only their own basic profile; these two controls are hidden and omitted from their save requests. Company MFA policy cannot be disabled by the individual toggle. Status and user-management permission delegation remain owner-only.

User forms do not assign user-management permission; role/access assignment belongs on the dedicated role/access page. The backend checks `identity.users.manage` in `user_permission_grants`; connecting that page to these grants remains pending. This is one capability, not full production RBAC. Department/position references persist as UI catalog references; their catalogs and role assignments remain mocked. Unsent draft editing and deletion are unchanged.

A local owner activation invitation was sent to the running mock inbox for `demo@aios.dev`. Open `http://localhost:8080/api/mock/inbox?email=demo%40aios.dev` before restarting (messages are in memory) and save its activation link. Restart backend and Vite, open the saved link, enroll an authenticator, then sign in with email OTP and a fresh authenticator code. Mock Google sign-in still demonstrates the frontend but cannot authorize backend edits.

Java 21, Spring Boot 4.1.1, Maven wrapper.

## MySQL connection

The local profile uses MySQL 8.4, database `aiosnova`, username `aiosnova_user`. For this development database, keep the SSH tunnel open and set `DB_HOST=127.0.0.1` and `DB_PORT=13306` in `.env.local`. The existing manually created tables are not recreated, migrated or populated automatically.

Before starting from the `server` directory, copy `.env.local.example` to `.env.local` and fill in `DB_PASSWORD` locally, without surrounding quotes. This file uses Java properties format and is ignored by Git; do not share or commit it. Alternatively, set the `DB_PASSWORD` environment variable in your terminal. Java-properties passwords containing backslashes must escape them as `\\`.

`DB_HOST`, `DB_PORT`, `DB_NAME` and `DB_USERNAME` environment variables override the default connection values. MySQL connections use UTC for the existing `DATETIME(6)` schema.

After V1, apply `src/main/resources/db/migration/mysql/V2__persist_authentication_state.sql` once. V2 adds persistent MFA attempt counters, the enrollment/invitation link, invitation MFA requirements, login-ticket attempts and OTP rate-limit buckets. It has already been applied to the configured development database; do not rerun it.

Set `AUTH_STORAGE_KEY` to a base64-encoded random 32-byte key. A key has already been generated in the ignored `.env.local` for this workspace. Keep that same key across restarts and preserve it with your development secrets: changing or losing it makes existing MFA credentials unreadable and OTP verifiers invalid. The database stores only the key reference `local-v1`, not the key itself. Production requires managed secrets and a key-rotation procedure.

The existing services now call JDBC repositories. Invitations, users, activation memberships, encrypted MFA credentials, hashed OTP challenges, MFA tickets and throttle counters persist in MySQL. Build success alone does not verify the database connection.

From the repository root in PowerShell:

```powershell
cd server
$env:JAVA_HOME = (Get-ChildItem .tools -Directory -Filter 'jdk-*' | Select-Object -First 1).FullName
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:MAVEN_USER_HOME = Join-Path $PWD '.m2'
./mvnw.cmd '-Dmaven.repo.local=.m2/repository' spring-boot:run
```

The server listens on http://localhost:8080. The default `local` profile delivers OTP messages to an in-memory mock inbox. Frontend development Google sign-in uses the existing `demo@aios.dev` owner and its seeded database UUID for local testing; it does not authenticate with Google or activate the database owner. The former Google User, Ops Lead, MFA User and New Hire frontend demo records are no longer seeded.

The project-local `.tools` directory is ignored by Git. On another machine, install Java 21 and set `JAVA_HOME` to its installation directory before running the Maven wrapper.

Build:

```powershell
./mvnw.cmd '-Dmaven.repo.local=.m2/repository' package -DskipTests
```

## TAC cooldown and mock inbox

Start the backend, then run `npm run dev` from the repository root. Development TAC send requests and inbox reads use the backend; other requests still use the existing frontend mocks.

Activate an invited account first, click **Send OTP** on the login page, then open `http://localhost:8080/api/mock/inbox?email=your%40example.com` to read the message and its six-digit code. Unknown, pending or disabled accounts cannot request OTP. No message is sent to a real mailbox.

The backend permits one send per normalized email address every 60 seconds. Earlier requests return HTTP 429 with `Retry-After` and `resendCooldown`; rejected requests do not add inbox messages. Concurrent requests share the same cooldown check.

Cooldowns, challenge expiry, failed attempts and email/IP throttle counters persist across backend restarts and share database row locks across processes. Inbox messages remain in memory and reset on restart; save the invitation link or OTP before restarting. OTP/MFA login creates authenticated backend sessions stored in MySQL. Send limits remain five per email/hour and twenty per IP/hour; verification remains twenty per email/fifteen minutes. Cooldown-rejected send requests still count toward the send limit, matching the existing flow.

The inbox is available only in the `local` profile. To enable real delivery later, implement `EmailService` for the real provider and use a different profile.

## Local invitation email

Use the existing Users page as an owner or a user with invitation permission. Saving a draft does not send email; sending an invitation stores its message in the backend mock inbox before saving the invited user. The invitation uses the selected English/Chinese language and personal message.

Read `http://localhost:8080/api/mock/inbox?email=employee%40example.com` and open the `/activate?token=...` link in its body. The link displays the employee, assigned companies, seven-day expiry, and MFA requirement. Set `FRONTEND_URL` before starting the backend if the frontend is not at `http://localhost:5173`.

`POST /api/mock/invitations` sends the local invitation and returns its database user UUID; the frontend uses this UUID for the invited user and memberships. Company codes map existing frontend demo selections to the seeded database companies. `GET /api/mock/invitations/{token}` reads an unexpired invitation. Invalid and expired tokens return HTTP 410; a replacement invitation revokes the previous link and pending enrollment for that user. Both endpoints exist only in the `local` profile. Sending requires a backend session and owner, user-management, or invitation permission; the actual actor is recorded as inviter. The local merchant is selected by `LOCAL_MERCHANT_ID`.

Opening the link previews the invitation without consuming it. Completing activation consumes the invitation token; reusing it returns HTTP 410.

## Local activation and authenticator enrollment

For an invitation without required MFA, click **Activate account**. For required MFA, click **Set up authenticator**, scan the locally generated QR code (or enter the setup key manually), and enter a six-digit code from a TOTP authenticator before activation. The backend permits five failed enrollment attempts per invitation and prevents restarting setup from resetting that allowance.

Pending invited accounts cannot request or verify email OTPs. Successful activation enables OTP requests and updates the frontend mock user and its pending memberships. Activated employees use passwordless login; no default password is provisioned. An activated account can be recovered into the frontend mock login data after a page reload using the local backend account endpoint, but frontend directory/role data is still browser-memory mock state.

For an employee requiring MFA, login verifies email OTP first, returns a five-minute MFA ticket, then requires a new authenticator code on the existing MFA challenge page before issuing a backend session. MFA requirements include the explicit invitation setting and current active company membership policies. Enrollment and login use six-digit HMAC-SHA1 TOTP with 30-second steps and one step of clock tolerance. Accepted TOTP counters and login tickets cannot be reused; each ticket permits five failed attempts. Restricted `auth_sessions` rows represent single-use MFA challenges; active rows represent authenticated sessions.

Endpoints:

- `POST /api/mock/invitations/{token}/mfa/start`: creates or returns the same pending setup key and QR code.
- `POST /api/mock/invitations/{token}/activate`: consumes the invitation after successful activation; requires a valid authenticator code when MFA is mandatory.
- `GET /api/mock/invitations/account?email=...`: reads an activated local test account.
- `GET /api/mock/invitations/directory`: reads saved invited/activated employee profiles and pending/active company assignments for the configured local merchant. A backend session is required. Frontend adapters load saved users and assignments for lists and details. Unsent drafts and organization/role catalogs remain mocked.
- `POST /api/auth/mfa/verify`: verifies a backend-issued invitation account MFA ticket.

Invitation, activation, enrollment and MFA state persists across backend restarts. TOTP secrets use AES-256-GCM with a random nonce and account-bound authenticated data; OTP verifiers use server-keyed HMAC-SHA256 bound to the challenge UUID; high-entropy invitation and ticket tokens use SHA-256 hashes. Activation, membership creation and invitation consumption run in one transaction; user row locks serialize OTP and MFA consumption. Failed MFA attempts commit even when the API returns a rejection. Secrets are not sent to any external QR service.

This remains a local integration: email delivery, unsent drafts, organization/role catalogs, password login and Google login remain mocked. OTP/MFA sessions, profile edits, company selection and the user-management permission are backend/database-backed. MFA recovery and real Google OAuth are not implemented. A mock Google/password session cannot authorize database edits; activate the owner and use OTP/MFA login. Existing demo-account MFA and authenticated MFA settings screens still use their original frontend mocks. Previously issued in-memory invitations/accounts cannot be recovered into MySQL; create new invitations using the updated backend.

## Local Google-button test login

This is a localhost test shortcut, not Google OAuth. In this workspace, ignored `server/.env.local` has `LOCAL_TEST_LOGIN_ENABLED=true`, and ignored root `.env.local` has `VITE_LOCAL_TEST_LOGIN=true`. Restart both backend and Vite, then click Google sign-in. It issues an ordinary database-backed session for the existing active `demo@aios.dev` account without OTP/MFA; no user is created or activated, and permissions/company access are unchanged. To use another existing test account, set `LOCAL_TEST_LOGIN_EMAIL` in the backend local configuration. Non-owners need explicit company-scoped Organization grants.

`POST /api/auth/local-test-login` exists only in the local profile, with prod/production profiles excluded, and only when explicitly enabled (default false). It requires a loopback peer and host, a loopback configured frontend URL, an exact matching Origin, and no forwarding headers. Session creation and the `identity.session.local_test_login` audit event share a transaction. Do not expose the development server through a public proxy/tunnel or deploy the ignored opt-in settings. Production frontend builds never use the shortcut. This does not enable Google CRUD on the deployed website.

Mock sessions now skip Organization navigation capability requests, avoiding the 401/refresh cycle; database-backed Organization still requires a real session. Employees continues to combine database profiles/memberships with mock features.

Verification: frontend build and Maven package passed; local HTTP checks verified endpoint disabled by default, rejection of missing/external Origin, a real session and CSRF cookies, and an authenticated Organization database read. The verification session was revoked. Browser interaction and deployed authentication were not verified.

## Department subtree deletion

Deleting a department now deletes all descendant departments and their attached positions in one company-scoped transaction. The backend prechecks every affected position for any assignment history (active or ended), blocks the whole operation on dependencies, deletes positions before departments and departments from leaves upward, and audits each deletion. Executive positions managing the department remain intact. Confirmation counts include the entire subtree, with matching English/Chinese copy; the frontend removes the affected rows and refreshes the catalog separately. No schema migration is required.

Frontend build, Maven package and rolled-back database checks passed for nested deletion, historical-assignment blocking without partial removal, unrelated executive preservation and per-record audits. Restart the backend; browser interaction remains unverified.

## Employee directory read isolation

`GET /api/mock/invitations/directory` now requires the selected company's database UUID as `companyId`; optional `userId` requests an employee detail. The service rechecks the active actor and effective company membership (or existing owner access), selects employees assigned to that company, and filters memberships to companies accessible to the actor before serialization. Owners receive all active-company assignments for those employees; non-owners receive only shared-company assignments. Existing owner-profile and phone visibility rules remain. Own-profile details remain available within an authorized company context for existing account flows. Inaccessible companies return 403; unrelated employee details return 404. Responses use private/no-store caching. No schema migration is needed.

The existing MSW identity adapters resolve company codes to authorized database UUIDs. Users, user details, memberships and company-member reads return only records present in their authorized directory response; cached records from previous scopes are not returned. Employee pages reload on company/session changes and discard stale results. Local owner drafts remain browser mocks. Company/role catalogs and other directory features still use mocks; this does not establish production RBAC or replace existing merchant-scoped employee mutation permissions.

Verification: frontend build, Maven package and rolled-back database checks passed for company-scoped lists/details, viewer shared-company counts, owner full assignments, cross-company denial, revoked memberships, inactive accounts and existing phone redaction. Restart backend and reload the frontend. Browser interactions and deployed integration were not verified; existing build warnings remain.

## Directory loading efficiency

Concurrent employee list/membership/options loads share one in-flight backend directory request, keyed by session, resolved database company ID and optional detail user ID. Directory responses are not cached after completion: each reload still reaches backend authorization. Only company UUID/code mapping is reused within the session; permission flags are discarded, and the mapping is cleared on account/token changes. Authenticated user-detail loads no longer fetch the employee list just to infer permissions already present in the session.

The HTTP client and identity/Organization adapters accept AbortSignal. Employee list/detail and Organization loads cancel obsolete requests; scoped directory requests are also cancelled on company/session changes before merging into mock adapter state. Mapping failures are not retained. Backend permissions and isolation checks are unchanged.

Frontend build and source-based simulations passed for concurrent read sharing, fresh reloads, mapping reuse, cancellation and session cache reset. No latency benchmark or rendered browser interaction was performed; existing build warnings remain. The employee directory still uses the existing mixed backend/MSW integration.

## Organization-backed invitation placement

Company selections control account access and support multiple authorized companies. Department and position pickers independently use the sidebar company and load its real Organization catalog through `GET /api/identity/invitation-organization?companyId=<database UUID>`. That purpose-specific endpoint requires existing invitation/user-management/owner access and company access; it does not require or grant general Organization read permission. Only active departments with active ancestors and active department positions are returned. Company-level executives are not department position options.

The send API accepts multiple accessible companies, a separate `placementCompanyId` context and optional `departmentId`/`positionId`, validates their company/department relationship and current availability, and persists the selected UUIDs in existing directory settings. Invitation audits include the placement references. Local drafts remain browser mocks. This stores profile placement; creating historical `organization_position_assignments` and updating employee counts through assignment enrollment remains separate work. No migration is required.

Frontend/Maven builds and rolled-back database checks passed for real catalog linkage, invitation-only access, cross-company rejection, inherited inactivity and placement persistence. Restart backend/Vite; browser interaction remains unverified, and email delivery still uses the local mock inbox.

Multi-company access selection is restored. Placement context is independent of selected access companies; department/position UUIDs are validated against the sidebar company. Returned memberships include placement only where its real Organization company matches that membership, so choosing an Acme Retail position does not copy it into other companies. Frontend/Maven builds and rolled-back multi-company invitation checks passed; browser interaction remains unverified.
