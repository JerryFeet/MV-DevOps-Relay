# Round 3 Section 6 — residents delivery

**Date:** 2026-09-07  
**Requirements:** D-14, D-15, D-16

## Delivered behavior

### D-14 — guardian identifier

- For an under-18 household member, selecting **Guardian's ID (parent)**
  immediately fills the identifier registered against the active primary
  occupant.
- The API independently derives the stored guardian identifier from the locked
  primary-occupant record. It does not trust a browser-supplied value.
- If the primary occupant has no registered identifier, the guardian option is
  unavailable and the portal explains why.

### D-15 — pending resident remains visible

- A fifth resident is not inserted as an active household resident before HOA
  approval.
- The resident list includes a read-only projection of each outstanding
  extra-resident request, visibly labelled **Pending verification**.
- The resident-facing wording is:
  **“The number of residents you add requires HOA review.”**

### D-16 — no orphaned approval request

- The safest model was selected: before approval, the proposal exists only as
  an extra-resident request.
- Its pending resident-list projection has no delete control.
- Therefore a resident cannot delete a provisional resident row while leaving
  an orphaned request in the administrator queue.
- Refusal still requires an administrator reason. The standard explanation is
  prefilled as:
  **“HOA cannot verify. Further proof is required.”**

## Additional launch-page correction

The signed-out homepage previously attempted to show up to three public
announcements using `isPublic=true`. H3 removed that audience and replaced it
with two authenticated visibility levels. Because there is no longer a valid
signed-out announcement audience, the obsolete homepage request and conditional
announcement section were removed.

A permanent signed-out browser regression now proves:

- no `/api/announcements` request;
- no `/api/ai/chat` request;
- no `401` response during launch-page load.

## Browser evidence

- `Section-6-Post-Fix-6a-Guardian-ID-Autofill-2026-09-07.png`
- `Section-6-Post-Fix-6b-Pending-Resident-Visible-No-Delete-2026-09-07.png`
- `Section-6-Post-Fix-Browser-PASS-2026-09-07.txt`

The resident browser journey uses a run/worker/retry-scoped disposable unit,
four active fixture occupants, and the normal portal UI. It does not mock
product APIs or inject resident submissions.

## Audit boundary

No Waha lost-card, replacement, Credential 2 removal, day-pass, scheduler, or
database-cardinality behavior was changed. Those six findings remain named
audit-only candidates pending runtime proof.
