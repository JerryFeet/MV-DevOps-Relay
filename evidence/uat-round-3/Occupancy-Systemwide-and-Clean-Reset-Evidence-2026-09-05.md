# Occupancy systemwide invariant and clean Development reset

**Date:** 2026-09-05  
**Environment:** Development/UAT only  
**Production:** Untouched and not accessed.

## Systemwide occupancy boundary

The 12 application touchpoints covered by the accepted occupancy boundary are:

1. `POST /residents` household-resident creation.
2. `POST /residents/extra-requests/:id/decision` approved fifth-resident creation.
3. `PATCH /residents/:id` occupancy-sensitive resident updates.
4. `DELETE /residents/:id/invite` invitation/linkage revocation.
5. `DELETE /residents/:id` secondary-resident removal.
6. `POST /residents/self` owner/tenant self-registration.
7. `POST /unit-verify/:id/approve` owner/tenant occupancy activation.
8. `POST /users/me/sync` accepted household-invitation linkage.
9. Terminal owner and tenant household release through `releaseSubject`.
10. `POST /vehicles` active-occupant entitlement.
11. `POST /bookings` active-occupant entitlement.
12. Waha eligibility, `POST /waha-pass/apply`, and
    `POST /waha-pass/:id/approve` rechecks.

The shared implementation functions are `loadLockedOccupancy`,
`assertActivationAllowed`, `updateResidentOccupancy`,
`createHouseholdResident`, `setApprovedUnitOccupancy`,
`moveOutHouseholdResidents`, `applyUnitReleaseOccupancy`,
`clearResidentOccupancyLinkage`, `clearResidentRegistration`,
`assertActiveOccupantEligibility`, `beginHouseholdRelease`,
`consumeInvitationLinkage`, `revokeHouseholdInvitationLinkage`, and
`removeSecondaryResident`. They use the canonical unit-scoped occupancy lock;
terminal release remains centralized in `releaseSubject`.

Migration `0053_occupancy_track_constraint_triggers.sql` supplies the database
backstop. Its three functions and two `DEFERRABLE INITIALLY DEFERRED`
constraint triggers reject a committed state in which active owner and tenant
tracks coexist or the active resident track disagrees with
`units.occupant_type`. Migration
`0054_occupancy_unit_insert_constraint_trigger.sql` extends the stable units
trigger to `AFTER INSERT OR UPDATE`, so a raw occupied-unit INSERT without a
matching active resident is also rejected at commit. The HOA COMMON system unit
is expressly exempt.

For resident changes involving two unit IDs, the shared writer deduplicates and
sorts source/destination unit IDs, acquires canonical occupancy locks in
ascending order, and refuses direct cross-unit movement of an active or primary
resident. This prevents caller-order deadlocks and bypass of the release and
activation boundaries.

## Hardened static boundary scanner

The final blocker review passed after hardening the static occupancy-boundary
scanner. The scanner recursively walks the exact production
`artifacts/api-server/src/routes` and `artifacts/api-server/src/lib` trees and
excludes only the exact canonical
`artifacts/api-server/src/lib/occupancy.ts` path. A filename that merely
contains an occupancy-like word receives no exemption.

The scanner detects:

- direct Drizzle insert, update, or delete mutations of `residentsTable`,
  including recognized aliases;
- raw SQL `INSERT`, `UPDATE`, or `DELETE` mutations of `residents`;
- Drizzle inserts and updates of `unitsTable` whose payload contains an
  occupancy-sensitive field;
- raw SQL unit inserts or updates containing `occupant_type`,
  `verified_owner_id`, `verified_tenant_id`, `pre_approved_claim_id`, or
  `is_system`; and
- computed unit mutation payloads that cannot be resolved to the explicit safe
  master-data field allowlist.

Computed payload analysis fails closed: unresolved identifiers, spreads,
computed keys, malformed calls, and fields outside the safe allowlist are
reported as bypasses rather than accepted. Synthetic tests confirm detection of
unit insert/update sensitive fields, residents ORM and raw-SQL mutations,
unresolved computed payloads, and a misleading `foo-occupancy.ts` filename,
while explicit safe unit master-data writes remain permitted.

The hardened static suite passed **6/6**, and the final Round 3 blocker review
result was **PASS**.

## Regression and clean-clone proof

The final recorded complete API result was **104 files, 1475 passed, 25
skipped**. The real PostgreSQL occupancy suite was **4/4 passed**. In the clean
clone:

- verified-tenant self-registration against an owner-occupied unit returned
  **409** without creating a tenant resident;
- verified-owner self-registration against a tenant-occupied unit returned
  **409** without creating an owner resident; and
- contradictory direct SQL was rejected with PostgreSQL SQLSTATE **23514**,
  while a valid deferred repair transaction was accepted; and
- an occupied unit INSERT without a matching active resident and a direct
  cross-unit opposing-track move were rejected by the 0054 trigger/application
  boundary.

## Development reset input counts

The reset result was captured in
`/tmp/development-round3-reset-final.json`. Exact pre-deletion counts were:

| Table | Deleted |
| --- | ---: |
| `ai_knowledge_chunks` | 0 |
| `ai_knowledge_documents` | 0 |
| `announcement_edit_history` | 0 |
| `announcements` | 0 |
| `api_rate_limit_counters` | 19 |
| `communications` | 6 |
| `data_migration_corrections` | 4 |
| `documents` | 8 |
| `external_identity_deletion_jobs` | 0 |
| `extra_resident_request_events` | 0 |
| `facility_booking_config_normalization_audit` | 0 |
| `facility_operating_hours_conflicts` | 0 |
| `guest_entry_exit_logs` | 0 |
| `guest_pass_verification_logs` | 0 |
| `guest_passes` | 2 |
| `guests` | 2 |
| `household_invitations` | 1 |
| `monthly_booking_allowances` | 2 |
| `move_forms` | 0 |
| `notification_events` | 48 |
| `notification_preferences` | 0 |
| `occupancy_correction_operation_supplements` | 1 |
| `ownership_change_events` | 0 |
| `parking_lots` | 0 |
| `payment_attempts` | 1 |
| `permits` | 3 |
| `portal_help_screenshot_deletion_jobs` | 0 |
| `push_tokens` | 0 |
| `resident_removal_operations` | 0 |
| `tenancy_renewals` | 0 |
| `unit_master_data_audit` | 0 |
| `unit_verification_document_cleanup_retries` | 0 |
| `unit_verification_owner_id_attempts` | 1 |
| `vehicles` | 1 |
| `waha_guest_day_passes` | 1 |
| `waha_pass_events` | 4 |
| `waha_replacement_requests` | 0 |
| `bookings` | 6 |
| `document_folders` | 3 |
| `extra_resident_requests` | 0 |
| `occupancy_correction_operations` | 1 |
| `portal_help_tickets` | 1 |
| `tenancy_lifecycles` | 1 |
| `waha_pass_applications` | 3 |
| `waha_pass_credentials` | 4 |
| `facilities` | 2 |
| `release_operations` | 0 |
| `residents` | 5 |
| `unit_verifications` | 3 |
| `units` | 3 |
| `users` | 11 |

## Public-safe post-reset assertions

The reset's dynamic catalog-driven postcondition asserted every transaction,
request, audit, notification, entitlement, payment, booking, permit, pass,
vehicle, lifecycle, verification, and user/resident table was empty. A
read-only follow-up found no unexpected nonzero transaction table.

| Retained/reseeded state | Exact result |
| --- | ---: |
| Users | 0 |
| Admin database rows | 0 |
| Residents | 0 |
| Non-COMMON units | 0 |
| HOA COMMON system unit | 1 |
| HOA settings | 21 |
| Facilities | 1 |
| Document folders | 2 |
| Documents | 2 |

The reset transaction compared the complete ordered settings serialization and
its digest before and after reset and asserted exact preservation. This
public-safe evidence intentionally does not publish setting values or their
digest. The retained COMMON row also passed exact identity, vacancy, and null
linkage assertions.

The Development admin database row is absent. Clerk external identity was
deliberately untouched. Production was not connected to or changed. The reset
had already completed before this schema-continuity work; this work did not
mutate Development data.