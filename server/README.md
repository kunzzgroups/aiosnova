# Backend development

Java 21, Spring Boot 4.1.1, Maven wrapper.

From the repository root in PowerShell:

```powershell
cd server
$env:JAVA_HOME = (Get-ChildItem .tools -Directory -Filter 'jdk-*' | Select-Object -First 1).FullName
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:MAVEN_USER_HOME = Join-Path $PWD '.m2'
./mvnw.cmd '-Dmaven.repo.local=.m2/repository' spring-boot:run
```

The server listens on http://localhost:8080. The default `local` profile delivers OTP messages to an in-memory mock inbox.

The project-local `.tools` directory is ignored by Git. On another machine, install Java 21 and set `JAVA_HOME` to its installation directory before running the Maven wrapper.

Build:

```powershell
./mvnw.cmd '-Dmaven.repo.local=.m2/repository' package -DskipTests
```

## TAC cooldown and mock inbox

Start the backend, then run `npm run dev` from the repository root. Development TAC send requests and inbox reads use the backend; other requests still use the existing frontend mocks.

Click **Send OTP** on the login page, then open `http://localhost:8080/api/mock/inbox?email=your%40example.com` to read the message and its six-digit code. Any email address works in this local mock; no message is sent to a real mailbox.

The backend permits one send per normalized email address every 60 seconds. Earlier requests return HTTP 429 with `Retry-After` and `resendCooldown`; rejected requests do not add inbox messages. Concurrent requests share the same cooldown check.

Cooldowns and inbox messages reset when the backend restarts and apply to one backend process. OTP verification and session creation are not implemented in the backend yet; the frontend mock verification cannot verify these backend-generated codes.

The inbox is available only in the `local` profile. To enable real delivery later, implement `EmailService` for the real provider and use a different profile.
