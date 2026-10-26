# Knowledge and Template normal persistence

Normal page operations use `/api/ai/knowledge` on the local Java AI server (8081). They do not use the Mock snapshot importer or seed records. Existing database IDs are retained; new items and adopted copies receive UUIDs.

## Enable locally

1. Tables from `004`, `005`, and `006` must already exist.
2. Execute `007_create_ai_knowledge_files.sql` **once**, as the local database schema administrator, against `aiosnova_ai_local`. It adds two composite unique indexes and the attachment table. It does not import or seed data. Do not rerun `004`–`006` on existing tables.
3. Restart the Java standalone application with the existing private environment configuration. Restart Vite because its proxy configuration changed.
4. Create a Knowledge base from the page. Refresh and confirm its name and ID remain. Add a document or other content and refresh again.
5. As J1, Promote a base and select J2 as recipient. Refresh Templates. As J2, Use template, refresh Knowledge, then assign an active J2 Agent. Refresh both pages.
6. Change or delete the original and confirm the adopted J2 base and attachments remain independent. Templates also hold independent snapshots; editing the original does not republish an existing template.
7. Test a document inheriting base Agents and a document explicitly assigned to no Agents. Empty override is stored as `assignment_mode=override` with zero link rows; `inherit` restores defaults.

## Scope and permissions

The standalone server's trusted local role policy mirrors the previous demo roles: J1 admin, J2/retail editor, wholesale viewer. `AI_KNOWLEDGE_COMPANY_ROLES`, `AI_TEMPLATE_OVERSEER_COMPANY`, and `AI_MERCHANT_ID` configure that server scope. Roles are not accepted from browser request bodies. Unknown companies are denied.

Knowledge is owner-company-only. Admins may Promote their company's base. Editors/admins may Use a template explicitly shared to their company, producing a new company-owned base with new content IDs and no copied Agent bindings. Template edit/delete is owner-only with the corresponding role. J1's library oversight includes other companies' shared templates, excludes private owner-only templates, and does not grant adoption or editing rights.

This is the loopback standalone development policy, **not authenticated per-user Core authorization**. Core integration must supply memberships/roles from the authenticated principal instead of this local policy. No Core identity/security files are changed here.

## Stored content versus processing

Attachment bytes (up to 10 MB each) are stored in MySQL, linked to a document, Skill, Data Source or template with cascading deletion. Promote and Use template copy attachment bytes inside the same transaction. They do not retain browser `blob:` URLs or point receiving copies at the original owner's files.

This work saves catalog/configuration/assignments/files. It does not implement document parsing, embedding/vector indexing, Skill execution, external connections, or credentials. New file documents remain Processing until a real ingestion worker handles them; Data Sources remain Disconnected until a real connector checks them. No timer pretends they completed. Stored metadata without indexed content is excluded from Assistant evidence.

## Automated checks

From the repository root:

```powershell
npm run build
node scripts/check-knowledge-persistence.cjs
node scripts/check-agent-persistence.cjs
```

From `server`, using the already generated test classpath:

```powershell
.\mvnw.cmd -q -DskipTests test-compile
java '@target/ai-check-classpath.args' com.aiosnova.ai.AiKnowledgePersistenceCheck
java '@target/ai-check-classpath.args' com.aiosnova.ai.AiAgentPersistenceCheck
```

The frontend checks simulate HTTP. The Java check uses the real Service/Spring transaction proxy with simulated SQL storage, including late Promote/Adopt failure rollback. These checks do not establish that a live MySQL schema or running process has been updated. Execute the local schema step and browser checks above for that verification. No Mock import is needed.
