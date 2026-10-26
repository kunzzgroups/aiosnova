# Knowledge catalog migration plan

## Superseded — normal database CRUD is the current direction

The user cancelled Mock-to-database migration. Do not import the 95-ID backup. Keep it only as an optional development backup. Export/check controls have been removed from Knowledge. Migration beans and endpoints require explicit ai.migration.preflight-enabled=true; the normal standalone entry point no longer enables them, and Vite/MSW no longer route them. Offline test sources remain for development, not normal user workflows.

Agent frontend list/detail/create/update/status/delete now use /api/ai/agents and SQL. Its knowledge options come from the SQL catalog; model-only edits omit unchanged bindings and submit the form-opening version. No seed/import runs at startup. Knowledge CRUD itself still uses Mock, and its assignment writes cannot silently update database Agent bindings. Completing normal Knowledge/template CRUD is separate follow-up work, not an import prerequisite for basic Agent persistence.

The standalone Agent merchant scope comes from ai.agents.merchant-id (AI_MERCHANT_ID, local default merchant-acme). This is local standalone configuration, not a substitute for authenticated Core company/merchant authorization. Later Core integration must supply trusted identity scope.

## Revised product rule — import paused

### Content schema and validation stage

### Transaction importer prepared — not executed

AiSnapshotImportRepository and AiSnapshotImportService provide insert-only transactional storage for all six entities and their links. The service validates a private snapshot copy, checks a trusted administrative merchant/company scope and re-runs database/model preflight before writes. It is registered for dependency injection but has no HTTP endpoint, startup hook or normal application caller. There is no UI Import button. Administrative scope must come from a trusted configuration/identity source, never be generated from the uploaded backup in a production caller.

AiSnapshotImportCheck runs real Spring transaction interception against simulated SQL storage, verifying all ID mappings, commits, late binding failure rollback, empty overrides and rejection before writes. AiSnapshotMySqlRollbackCheck is an opt-in manual real-MySQL test using only a generated seed fixture with randomized IDs. Its success scenario is explicitly rollback-only before any writes; its duplicate-binding failure scenario rolls back too. Neither scenario commits test records. The coding agent did not execute that MySQL test or the user's chosen 95-ID backup.

The user selected a 95-entity backup as the migration candidate. Keep that downloaded JSON unchanged. Agent/Knowledge frontend services still use Mock: creating SQL tables or running these checks does not make browser edits durable. Database import, production write APIs and both sides of the frontend assignment cutover remain outstanding.

006 adds ai_knowledge_templates (independent documents/skills/data-source JSON snapshots), ai_knowledge_template_visibility, ai_knowledge_skills and ai_knowledge_data_sources. Original live content IDs are preserved; template content entries have no IDs in the current Mock format and remain ordered snapshots. Template timestamps are SQL storage metadata because the Mock type has none. Company IDs on Skills/Data Sources must be derived from their parent base. Raw file bytes/vector indexes and connector credentials are not stored by these tables.

POST /api/ai/migration/preflight/snapshot now checks the full v1 snapshot in Java without SQL or mutations. It is followed by SELECT-only conflict checks across all six entity tables and fixed model availability checks. The controller is available only when the standalone preflight feature is enabled. This is structural validation, not production authorization or permission to import. No import endpoint exists. 006 is prepared but has not been executed by the coding agent.

Company Knowledge is owner-only. Cross-company distribution requires Promote to template, authorized Use template, and a new receiving-company base with fresh content IDs. Only then may that company's active Agents bind it. Legacy base `allowedCompanyIds` must not grant direct access. The existing visibility table is retained but must not enable direct sharing. No SQL schema or records are changed by this frontend adjustment.

The explicit Mock template-library overseer is active company-j1 admin. Other company admins are not global admins. Oversight includes templates shared beyond their owner, excludes other companies' owner-only private templates, and grants no adoption/edit/delete rights. Production identity integration remains separate work.

Earlier snapshots and sharing assumptions below predate this rule. Re-export after adoption/assignment tests before any import. Keep earlier backups unchanged.

## Current source of truth

- `src/modules/ai/mock/seed.ts`: Agent/base/document seed IDs and metadata; skills and data sources also live here.
- `src/modules/ai/mock/mockStore.ts`: mutable in-memory state. Base assignments are `agents[].knowledgeBaseIds`; document overrides are a `Map<documentId, agentId[]>`.
- `src/modules/ai/knowledge/services/knowledgeService.ts`: both default assignment and document override writes use that shared store.
- Only active Agents of the base owner's company are assignable. Read sharing in `allowedCompanyIds` does not grant assignment rights.
- No entry in the override Map means inherit. An entry with `[]` means explicit exclusion of all Agents. Nonempty entries replace the base defaults, never merge.
- `shared/assignment.ts` has a legacy link-array resolver that cannot represent explicit empty overrides. Do not use it to export or resolve migrated assignments without adding an override marker.
- The store itself is in memory, not SQL or localStorage. Refresh is not proof of durable Agent writes. Export the live store before reloading if current manual edits must be kept.

## Storage mapping

| Current value | Destination |
| --- | --- |
| Base metadata, same ID | ai_knowledge_bases |
| Additional readable companies | ai_knowledge_base_visibility; owner access is implicit |
| Agent base default IDs | existing ai_agent_knowledge_bases |
| Document metadata, same ID/base ID | ai_knowledge_documents |
| No document override | assignment_mode=inherit, no override rows |
| Explicit empty override | assignment_mode=override, no override rows |
| Explicit Agent IDs | assignment_mode=override, rows in ai_agent_document_overrides |

Preserve IDs (including legacy non-UUID IDs), created/upload/index timestamps, and model bindings. Normalize UTC timestamps consistently when writing MySQL DATETIME. A document's company comes from its base, not a client-supplied company value.

Catalog-only schema intentionally excludes file bytes, vector indexes, skills and data-source payloads. Base display health/counts are derived from contents; do not store seed `status` as authoritative live health. Keep skills/data and their statuses in the export until corresponding storage is implemented. Never imply their migration is complete or switch the entire Knowledge UI at this stage. Browser `blob:` URLs are not durable file locations; flag them in export and arrange file upload separately.

## Import and cutover sequence

1. Export a versioned live snapshot containing bases, agents, documents, documentOverrides (serialize Map entries including empty arrays), skills and data sources. Keep an unmodified backup. Do not export only the seed constants.
2. Dry-run validation: duplicate IDs, lengths, missing bases/documents/Agents, cross-company links, inactive Agent assignments, invalid model bindings, unsupported timestamps, blob URLs, and conflicts with existing SQL records. Report errors; do not silently drop bindings or generate replacement IDs.
3. Do not trust arbitrary browser imports as an authorization source. Local developer migration must be an explicit administrative operation. Normal writes must use server-side catalog ownership checks.
4. Import bases and visibility, Agents/configs and base defaults, then documents and document override rows. Use one transaction for the approved bounded snapshot; abort all writes on conflict or failure. No blind upserts over existing SQL data.
5. Compare IDs, metadata, visibility and exact base/default/override sets before and after; explicitly test inherit vs empty override vs nonempty override, owner vs shared readers, Agent deletion and status changes. Resetting an override must update its marker and delete its rows in one transaction. Deleting the last assigned Agent must leave the document in override mode.
6. Implement repositories, trusted ownership checks and APIs; cut both sides of assignments over together. Leaving Agent writes in SQL and Knowledge assignment writes in Mock would produce inconsistent views.
7. Retain backup/export and Mock until the imported snapshot and all dependent screens are verified. Complete skills/data/file storage migration before claiming full Knowledge persistence.

## Current stage

005 is schema only. It has not been executed or tested against MySQL by the coding agent. No importer, export UI, POST endpoint, or frontend cutover is included in this stage.
