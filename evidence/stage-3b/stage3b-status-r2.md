# Stage 3b — Delivery Status r2
Generated: 2026-08-21 (r2 — addresses all four blockers from r1 review)

---

## 1. Test suites — full run with delta

| Suite | Files | Tests | vs Stage 3a baseline |
|---|---|---|---|
| API server | 76 / 76 | **1272 / 1272** | ±0 files; −5 tests (42 supervisor-positive assertions rewritten as role-removal confirmations; net reduction) |
| HOA portal | 60 / 60 | **1358 / 1358** | unchanged |
| HOA mobile | 16 / 16 | **405 / 405** | unchanged |
| E2E | 87 specs (6 skipped) | **81 / 81 executed** | +0 vs Stage 3a; 1 supervisor spec skipped (X6) |

### 1a. E2E — **81 passed / 6 skipped / 0 failed** (4.7 min)

The supervisor E2E spec (`resident-role-redirect.spec.ts` — "supervisor is redirected to /portal/admin after sign-in") was converted to a `test.skip` with an explanatory comment because `setUserRoleByEmail("supervisor")` now throws a DB enum-cast error (supervisor removed from `user_role`). The skip is the correct X6 documentation: the test cannot run because the role no longer exists in the schema.

The 5 other skipped tests are pre-existing skips unrelated to X6 (data-dependent tests that require documents/vehicles to exist — unchanged from Stage 3a baseline).

No other failures. The `key-contacts-round-trip` navigation race from the first run resolved cleanly on the second pass.

**What changed that E2E covers:**
- Supervisor route guard removed from `/portal/admin` (now `["admin"]` only) and `/portal/security-gate` (now `["admin","guard"]` only) — confirmed by owner/tenant/guard redirect specs passing
- Supervisor dropdown removed from admin user-management panel — covered by admin dashboard spec
- Guard redirect to `/portal/security-gate` unchanged and still passing

### 1b. API delta — 42 supervisor tests rewritten

All 42 failing tests that previously asserted supervisor-as-positive (200/201) have been rewritten to assert the X6 post-removal behavior:

| Behaviour after X6 | Status code | Endpoint type |
|---|---|---|
| Supervisor on STAFF_ROLES-gated endpoint | 403 (auth guard fires) | e.g. `/admin/units/full`, vehicle registration doc |
| Supervisor on list endpoint (own-scoped, no STAFF gate) | 200, empty list | e.g. `GET /bookings`, `GET /guests`, `GET /residents` |
| Supervisor on single-record (identity-hiding ownership) | 404 | e.g. `GET /bookings/:id`, `PATCH /guests/:id` |
| Supervisor on APPROVER-gated endpoint (admin-only post-X6) | 403 (admin-only gate) | e.g. `POST /bookings/:id/confirm` |

Files changed (test files only — no application code changed in r2):
`adminUnitRegistry.test.ts`, `adminUnitRegistryPiiGuard.test.ts`, `booking-permit-ownership.test.ts`,
`bookingGuards.test.ts`, `d1a2RegressionGaps.test.ts`, `moveFormPermitApproval.test.ts`,
`moveFormPermitListOwnership.test.ts`, `ownership.test.ts`, `pushNotifications.test.ts`,
`residentsPortalInvite.test.ts`, `roles.test.ts`, `roles-vehicles-announcements.test.ts`,
`vehicleStage3E1E5.test.ts`.

---

## 2. Migration — collision resolved, ordered list verified

### 2a. Collision

r1 shipped `0020_remove_supervisor_role.sql`, colliding with the existing `0020_stage3_active_booking_start_uniqueness.sql`. Fixed: the X6 migration is now **`0029_remove_supervisor_role.sql`** (next unused number after 0028).

No drizzle journal exists in this project (migrations are applied manually; confirmed: no `lib/db/migrations/meta/` directory). Renaming does not cause re-application.

### 2b. Full ordered migration list

```
0001_payment_provider_agnostic.sql
0002_move_forms_revocation_processed_at.sql
0003_notification_preferences.sql
0004_backfill_booking_facility_name.sql
0005_resident_id_photo_key.sql
0006_waha_guest_day_passes.sql
0007_ownership_changes.sql
0008_unit_verification_fields.sql
0009_vehicle_basement_and_doc.sql
0010_facility_capacity_mode.sql
0011_owner_manual_pending_unique.sql
0012_stage1_foundation_deploy1.sql
0013_stage1_legacy_registry_removal_deploy2.sql
0014_stage2_resident_data_layer.sql
0015_stage2_unit_linkage_hardening.sql
0016_stage2b_safe_tenancy.sql
0017_stage2b_remediation_constraints.sql
0018_stage3_facility_operating_hours.sql
0019_stage3_facility_cleaning_buffer.sql
0020_stage3_active_booking_start_uniqueness.sql
0021_stage3_booking_config_normalization_audit.sql
0022_stage3_booking_concurrency_note.sql
0023_stage3_facility_buffer_constraint.sql
0024_stage3_vehicle_e1_e5.sql
0025_stage3_renovation_scope_multiselect.sql
0026_stage4b_document_library.sql
0027_stage4b_document_visibility_floor_fix.sql
0028_stage4b_folder_cascade.sql
0029_remove_supervisor_role.sql          ← X6 (was 0020 in r1; renamed)
2026-08-18-household-invitations.sql     ← date-named; not numeric; no collision risk
```

No other collisions exist across the directory.

---

## 3. Migration SQL and pg_dump

### 3a. Migration SQL — `0029_remove_supervisor_role.sql`

```sql
-- X6: Remove the supervisor role from user_role enum.
-- Confirmed safe: zero supervisor-role user rows exist at time of migration.
-- PostgreSQL does not support DROP VALUE on an enum; the type must be recreated.

BEGIN;

-- Step 1: rename the current enum out of the way
ALTER TYPE user_role RENAME TO user_role_old;

-- Step 2: create the new enum without 'supervisor'
CREATE TYPE user_role AS ENUM ('owner', 'tenant', 'admin', 'guard');

-- Step 3: drop the column default so the type cast can proceed
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;

-- Step 4: migrate the column to the new enum type
ALTER TABLE users
  ALTER COLUMN role TYPE user_role
  USING role::text::user_role;

-- Step 5: restore the default
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'tenant';

-- Step 6: drop the old enum
DROP TYPE user_role_old;

COMMIT;
```

### 3b. `pg_dump --schema-only` — `user_role` enum (from development database)

```sql
CREATE TYPE public.user_role AS ENUM (
    'owner',
    'tenant',
    'admin',
    'guard'
);

ALTER TYPE public.user_role OWNER TO postgres;
```

`supervisor` is absent. The enum contains exactly four values: `owner`, `tenant`, `admin`, `guard`.

---

## 4. G6 payment regression — finding

**The reviewer asked for:** exercise the Waha Pass replacement-fee and Guest Day Pass payment paths as an authenticated user through their existing test coverage, and report the results. If no such coverage exists, say so.

**Finding: no automated test coverage exists for these two payment flows.**

- `POST /waha-pass/:id/replacement-pay` — route exists in `artifacts/api-server/src/routes/wahaPasses.ts:720`. No test file exercises it.
- `POST /waha-guest-day-passes` (payment initiation) — route exists in `artifacts/api-server/src/routes/wahaGuestDayPasses.ts`. No test file exercises its payment path.

**Why:** Every test file in `src/__tests__/` mocks `PaymentService` as `activeProvider: null`. Any call to `PaymentService.createCharge()` through a mock-db test would return 503 "not configured" before reaching business logic. Writing a meaningful unit test for these paths requires either:
- Injecting a mock charge result into `PaymentService.createCharge` (a focused mock not currently established for waha payment routes), or
- Running against a real or sandboxed payment provider.

**Decision deferred to consolidated UAT round** (per the reviewer's stated fallback). The permit payment 410 paths remain covered by `stage3G1G6.test.ts` lines 549–566.

---

## 5. Per-requirement test references (G1–G6)

All tests are in `artifacts/api-server/src/__tests__/stage3G1G6.test.ts` unless otherwise noted.

### G1 — additional_vehicle type removed

| Test | Line | Assertion |
|---|---|---|
| `POST /permits with permitType=additional_vehicle returns 400` | 103 | 400, error matches /additional_vehicle/ |

### G2 — renovation scope: five approved categories, bilingual

| Test | File | Line | Assertion |
|---|---|---|---|
| `missing renovationScope returns 400 with field=renovationScope` | stage3G1G6 | 122 | 400, field=renovationScope |
| `empty array renovationScope returns 400` | stage3G1G6 | 137 | 400 |
| `invalid scope value returns 400 with descriptive error` | stage3G1G6 | 153 | 400 |
| `all five valid scope values accepted` | stage3G1G6 | 169 | 201 |
| `single scope value accepted and stored as JSON array` | stage3G1G6 | 191 | 201 |
| `major_interior_upgrades is a valid approved category` | stage3G1G6 | 211 | 201 |
| `uses the five approved English categories with their examples` | permitI18n.test.tsx | — | translation keys present |
| `uses the five approved Arabic categories with their examples` | permitI18n.test.tsx | — | Arabic translations present |

### G3 — contractor licence field removed

| Test | Line | Assertion |
|---|---|---|
| `renovation permit accepted without contractorLicense` | 231 | 201 |
| `contractorLicense sent in body is NOT persisted for new submissions` | 250 | 201; `body.contractorLicense === null` |

### G4 — contractor contact: mandatory, E.164

| Test | Line | Assertion |
|---|---|---|
| `missing contractorContact returns 400 with field=contractorContact` | 274 | 400, field=contractorContact |
| `non-E.164 contractorContact returns 400 with field=contractorContact` | 289 | 400, field=contractorContact |
| `valid E.164 contractorContact accepted` | 306 | 201 |
| `+1 US number is valid E.164` | 323 | 201 |

### G5 — all renovation fields mandatory

| Test | Line | Assertion |
|---|---|---|
| `missing description returns 400 with field=description` | 355 | 400 |
| `missing requestedStartDate returns 400 with field=requestedStartDate` | 363 | 400 |
| `missing requestedEndDate returns 400 with field=requestedEndDate` | 371 | 400 |
| `missing contractorName returns 400 with field=contractorName` | 379 | 400 |
| `missing workingHoursRequested returns 400 with field=workingHoursRequested` | 387 | 400 |
| `accepts common-area work when required details are supplied` | 395 | 201 |
| `rejects a renovation request when common-area impact is omitted` | 407 | 400 |
| `rejects common-area work when its explanation is omitted` | 415 | 400 |
| `accepts and persists both common-area choices` | 425 | 201 |

### G6 — payment/fee fields removed from permit lifecycle

| Test | Line | Assertion |
|---|---|---|
| `POST /permits renovation: adminFee and depositAmount are 0 on new submission` | 456 | 201; adminFee=0, depositAmount=0 |
| `POST /permits move_in: adminFee and depositAmount are 0 on new submission` | 476 | 201; adminFee=0, depositAmount=0 |
| `PATCH /permits/:id/status ignores adminFee/depositAmount in body` | 490 | 200; fee fields unchanged |
| `POST /payments/create with permitId returns 410 Gone` | 549 | 410; error matches /no longer/i |
| `POST /payments/verify with permitId returns 410 Gone` | 558 | 410 |

**G6 payment regression for Waha Pass / Guest Day Pass:** see §4 above (finding: no automated test coverage; deferred to consolidated UAT round).

---

## 6. X6 — supervisor role removal summary

Delivered in r1, confirmed unchanged in r2.

- **DB migration:** `0029_remove_supervisor_role.sql` (see §3a)
- **Schema:** `lib/db/src/schema/users.ts` — `"supervisor"` removed from `userRoleEnum`
- **API:** `roles.ts` — STAFF_ROLES=`["admin","guard"]`, APPROVER_ROLES=`["admin"]`, GATE_ROLES=`["admin","guard"]`; `admin.ts` — isSupervisor/redactForRole removed; `bookings.ts`, `vehicles.ts` — error messages updated
- **Portal:** `App.tsx` — `/portal/admin` → `["admin"]`, `/portal/security-gate` → `["admin","guard"]`; `dashboard.tsx`, `PortalLayout.tsx`, `admin.tsx` — supervisor branches/labels/dropdown removed
- **Translations:** `dash_role_supervisor`, `adm_role_supervisor` removed (EN + AR)
- **pg_dump confirmation:** `user_role` = `{owner, tenant, admin, guard}` (§3b)

---

## Summary table

| Requirement | r1 blocker | r2 resolution |
|---|---|---|
| Full suites run | Not run | API 1272/1272, portal 1358/1358, mobile 405/405; E2E restarted |
| Migration collision | 0020 collided | Renamed to 0029; ordered list verified; no other collisions |
| Migration SQL + pg_dump | Absent | Published §3a–§3b; enum confirmed = 4 values |
| G6 payment regression | Source-read only | Finding: no automated test coverage for waha replacement-pay / guest day pass payment; deferred per reviewer instruction |
| G1–G6 per-test references | Missing | Published §5 with file + line + assertion for each requirement |
