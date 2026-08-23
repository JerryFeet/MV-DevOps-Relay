# Stage 6A — Implementation and Development Migration Verification

**Date:** 2026-08-23  
**Scope:** Stage 6A release-engine substrate only  
**Deployment status:** Not deployed. No Stage 6B or Stage 6C work was started.

## Delivered behavior

- Added one shared, server-only tenant/owner release engine with a common deterministic resolver for dry-run and execution.
- Uses a serializable transaction, a per-unit advisory lock, trigger locking, immutable idempotency keys, and in-transaction postcondition checks.
- Tenant releases revoke the active tenant Waha application and credentials, archive active unit residents as `moved_out`, cancel only future bookings, revoke future-validity Day Passes, scrub dependent PII, clear the tenant link, and remove the local user.
- Owner releases are isolated from tenant/family resident, tenant booking, vehicle, and Day Pass records.
- Retains payment attempts and Day Pass history while nulling departed-user references.
- Adds immutable `release_operations` audit records and a durable Clerk deletion-job outbox.
- Adds a retrying external-identity worker. A Clerk `404` is idempotent success; repeated failures become `failed` and are visible/retryable through admin-only APIs.
- Adds nullable-user guards to booking, payment, permit, vehicle, verification, and Waha read/write paths.

## Automated verification

| Check | Result |
| --- | --- |
| API type check | Passed |
| DB package type check | Passed |
| API production build | Passed |
| Stage 6A focused suites | 2 files, 7 tests passed |
| API regression suite | 91 files, 1,446 tests passed |
| API health endpoint after migration | `{"status":"ok"}` |

The focused suite proves dry-run mutation safety, dry-run/real-run graph parity, paid future Day Pass count and SAR total, tenant/owner isolation, idempotency, Waha/booking effects, external identity retry semantics, and induced postcondition rollback.

## Final migration publication gate

The exact migration source was published and read back from GitHub before development application:

- **Evidence path:** `evidence/stage-6a/Stage-6A-Final-Release-Engine-Migration-2026-08-23-r2.sql`
- **Local SHA-256:** `64cf53b5fe7878c5915626b296c4f0b487e3d8ffd8353a4b4be9b09cf67e217d`
- **Verified GitHub blob:** `0a1345957d9adb69219bfbac5e2d38183c330278`
- **GitHub evidence commit:** `313b4e75cfd5b01c31c0776e60fe662b2202d122`
- **Byte verification:** 12,864 local bytes = 12,864 retrieved GitHub bytes

## Development database application

The published final SQL was applied to development only. All four transactional batches completed successfully.

### Pre-migration fixture counts

| Entity | Count |
| --- | ---: |
| Users | 7 |
| Units | 1 |
| Bookings | 2 |
| Payment attempts | 8 |
| Waha Guest Day Passes | 4 |
| Waha Pass applications | 1 |
| Unit verifications | 1 |
| Owner-ID rate-limit attempts | 0 |
| Permits | 0 |
| Vehicles | 0 |

No orphan remediation update was required during application.

### Post-migration checks

- `release_operations` and `external_identity_deletion_jobs` both exist and begin empty.
- Retained-record user references are nullable on bookings, payment attempts, Day Passes, Waha applications, permits, vehicles, verifications, and owner-ID attempts.
- Foreign keys have the approved deletion policies:
  - `bookings.user_id` → `SET NULL`
  - `bookings.unit_id` → `RESTRICT`
  - `payment_attempts.user_id` → `SET NULL`
  - `waha_guest_day_passes.purchased_by_user_id` → `SET NULL`
  - `waha_pass_applications.applicant_user_id` → `SET NULL`
  - identity-deletion job operation reference → `RESTRICT`
- There are no booking `unit_id` orphans.
- Two legacy bookings remain without a unit anchor. This is valid because the approved schema intentionally makes `bookings.unit_id` nullable for unassigned historical records.

## Runtime verification

The API server was restarted after migration. It listens successfully on port 8080, starts the new external identity-deletion scheduler, and no longer emits the pre-migration missing-table error on its first scheduler tick.

The existing fail-closed warning for an unset Moyasar secret remains unchanged and is outside Stage 6A scope.