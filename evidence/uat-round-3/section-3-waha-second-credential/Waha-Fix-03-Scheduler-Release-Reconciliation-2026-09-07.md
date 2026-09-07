# Waha Fix 03 — scheduler release reconciliation

**Date:** 2026-09-07  
**Original runtime verdict:** confirmed defect

## Failing-first proof

The permanent scheduler observation was changed before production edits to
require the expiry-suspended credential to finish `revoked` and be included in
release evidence. It failed because the credential remained `suspended`.

## Fix

Terminal release now selects both `active` and already-`suspended` credentials
within the already-scoped active unit/occupancy-track application graph.
Already-terminal credentials remain excluded.

The terminal operation now:

- leaves the affected credential `revoked`;
- includes its ID in the release operation;
- records one credential-revocation event/evidence row;
- revokes the current paid day pass;
- cancels the future booking;
- preserves the past booking;
- clears the required subject links;
- leaves equivalent other-unit rows unchanged; and
- remains idempotent on rerun.

## Validation

- tenancy lifecycle suite: **25 passed**
- shared release engine suite: **9 passed**
