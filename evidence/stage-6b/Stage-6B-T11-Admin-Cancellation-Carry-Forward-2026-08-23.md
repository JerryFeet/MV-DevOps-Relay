# Stage 6B carry-forward verification — T11 admin cancellation

**Scope:** First Stage 6B carry-forward check only. This verifies that the Stage 6A staff resident-claim guard did not regress the existing T11 admin cancellation escape hatch. No other Stage 6B lifecycle behavior was started, and Stage 6C was not started.

## Requirement

An administrator must be able to cancel a pending tenant linkage request when the unit owner has not responded. Cancellation must release the tenant slot so the tenant can submit a replacement request.

## Coverage added

`tenantVerificationAdminBlock.test.ts` now explicitly verifies that:

1. An authenticated administrator can cancel the pending tenant request.
2. The response is `{ ok: true, status: "cancelled" }`.
3. The request retains its audit state:
   - `status = "cancelled"`
   - `cancelledById` identifies the administrator
   - the cancellation reason is persisted.
4. The tenant can immediately submit a new valid request for the same unit.
5. The replacement request is created as a new pending tenant request while the cancelled record remains preserved.

The tenant-claim staff guard remains limited to resident claim-submission routes; it does not block the separate admin cancellation route.

## Validation

| Check | Result |
| --- | --- |
| Full API regression suite | 91 files, 1,460 passed |
| T11 cancellation and slot-release assertion | passed |
| Stage 6A guard regression | no failure |
| Production or deployment access | none |
| Stage 6C behavior | not started |

This is a carry-forward verification for the Stage 6B plan, not Stage 6B acceptance. T13, T14, and the remaining X3 event producers remain outstanding.