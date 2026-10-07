# Backend development

## Saved user edits and sessions (V3)

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
