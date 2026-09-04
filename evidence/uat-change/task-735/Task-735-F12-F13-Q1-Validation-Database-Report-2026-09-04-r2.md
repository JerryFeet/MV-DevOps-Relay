# Task 735 — Validation and Development Database Report

**Date:** 2026-09-04  
**Database environment:** Development only  
**Production database:** Not queried or modified

## Required pre-implementation parking audit

The Development database was audited before the parking-capacity guard was introduced.

- Units over allocated under active-only vehicle usage: **0**
- Units over allocated under all non-inactive vehicle usage: **0**

The guard was therefore introduced without requiring corrective Development data changes.

## Migration verification

Migration `0048_booking_allowance_and_unit_master_audit.sql` was applied to Development only.

Confirmed in Development:

- monthly booking allowance ledger exists;
- unit master-data audit table exists;
- `trg_enforce_one_active_unit_facility_booking` exists;
- the trigger points to `enforce_one_active_unit_facility_booking`;
- append-only protections are installed.

## Direct database concurrency proof

A direct conflicting booking insert was exercised inside an explicit transaction:

1. choose one non-system unit and one active facility;
2. insert one future confirmed booking;
3. attempt a second future confirmed booking for the same unit/facility pair;
4. catch the expected PostgreSQL `23P01` exclusion violation;
5. roll back the outer transaction.

Result:

- the second direct write was rejected by the database trigger;
- no verification rows persisted.

The exact executed proof is published as a separate SQL evidence file.

## Automated validation

### API

- Full API suite: **103 test files passed**
- Assertions: **1,456 passed**
- Intentional skips: **21**
- Total: **1,477**
- API TypeScript check: **passed**

Coverage includes booking conflicts, concurrent admission, expired payment holds, monthly allowance claim behavior, role restrictions, parking constraints, and audit-supporting mock behavior.

### Portal

- Full portal suite completed before final browser verification: **77 test files passed**, **1,417 tests passed**
- Focused Task 735 portal suite after the final read-model fix: **1 file passed**, **7 tests passed**
- Portal TypeScript check: **passed**
- Arabic translation completeness: **passed**

### Schema and repository checks

- H4 schema-integrity validation: **passed**
- `git diff --check`: **passed**
- API readiness after final restart: **HTTP 200**
- Portal readiness: **HTTP 200**

## Final E2E

The accepted run started after both portal and API readiness checks and after the final Riyadh allowance-status fix.

- Preflight: **passed**
- Total Playwright tests: **93**
- Passed: **86**
- Intentional skips: **7**
- Failed: **0**
- Duration: **5.3 minutes**
- Booking wizard and confirmed cancellation journey: **passed**

## Development UAT fixture handling

- The positive-price monthly-free booking was created on the dedicated E2E resident account, then cancelled through the portal.
- Its immutable monthly ledger claim remains intentionally because non-restoration is the behavior under test.
- A separate 0.00 SAR zero-price booking created during branch discrimination was verified as belonging to the dedicated E2E resident and removed with an exact, constrained Development-only delete.
- No meaningful resident data was changed.
