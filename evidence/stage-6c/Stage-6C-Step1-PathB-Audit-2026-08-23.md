# Stage 6C Step 1 — Path B and pre-approval audit

**Audit date:** 2026-08-23  
**Scope:** Stage 6C Step 1 only — audit before implementation.  
**Stage 6B status:** Accepted.  
**Stage 6C authorization:** O1–O7 authorized.  
**Deployment status:** Prohibited; no production database access, production data changes, or live payment credentials.

## Finding

The current Path B implementation contains a bespoke incoming-owner promotion path. It is not ordinary B7 verification:

1. `POST /api/ownership-changes/claim` creates a `path_b` ownership-change event after checking that the unit has an existing registered owner. It captures the claimant's name, national ID, old-owner evidence, optional proof-document key, and notes, then notifies the administrator and the outgoing owner.
2. Administrator approval of a Path B event with an outgoing owner enters the shared `releaseSubject` owner-release call. In the fallback branch, the route sets `units.pre_approved_claim_id` to the ownership event ID.
3. `POST /api/unit-verify/owner` checks `units.pre_approved_claim_id` before the ordinary owner-manual-review path. If the claimant's name and national ID match the ownership event, it links the user to the unit immediately, sets the user's verification status to `pre_approved`, and records `ownership_change_events.new_owner_user_id`.
4. `PATCH /api/ownership-changes/:id/finalize` is an administrator-only promotion endpoint. It requires the claimant to be `pre_approved`, directly sets `units.verified_owner_id`, clears `pre_approved_claim_id`, changes the user to `verified_owner`, and marks the event `completed`.
5. `PATCH /api/ownership-changes/:id/cancel-pre-approval` and the ownership-change scheduler manage the pre-approved claimant slot and can revert a pre-approved claimant to an unverified, unlinked state.

This is a dedicated incoming-owner slot, status, and administrator promotion sequence. It therefore conflicts with O5. The incoming owner must instead use the ordinary B7 registration and verification flow after O3 has fully freed the unit. No new incoming-owner finalize or promotion code is warranted.

## Development database inventory

The audit queried the development database using read-only aggregate queries. No resident names, national IDs, emails, or other personal data were selected.

| Item | Count | Result |
|---|---:|---|
| Units | 2 | Development fixture inventory |
| Units with `pre_approved_claim_id IS NOT NULL` | 0 | No active claimant slot |
| Users with `verification_status = 'pre_approved'` | 0 | No active pre-approved user |
| Ownership-change events | 0 | No Path A or Path B event rows |
| Ownership-change events with `new_owner_user_id IS NOT NULL` | 0 | No linked claimant |
| Ownership-change events with `status = 'approved'` | 0 | No approved slot to migrate |
| Ownership-change events with `status = 'completed'` | 0 | No completed promotion record |

There are therefore no existing records using either `units.pre_approved_claim_id` or the `pre_approved` verification status, and no data migration or record-by-record treatment is required for the current development database.

## Retirement impact and record treatment

The retirement target is the active promotion behavior, not the historical ownership-change audit:

- Keep `ownership_change_events` as the durable record of the submitted claim, proof reference, old-owner snapshot, administrator decision, and release evidence. Do not delete or rewrite event history.
- Remove the active Path B claimant-slot behavior: no new `pre_approved_claim_id` assignment, no automatic claimant linking, no `pre_approved` user assignment, and no administrator finalize promotion.
- Replace any active incoming-owner continuation with ordinary B7 registration and verification after the shared O3 release has cleared the outgoing owner. The normal B7 authorization, registry matching, and manual review rules remain authoritative.
- Retire the active finalize/cancel-slot behavior and its scheduler work once the ordinary B7 path is proven. Existing ownership-change audit rows, if ever present in another environment, must remain retained and be excluded from active workflow counts/listings in the same way G1 retains archived permit records while removing them from active permit behavior.
- Because the development count is zero, no claimant is being detached, deleted, or downgraded by this audit. A future migration must still fail closed if it discovers nonzero slot/status usage: preserve the ownership event, clear the obsolete slot, and route the person through ordinary B7 review rather than silently promoting or deleting them.
- The PostgreSQL enum label and nullable column are schema-retirement decisions to apply only after active references and generated contracts are removed. They are not evidence that any current record exists.

## O5 tripwire result

The audit does **not** find a need for new incoming-owner code beyond B7. It finds the opposite: existing promotion code that must be retired. The implementation must repair O3 so the unit is genuinely free, then allow the incoming owner to proceed through B7. If a future implementation step appears to require a new incoming-owner finalize, promotion, or claimant-slot path, work must stop and the defect must be reported as an incomplete O3 release.

## Source evidence

- `artifacts/api-server/src/routes/ownershipChanges.ts` — Path B claim, administrator review, finalize promotion, and pre-approval cancellation.
- `artifacts/api-server/src/routes/units.ts` — B7 owner verification and the pre-approved fast-track branch.
- `artifacts/api-server/src/lib/ownershipChangeScheduler.ts` — stale pre-approved claimant-slot cancellation.
- `lib/db/src/schema/units.ts` — `pre_approved_claim_id` column.
- `lib/db/src/schema/users.ts` — `pre_approved` verification status.
- `lib/db/src/schema/ownershipChangeEvents.ts` — ownership audit and claimant linkage fields.
- `lib/db/migrations/0007_ownership_changes.sql` — original pre-approval schema support.
- `lib/db/migrations/0015_stage2_unit_linkage_hardening.sql` — legacy Path B linkage treated as an authoritative-link exception.
- `artifacts/api-server/src/routes/permits.ts` — G1 precedent: archived permit records are retained but excluded from active lists.

## Audit conclusion

Path B's current pre-approval machinery is a bespoke incoming-owner promotion path, and O5 requires its active behavior to be retired. The development database has zero affected rows, so the implementation can remove the behavior without a data backfill while retaining the ownership-change audit model. The next implementation step is to write interaction tests first, with O3 release correctness and ordinary B7 continuation as the governing contract.