# Occupancy foundation — implementation evidence

**Date:** 2026-09-05  
**Scope:** Decisions 149–152; Development/UAT implementation evidence only.  
**Architect review:** **PASS** — final remediation includes linked-secondary
user suspension/unlink, atomic verification approval, canonical extra-request
lock order, and the MoveForm contract correction.  
**Production:** not accessed or changed.
**Continuity:** Migration replay, schema catalog, and promotion-verifier evidence are
recorded once in
[Baseline-0049-0050-Continuity-Evidence-2026-09-05.md](Baseline-0049-0050-Continuity-Evidence-2026-09-05.md);
they are not duplicated here.

**Citation basis:** current working-tree source and `git diff` reviewed on
2026-09-05, including the occupancy/release routes, portal surfaces, generated
API contract, and migrations 0049–0050.

## Delivered policy

| Decision | Implemented rule | Primary source |
| --- | --- | --- |
| 149 | A locked unit cannot have active owner and tenant households together. Tenant activation is blocked by an owner household and owner activation is symmetrically blocked by a tenant household; verification approval performs that check atomically with its state write. | `artifacts/api-server/src/lib/occupancy.ts:14-45`; `routes/units.ts` approval path |
| 150 | The explicit active primary counts within the four-person household. Adds one through four are direct; a fifth/later proposal requires nonblank reason and proof acknowledgement, creates an immutable review request, and can be approved or refused by an administrator. | `lib/db/migrations/0049_occupancy_core.sql:3-63`; `routes/residents.ts:377-407,440-493` |
| 151 | A terminal release locks one unit, selects the whole active household for a move-out, revokes active Waha access, ends residents, deactivates vehicles/releases parking, cancels future bookings, and records an idempotent operation. Owner move-out preserves the owner claim; tenant move-out clears the tenant occupancy link. The scheduler uses canonical `unitId` and Riyadh day boundaries. | `lib/occupancyLock.ts`; `lib/releaseSubject.ts:324-486,594-814`; `lib/moveOutScheduler.ts:8-120` |
| 152 | Secondary removal is distinct from move-out. It retains history, requires the current primary (or an administrator), records an idempotent removal operation, resolves the selected member's invitation/Waha/future-booking/vehicle effects, suspends and unlinks a linked secondary user, and leaves unit occupancy links unchanged. A primary removal/downgrade returns `MOVE_OUT_REQUIRED`. | `lib/occupancy.ts:48-80`; `routes/residents.ts` DELETE and PATCH guards; portal `pages/portal/residents.tsx:308-327` |

## Primary and invariant evidence

- `residents.is_primary` is non-null, defaults false, and has a partial unique
  index for one active primary per unit (`0049_occupancy_core.sql:3-5`).
- `loadLockedOccupancy` takes the occupancy lock, locks resident rows, derives
  active/primary/owner/tenant state, and rejects opposing active households
  (`occupancy.ts:14-38`).
- Direct add and fifth-request decision both call that locked state loader.
  Self-registration and atomic verification approval call
  `assertActivationAllowed`.
- The API exposes `OCCUPANCY_CONFLICT`, `PRIMARY_RESIDENT_MISSING`, and
  `MOVE_OUT_REQUIRED`; the portal labels the primary and routes a primary’s
  remove control to move-out guidance rather than deleting the row.

## API/UI evidence

- `POST /residents` branches at four active rows. At capacity it stores the
  proposal rather than an active resident; `GET /residents/extra-requests` and
  `POST /residents/extra-requests/:id/decision` provide the administrator queue
  and final decision.
- The resident portal presents the `n / 4` count, mandatory reason/proof-warning
  form at capacity, primary badge, and secondary-removal confirmation.
- The administrator portal consumes generated extra-resident request hooks,
  shows the attention queue, and supplies approve/refuse dialogs.
- Migration 0050 adds `move_forms.unit_id`; its backfill updates only
  unambiguous references. The scheduler refuses a null canonical identity for
  automatic processing rather than choosing by bare apartment number. The
  corrected MoveForm contract carries that canonical identity through the
  release path.

## Deliberate exclusions and limits

- No Production access, deployment, migration execution, GitHub publication, or
  source-code change is claimed by this evidence file.
- This delivery does not retire `users.unitNumber`; it remains
  display/compatibility data, not canonical move-out authority.
- W14 is **not corrected** by migration 0049 or 0050 and is not corrected by
  this evidence. See the separately approval-gated
  `W14-Correction-Dry-Run-Manifest-2026-09-05.md`.
- Browser evidence does not claim a browser-performed move-out. Terminal
  move-out coverage cited in the accompanying test/UAT evidence is API/test
  coverage only.