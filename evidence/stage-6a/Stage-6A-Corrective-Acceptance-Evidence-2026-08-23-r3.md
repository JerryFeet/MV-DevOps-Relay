# Stage 6A corrective acceptance evidence — revision 3

**Scope:** Stage 6A release substrate and the F11/X8 corrective work only. All database work and verification ran against development. No production access or deployment occurred. Stage 6B and Stage 6C were not started.

## Corrective outcome

Unlinked administrator community bookings retain the required non-null unit anchor through one reserved system unit:

- `bookings.unit_id` remains PostgreSQL `NOT NULL`.
- The original `0035_stage6a_common_unit.sql` remains unchanged as applied history and seeds the canonical `HOA / COMMON` system unit (`normalised_unit_number = HOACOMMON`).
- New upgrade-safe migration `0036_stage6a_common_unit_integrity.sql` requires exactly one existing canonical system unit before it changes any schema or data. It then replaces the staff check to cover both `unit_id` and `unit_number`, adds canonical identity and singleton protections, and makes the system unit immutable.
- HOA COMMON is only an administrator community-booking anchor. It is excluded from resident claims, general listings, registry/count surfaces, and release-engine subjects.
- Historical records without truthful attribution remain in `data_migration_corrections`; they are never moved to HOA COMMON.

## Development migration and invariant evidence

`0036_stage6a_common_unit_integrity.sql` applied successfully to the development database.

| Invariant or probe | Result |
| --- | --- |
| Canonical system anchor | `system_units = 1`; `canonical_common_units = 1` |
| Staff linkage | `linked_staff = 0`; the database check covers both relational and display linkage columns |
| Booking attribution | `unanchored_bookings = 0` |
| Durable protections installed | Staff check, system-identity check, singleton partial index, and update/delete trigger all present |
| Staff linkage mutation | Direct admin `unit_number` mutation rejected by `users_staff_unitless_check` |
| System-unit demotion | Rejected by the protection trigger |
| System-unit deletion | Rejected by the protection trigger |
| Second system-unit creation | Rejected by `units_system_unit_identity_check` |
| Upgrade with no anchor | A rollback-only probe temporarily removed the flag and captured: `Stage 6A common-unit integrity upgrade requires exactly one canonical HOA COMMON system unit`; the transaction rolled back cleanly |

The precondition executes inside the migration transaction. A zero, duplicate, or malformed legacy system-anchor state therefore aborts the upgrade before partial DDL or linkage cleanup can commit.

## F11 and X8 boundary evidence

| Boundary | Evidence |
| --- | --- |
| Unlinked admin booking is anchored | Independent browser verification created a future Majlis booking as an unlinked administrator. `POST /api/bookings` returned `201`, `status = confirmed`, `paymentStatus = waived`, and `paymentExemptionReason = admin_booking`; the database confirmed the HOA COMMON anchor. |
| Admin booking can be cancelled | The same future booking appeared in My Bookings, was cancelled successfully, and retained the system-unit anchor. |
| Confirmation state is truthful | The portal now bases its confirmation message on the server booking status. Live verification observed “Your booking is confirmed,” not “Awaiting admin approval,” for the confirmed/waived booking. |
| Common unit is hidden | API coverage excludes or refuses the system unit from public/general unit listing, Unit Registry/counts, owner and tenant verification, ownership Path B, and the release-subject resolver. |
| Staff cannot enter resident claims | Admin and guard callers are denied before mutation at owner-ID check, owner claim, and tenant claim entry points. The owner-ID-attempt, user, and verification stores remain unchanged. |
| No Stage 6B authority surface | Deferred T14d approval/rejection routes return `404`; no renewal lifecycle behavior was added. |

The booking route performs facility and schedule validation before resolving HOA COMMON, preserving the intended request-validation responses.

## Final validation

| Validation | Result |
| --- | --- |
| Full API regression suite | 91 files, 1,459 passed |
| API type check | passed |
| Full portal regression suite | 63 files, 1,368 passed |
| Portal type check | passed |
| Full portal E2E | 76 passed, 6 skipped (82 executions) |
| Final live admin browser flow | Future confirmed/waived booking created, visible, cancelled, and verified anchored; no browser-console or backend errors |
| Final reviewer assessment | PASS — no Stage 6A blocking issue remains |
| API runtime | Restarted successfully; health and browser-suite preflight were reachable |

The 82 E2E executions reconcile the historical 88 as `88 − 6` duplicate facility executions removed from overlapping project configuration. The three authentication/seed setup tests remain included in the current total.

## Limits respected

- No deployment was performed.
- No production environment or production database was accessed.
- No Stage 6B tenancy-renewal workflow, endpoint, UI, scheduler, or lifecycle behavior was implemented.
- No Stage 6C workflow was started.

## Related individual files

- `lib/db/migrations/0035_stage6a_common_unit.sql`
- `lib/db/migrations/0036_stage6a_common_unit_integrity.sql`
- `evidence/stage-6a/Stage-6A-Corrective-Acceptance-Evidence-2026-08-23-r1.md`
- `evidence/stage-6a/Stage-6A-Corrective-Acceptance-Evidence-2026-08-23-r2.md`
- `evidence/stage-6a/Stage-6A-Corrective-Acceptance-Evidence-2026-08-23-r3.md`