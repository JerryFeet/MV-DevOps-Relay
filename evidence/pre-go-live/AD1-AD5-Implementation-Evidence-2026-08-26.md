# AD1–AD5 implementation evidence — 2026-08-26

## Delivered scope

- Added a durable Waha replacement-request lifecycle. A lost credential creates a
  reviewable request; an administrator must approve it before replacement
  payment can begin; verified payment settlement records the request as paid.
- Added a consolidated, admin-only pending-items API with the seven required
  operational queues. Tenant renewals are deliberately excluded.
- Added a per-account approval-alert routing preference and an admin user
  management toggle. Waha replacement submissions notify every opted-in
  administrator through the existing email/push notification outbox.
- Added a responsive bilingual attention panel and replacement-review controls
  to the admin portal.
- Removed the resident maintenance route and visible navigation/home entry
  points. Direct navigation now resolves to the portal 404 page.
- Added expected-state conflict guards to permit, Waha rejection, unit
  verification approval, communication status, and ownership-rejection paths.
  Ownership approval remains serialized by its existing shared terminal release
  engine and now persists the approved event outcome.
- Updated the OpenAPI contract and regenerated React client and Zod artifacts.

## Schema safety

- Created forward migration `0044_ad_console_approval_routing.sql`.
- Regenerated the canonical baseline catalog to include its enum, table,
  preference column, indexes, and foreign keys.
- Replayed the updated baseline into a disposable empty local PostgreSQL
  cluster. The replay catalog contained `waha_replacement_request_status`,
  `waha_replacement_requests`, and `receives_approval_notifications`.
- After the replay check, the exact 0044 SQL was manually applied to the
  development database as one `BEGIN … COMMIT` transaction. No `db:push`,
  automatic migration, reset, data rewrite, production access, or production
  migration was used.

## Final validation

| Check | Result |
| --- | --- |
| API type check | Passed |
| Portal type check | Passed |
| OpenAPI/client/Zod generation | Passed |
| H4 schema protection assertions | Passed |
| API test suite | 97 files passed; 1,383 tests passed; 21 skipped; 0 failed |
| Portal test suite | 67 files passed; 1,358 tests passed |
| Full portal E2E suite | 81 passed; 4 skipped; 0 failed (4.9 minutes) |
| Browser smoke | Passed: resident home exposed no maintenance entry; direct `/portal/maintenance` returned 404; no browser errors |
| Source whitespace validation | `git diff --check` passed |

## Browser evidence

- `69xuau` — signed-out public route had no visible maintenance entry.
- `o850t3` — retired `/portal/maintenance` route rendered the portal 404 page.