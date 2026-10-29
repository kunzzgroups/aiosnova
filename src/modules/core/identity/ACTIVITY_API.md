# Activity frontend API contract

## Integration status

Activity now uses the shared HTTP client for list, filter options and detail reads.
The Spring Boot backend writes audit events but does **not** expose these read
routes yet. These are proposed frontend contracts served by MSW in development,
or when `VITE_ENABLE_MOCK=true`. They never query the database audit log. Without
MSW, the page reports an unavailable/failed endpoint instead of falling back to
static records. No backend or database migration is included in this change.

The handlers use the existing mock company catalog. Preview records currently
belong only to `company-retail`; other known active companies return empty lists.
Mock access is restricted to the current owner session and known demo companies.
This is a conservative **preview rule**, not a production audit permission policy.
The backend must authenticate independently, resolve its own merchant/company
IDs, enforce audit-read permission and company scope, and redact sensitive data
before these contracts can be connected to real audit records. Frontend session
flags, catalog IDs and MSW checks are not backend authorization.

## Requests

All reads use authenticated `apiRequest`, `cache: 'no-store'`, cancellation signals
and `Cache-Control: private, no-store` in mock responses.

### `GET /api/identity/activity`

Scope query: `scope=merchant` (owner preview, omits `companyId`) or
`scope=company&companyId=...`. Omitting `scope` retains company behavior.
The service uses an internal `merchant` scope key but never sends it as a company ID.
All routes apply the same scope validation. Company scope excludes merchant events;
merchant scope aggregates merchant events and its companies' events.
Optional query:

| Parameter | Meaning |
| --- | --- |
| `page` | One-based page, default 1; out-of-range pages clamp to the last page |
| `pageSize` | Integer 1–200, default 10; Auto resolves to a measured size before requesting |
| `query` | Up to 500 characters; case-insensitive search of employee, email, target, action and module |
| `actor` | Stable actor ID from the filter-options response; not employee display name |
| `module` | `employees`, `organization`, `roles`, `system` |
| `action` | `created`, `updated`, `deleted`, `login` |
| `result` | `success`, `failure` |
| `from`, `to` | Optional ISO calendar dates `YYYY-MM-DD`, inclusive, interpreted in Asia/Singapore |

Omit unselected filters instead of sending `all`. Invalid dates, reversed date
ranges, unknown enum values and invalid pagination return 400. Sorting is fixed
to occurrence time descending, with ID as a stable tie-breaker. The mock search
also recognizes the existing English and Simplified Chinese action/module labels.

Response: `{ items: ActivitySummary[], total, page, pageSize, source }`.
`source` is `mock` for these handlers; a future backend adapter must report its
actual source. Summaries omit `changes` and `email`. Display translation keys in
the current UI-facing model are provisional; map future backend domain codes in
the service layer rather than making audit storage depend on frontend translations.

### `GET /api/identity/activity/filters?companyId=...`

Returns `{ companies: [{ value, label }], actors: [{ value, label }], modules, actions, results }` for the full
authorized company scope, independent of page and active filters. A failed
options request has its own retry action and does not masquerade as an empty list.

### `GET /api/identity/activity/{id}?companyId=...`

Returns `ActivityEvent`, including email and change details. Selection and its
request are independent of pagination, so the selected details stay open while
turning pages. A record absent from this company scope returns 404, even when its
ID exists in another company. Filter submit/reset closes selection as before.

Types: [types/activity.ts](types/activity.ts). Service:
[services/activityService.ts](services/activityService.ts).

Events include `scopeKind: merchant | company`. Merchant preview events have empty
`companyId`/`company`; company events include both. Owner UI defaults to the entire
merchant and uses the filter response's company options. Scope changes reset filters,
pagination and details. The aggregate table and every detail show the event scope.
Company-only tables omit the duplicate scope column. Employee backend grants and
scope discovery are not implemented here; the mock remains owner-only. Real backend
responses must restrict company options and records using database authorization.

## UI request states

- Loading, successful empty results and failed requests render separately.
- Network/5xx failures have Retry. 401/403/404 do not invite blind retries.
- Detail loading/error/not-found appears inside the sidebar; Close stays available.
- Company/session changes hide old rows, options and details immediately, cancel
  prior requests, reset filters/page/selection and ignore late responses.
- New selections cancel previous detail requests. A list page change does not
  change the selected detail request. First entry and refresh start with no selection.
- Auto sizing keeps full pages fitted and partial pages at the same row density.

## Verification limits

Run `npm run build` for TypeScript/Vite validation. The repository has no npm test
or lint script. Node/MSW contract checks can exercise the real service and shared
HTTP client against these handlers, including pagination, company isolation,
filtering, detail failures, cancellation and retry after failure. Browser layout
and real backend/database integration require separate verification.
