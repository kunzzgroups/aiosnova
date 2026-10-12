# Organization database design

Current design for the existing MySQL 8.4 backend after V4–V6 and V8 (V7 deferred). Companion SQL: `organization-schema-draft.sql`.

V6 removes the unused position description. New database setup applies V1 through V6 in order; preserve applied migrations.
The reviewed DDL was promoted to `../src/main/resources/db/migration/mysql/V4__create_organization_catalog.sql` and applied to the configured development database on 2026-10-12. Department/position CRUD and OrganizationPage integration are implemented; employee assignment APIs and reference migration remain pending. Do not rerun V4 or V5. V5 removed department and position codes; company codes remain unchanged.

## Existing foundation

- Reuse `merchants`, `companies`, `users`, `company_memberships`, `audit_logs`, and `user_permission_grants`.
- Company membership controls company access; assigning a position must not grant company access.
- Owners can access their merchant's companies without an individual company membership.
- V3 `user_directory_settings.department_ref` and `position_ref` contain mock catalog references scoped to merchant/user, not company. Preserve them until real catalog IDs and assignment APIs replace them.
- MySQL is the previously selected project database, despite the generic database standard specifying PostgreSQL.

## Tables

| Table | Purpose |
| --- | --- |
| `organization_departments` | Company departments, parent hierarchy, active/inactive status, and managing executive position |
| `organization_positions` | Company positions; department placement or company-level executive placement |
| `organization_position_assignments` | A user's position assignments within an existing company membership, including effective dates and assignment history |

Use canonical UUID strings, UTC `DATETIME(6)` timestamps, existing status conventions, and optimistic-lock versions. New catalog tables include actor references; backend writes changes and their audit events in the same transaction.

## Hierarchy and levels

- A department's nullable `parent_id` refers to another department in the same merchant/company. Subdepartments use the same table.
- A position with `department_id` belongs to that department and has `manager` or `staff` level.
- A position with no department is company-level and has `executive` level.
- A root department's nullable `executive_position_id` refers to a company-level executive position in the same merchant/company.
- One executive position can manage multiple root departments. An executive employee is a user assigned to that position; do not store an employee ID as the department manager.
- Subdepartments inherit management through their parent. They do not store an additional manager reference, matching the current dialog.
- The frontend's `organizationId` maps to `department_id`; `managerPositionId` maps to `executive_position_id`.

Example: CEO is a company-level executive position; Sales and Operations reference its position ID. IT is a root department; Infrastructure references IT as its parent.

## Integrity and service rules

Composite foreign keys include merchant/company scope to prevent cross-company links. Position placement/level and department placement checks are database constraints. All foreign keys restrict deletion.

The backend must additionally enforce rules that involve traversing or reading other rows:

- Reject hierarchy cycles, including indirect cycles. Serialize concurrent hierarchy changes using the company's row lock so two requests cannot each create one half of a cycle.
- Only company-level executive positions can manage departments. Validate both manager assignment and position placement changes, so a managing executive cannot be converted to a department position without reassigning its departments.
- New/moved positions require the department and all ancestors to be active. An inactive parent makes descendants effectively inactive without overwriting saved child or position statuses; reactivation restores availability according to their saved statuses.
- V7 contains guards for new active assignment insertion/reassignment under inactive branches, but is not applied because the configured account lacks the trigger privileges required with binary logging. An administrator must apply it; existing assignments and assignment ending remain unaffected.
- Match existing name uniqueness rules before adding name constraints. Department/position codes were removed by V5; names are not company-wide unique. Duplicate names within one queued batch are rejected.
- Position assignment dates cannot overlap for the same membership/position. Use a company-membership row lock when updating assignments; multiple different positions remain possible without duplicating company membership records.
- Block catalog deletion while referenced by child departments, positions, managed departments, or assignment history. End assignments and deactivate catalog entries to preserve history.
- Apply optimistic locking with `WHERE id = ? AND version = ?`, incrementing version on successful writes.
- Resolve merchant and company access from the authenticated session on every read/write. Recheck active account, merchant/company lifecycle, current company membership, and company-scoped Organization read/manage grants. Schema isolation is not a replacement for authorization.
- Validate and save a bulk department/position request in one transaction; failures must not leave a partially created batch.

## Employee counts

Counts are computed, not stored on positions. Count distinct users whose company membership is active, whose account is active, and whose position assignment is active and effective on the requested date. Company-level positions use the same assignment/count logic as department positions.

The SQL example returns counts scoped to one merchant/company. The backend should accept a business date rather than infer it from the database server's timezone. It must check membership effective timestamps using a separate UTC instant.

## Migration and integration sequence

1. Confirm the actual development schema and that V1–V3 are present. The draft is not safe to blindly rerun.
2. Promote reviewed SQL to the next available migration version; do not rewrite V1–V3. MySQL DDL implicitly commits, so stop on the first failure and inspect completed statements before recovery.
3. Create the real department/position catalogs with backend-generated IDs; do not treat browser mock IDs as database UUIDs.
4. Establish an explicit mock-reference-to-real-ID mapping before migrating existing directory references. Do not guess matches from display names or populate every company with merchant-level references.
5. Add organization repositories/services/endpoints with company authorization, audit events, transactions, and assignment APIs. Update user invitation/edit flows to use company-scoped catalog IDs.
6. Switch the frontend from organization mocks to these APIs, then retire the old directory references only after verifying all consumers have migrated.

V4 has been applied and verified (13 foreign keys and 8 check constraints). Department/position CRUD, transactional bulk operations and database employee counts are connected to OrganizationPage. No reference backfill or assignment CRUD has been implemented; invitation/edit selectors and the company switcher still use their existing mock catalogs. See `../README.md` for endpoint contracts and verification limits.

## Batch retry safety (V8)

`organization_batch_requests` stores request hashes and created IDs scoped to merchant, company and actor. V8 was applied independently of pending V7. Batch creation and its idempotency result commit together; a replay rechecks access and returns current catalog data with the original created IDs. No request bodies or personal data are retained. The frontend retains its retry key for an unchanged queue within the current dialog.

## Company-scoped permissions (V9)

V9 is applied. The shared identity `company_user_permission_grants` table stores explicit grants scoped to merchant/company/user. Organization read requires `organization.read` or `organization.manage`; mutations require `organization.manage`. Existing owner access is preserved. Membership is still required for non-owners, and `identity.users.manage` is no longer an Organization grant. No non-owner permissions were backfilled; role assignment/admin UI remains pending.
