# Round 4 — Canonical Gate A1a Audit (final)

**Audit date:** 2026-09-09  
**Mode:** report only (no application or test changes were made)  
**Selection:** the complete selection made by `pnpm run round3:regression:e2e`  
**Clean-transcript totals:** **API 155, portal contracts 8, browser 37, total 200**

## 1. Selection and accounting

The root command runs, in order:

1. `round3:regression:api`, which invokes Vitest on exactly these ten files:
   `emailSecurity.test.ts`, `adminAlertOnApprovalRequired.test.ts`,
   `bookingGuards.test.ts`, `unitVerificationSecurity.test.ts`,
   `unitVerificationTitleDeedLifecycle.test.ts`, `wahaPassCompositionI5.test.ts`,
   `stage4I3I4Guards.test.ts`, `tenancyLifecycleStage6b.test.ts`,
   `releaseSubject.test.ts`, and `paymentCallbackMatrix.test.ts`.
2. `round3:regression:portal`, which invokes the two contract files
   `round3WordingContracts.test.ts` and `unitRegistryRound3C6Presentation.test.ts`.
3. The portal `round3:regression:e2e` script, whose projects select the browser
   files listed in Section 5 below. Its clean Playwright transcript reports
   37 browser tests, including the five selected authentication/fixture setup
   tests; those setup tests are included in the browser total and audited
   below rather than silently discarded.

The clean transcript reports 155 API cases, 8 portal-contract cases, and 37
browser cases. This report audits the test cases, not merely the file names.
Parameterized cases are counted at their expanded transcript names (for
example, each locale, boundary day, terminal outcome, and callback mismatch is
one case).

## 2. Case-level audit method and notation

For each selected case the transcript title and source were read to record:

* **Journey:** the request/UI action and state transition actually exercised.
* **Final assertion:** the terminal status, response field, persistence state,
  DOM condition, or mocked side effect asserted by that case.
* **Does not cover:** the nearest untested continuation or boundary; a passing
  assertion is not treated as evidence for an untested lifecycle.
* **Flags:** `C` = creation-without-deletion, `A` = approval-without-rejection,
  `H` = happy-path-without-reversal. `—` means none of these three flags is
  applicable to that isolated guard/read test.

The API transcript contains the expanded names for all 155 cases. The
file-and-title inventory below preserves the exact source selection and the
case-level subject; parameterized rows explicitly name their expansion.

## 3. API — 155 cases

### `emailSecurity.test.ts` (4)

* Plaintext or corrupt database credentials are fed to the mail path; final
  assertion is a fail-closed error. Does not cover rotation, delivery,
  bounce/retry, unsubscribe, or alert withdrawal. **Flags: —.**
* Unconfigured, provider-failure, and successful mail configuration are each
  exercised; final assertion is the distinct outcome classification. Does not
  cover a real SMTP transaction or reversal. **Flags: —.**
* An approval-queue alert is produced without destination settings; final
  assertion is the fixed approver inbox and action-required message. Does not
  cover delivery or rejection/retraction notification. **Flags: A.**
* The static producer scan visits every admin-approval producer; final assertion
  is that each uses the fixed-destination queue contract. Does not cover
  runtime delivery or lifecycle completion. **Flags: A.**

### `adminAlertOnApprovalRequired.test.ts` (12)

Resident permit submission (with and without `unitNumber`) is routed to the
approval queue; final assertions are the alert call, action-required subject,
and unit number when supplied. The admin caller is then checked not to alert.
These cases do not approve, reject, revoke, or deliver the permit. **Flags:
A, C.**

The three move-out validation cases submit no method, a moving-company method
without company name, and one without contact; final assertions are 400
responses with required-field validation. They do not submit a valid move-out
or test approval/rejection/completion. **Flags: C.**

Owner verification is submitted with no registry match and with an exact match;
tenant linkage is submitted; additional-vehicle registration is submitted with
an existing vehicle; first-vehicle registration is submitted; and guest
pre-registration is submitted. Final assertions are the 201/validation
response and mocked alert subject/routing (first vehicle deliberately has no
alert). None performs the subsequent admin approve/reject/revoke or cleanup.
**Flags: C, A.**

The guest case without National ID/Iqama is submitted; final assertion is
rejection and no accepted guest record. It does not cover a valid guest's
approval, expiry, or deletion. **Flags: —.**

### `bookingGuards.test.ts` (13)

The cases cover: cancelling a past booking (409); a supervisor reading another
owner's booking (404) and own-only visibility; Riyadh-today elapsed slots
being unavailable while future slots remain; an elapsed-start create (stable
400); confirming a past booking (409); supervisor confirmation (403);
point-duration over-, under-, and exact-duration requests (400, 400, accepted);
cinema listing retaining `movieTitle`; non-cinema listing returning null;
zero-price creation confirming and recording the monthly allowance claim; and
approval-on free/priced requests remaining pending while checkout is blocked,
with approval-off progression retained.

Final assertions are the stated HTTP status, availability/field value, or
allowance/pending/checkout state. These API cases do not provide a complete
successful create→cancel/refund/reopen journey, admin rejection, payment
settlement, or allowance restoration/deletion. **Flags: C, A, H** for the
successful booking/approval cases; **—** for the isolated read and rejection
guards.

### `unitVerificationSecurity.test.ts` (expanded cases in transcript)

The selected cases submit tenancy evidence with contract number/dates,
exercise legacy document rejection, owner-National-ID required/mismatch/match
privacy, pending owner-claim non-linkage and admin approval linkage; title-deed
read access (resident 403, admin signed URL 200, absent deed 404); owner title
deed validation; retired upload 404/no storage; tenant parking payload
ignore/registered/no-parking outcomes; owner-ID throttling; bilingual identity
preservation; ownerless and expired-Ejar refusals; resident-list
owner/self/other-unit boundaries; tenant/owner day-pass GET/POST, optional and
invalid plate; unverified and moved-user denial; ownership-change denial and
owner positive control; tenant approve/reject denial and owner approval;
applicant report-lost positive/non-applicant/moved denial; and Waha admin
listing positive/non-admin denial.

Each final assertion is the endpoint status, selected response privacy field,
or “no mutation” database check named by the transcript. The cases are
endpoint-local: they do not establish a single submit→approve/reject→resubmit
journey, UI behavior, deletion/revocation after a successful claim, or every
sibling route. Successful submissions/approvals therefore carry **C, A, H**;
pure refusal/privacy/read cases carry **—**.

### `unitVerificationTitleDeedLifecycle.test.ts` (expanded cases in transcript)

The title-deed lifecycle cases cover retirement of upload, manual-review
number/key persistence and admin visibility, approval/rejection cleanup (with
and without a deed and with delete failure), no resident-photo deletion,
post-approval/rejection 404, duplicate pending submissions (including the
database race path), fresh submission after resolution, and concurrent
approval where one claim wins and the other is refused.

Final assertions are response status, storage-delete calls, retained approval
basis, cleared key, duplicate 409, and one-approved-claim database state.
These are strong endpoint lifecycle checks but do not provide a browser
journey, an appeal/resubmission UI, or deletion/reversal of the approved unit
claim. Accepted-claim cases carry **C, A, H**; refusal/race/cleanup-only cases
carry **—** or **A** as applicable.

### `wahaPassCompositionI5.test.ts` (expanded cases in transcript)

The selected cases exercise apply and assign-second with absent DOB, under-18,
no-portal, moved-applicant, and valid adult/portal-access inputs; eligibility
tags each ineligible reason and the eligible resident. Final assertions are
the exact refusal code, accepted credential composition, or eligibility array
entry. They do not cover approval/rejection, payment, use, expiry, report-lost
reversal, or deletion. Valid issuance carries **C, A, H**; refusal/read cases
carry **—**.

### `stage4I3I4Guards.test.ts` (expanded cases in transcript)

Verified-tenant Waha eligibility/mine/apply, resident list/detail, guest
day-pass list/create (including optional/invalid plate), moved-user denial,
owner-only ownership-change initiation, owner-only tenant-request
approve/reject, applicant-only report-lost, and admin-only Waha listing are
exercised with their positive and negative roles. Final assertions are 200/201,
403/404/400, exact error, or unchanged records. These are authorization
boundaries, not full lifecycles; no successful object is subsequently
deleted, rejected, or reversed. Positive creates/approvals carry **C, A, H**;
guard/refusal cases carry **—**.

### `tenancyLifecycleStage6b.test.ts` (expanded cases in transcript)

The cases cover late owner approval restoring suspended access while retaining
a paid future booking; duplicate scheduler work; 30-day notification
deduplication; terminal expiry releasing only the affected graph; locale
resolution (`en`, `ar`, `fr`, undefined); renewal-window boundaries (31, 30,
1, 0 days); A/B notification boundaries (30, 14, 7, 1 days); B→C creation
cadence; C stopping after approval and carrying dates; renewal-2 A/B closure;
C stopping after `rejected` and `cancelled`; and C expiry capping without
unsuspending.

Final assertions are scheduler counts, statuses, recipient/channel records,
dates, graph membership, and suspension state. They do not cover a user-facing
submission journey, appeal, manual deletion, or reversal after terminal
expiry. Renewal C creation is explicitly **C**; approval/terminal decision
cases are **A**; the normal renewal continuation is **H**.

### `releaseSubject.test.ts` (9)

Dry-run graph/no mutation, concurrent terminal idempotence, exclusion of
out-of-graph tenants, legacy-unit disambiguation, owner-household release
retaining claim, owner release preserving tenant graph, induced postcondition
rollback, final-unit-attribution rollback, and COMMON-unit pre-mutation refusal
are each executed. Final assertions are graph membership, mutation count,
already-ended result, or complete rollback. This is the strongest reversal
coverage in the selection, but it is not a browser journey and does not cover
approval/rejection. **Flags: —.**

### `paymentCallbackMatrix.test.ts` (expanded cases in transcript)

The matrix covers a matching paid day-pass callback and duplicate
(`confirmed`/`already_confirmed`), missed callback with independently paid
provider (`confirmed`), provider-pending reconciliation (`provider_pending`
with no token), early paid event retry followed by paid reconciliation,
provider failure/cancellation (no pass), wrong amount/user/unit (failed, no
token), cancelled facility hold with late paid callback (`rejected` while
booking remains cancelled/expired), and **late Waha replacement callbacks
after application revocation and after the second-holder slot is cleared**
(`failed`, exactly one existing credential, existing credential `lost`).

Final assertions are attempt status, pass payment status/token, booking
status, and credential count/status. These are fail-closed callback outcomes;
they do not cover provider delivery, user notification, or a subsequent
replacement approval/reversal. Successful pass issuance carries **C, A, H**;
all pending/failure/late-callback refusal cases carry **—**.

## 4. Portal contract — 8 cases

### `round3WordingContracts.test.ts` (2)

The two contract cases render/read the approved English refusal and the
complete distinct Arabic explanation variants. Final assertion is exact
approved text. They do not cover API behavior, accessibility/locale fallback,
or a lifecycle. **Flags: —.**

### `unitRegistryRound3C6Presentation.test.ts` (6)

The six cases render mocked unit-registry presentation: keyboard-reachable
independent booking scrolling; canonical parking fields; normalized parking
count/type; one admin editor; an accurate title-reference label; and the
refreshed selected-unit query row including bookings. Final assertions are
DOM/text/query-row values. They do not cover a real API, authorization,
save/reload/delete, or approval/rejection. **Flags: C, A, H** where the
presentation implies a persisted record; otherwise **—**.

## 5. Browser — 37 cases (including five setup/fixture tests)

The five setup tests are selected by the same Playwright command and count
toward the clean transcript total: `admin-setup`, `verified-resident-setup`,
`round3-vehicles-setup`, `round3-waha-second-credential-setup`, and
`round3-section8-tenancy-setup` (including their saved auth/fixture setup
journeys). Their final assertions are successful authentication/fixture
creation and usable saved storage state. They do not cover deletion,
approval/rejection, or reversal of the seeded records. **Flags: C, H.** The
remaining rows are the browser business tests.

| Selected case | Exact journey and final assertion | Does not cover | Flags |
|---|---|---|---|
| 1a elapsed slot | Resident opens facilities; elapsed slot is absent. | Successful booking/cancellation/payment. | — |
| 1b elapsed POST | Direct elapsed-start booking request is submitted; stable rejection is asserted. | Future create or reversal. | — |
| 1c rejected cancellation | Resident opens fixture booking and attempts cancellation; rejected status remains visible. | A successful cancel, refund, or re-open. | — |
| F12 active rule | Resident creates/reads a second future booking context; active unit/facility rule is visible. | Approval/rejection, cancellation, cleanup. | C, H |
| B5 allowance | Create zero-price booking, confirm no payment request, consume claim, cancel in My Bookings, leave/re-enter, then attempt a different future slot; final assertions are cancelled first booking, claim still unavailable with original booking ID, and second POST **409** allowance refusal. | Refund, monthly reset, manual claim deletion. | C, H |
| 3a rotated `/mine` | Resident reads Waha `/mine`; only current rotated-unit records are shown. | Issue/approve/revoke/delete credential. | — |
| 3b second credential | Opens Assign Credential 2; under-18 resident is omitted. | Actual assignment/rejection/revocation. | — |
| 4a parking selection | Owner opens registration and selects legacy lot/type; selected values remain. | Persist/delete vehicle. | C |
| 4b no Istimara | Owner opens registration; Istimara field is absent. | Save, approval, deletion. | — |
| 4c outside click | Enters vehicle values, clicks outside; dialog and values remain. | Successful save/delete. | C |
| 4d shared lot | Two owner vehicles use one lot/type; both display it. | Duplicate cleanup or deletion. | C |
| 4e owner parking decision | Owner registration requires explicit parking decision; validation/control is asserted. | Accepted record/reversal. | C |
| 4f tenant form | Tenant registration does not request parking declaration. | Accepted record/approval/deletion. | C |
| 5a PDF | Resident opens view-only PDF; portal-owned renderer is visible. | Upload, download authorization, delete/expiry. | — |
| 5b Word | Resident opens Word file; sandboxed preview is visible. | Upload/delete/permission transition. | — |
| 5c image | Resident opens image; portal preview is visible. | Upload/delete/expiry. | — |
| 5d folder defaults | Admin adds/edits folder; no download/view-only default control appears. | Document deletion or resident enforcement. | — |
| 5e permission change | Admin changes downloadable document to view-only, reloads; view-only persists. | Restore/download reversal or resident access. | H |
| 5f custom folder | Admin chooses view-only before custom folder; reload retains view-only. | Restore/delete/approval. | H |
| 5g signed-out Dalil | Signed-out user opens Dalil; sign-in guidance is visible and authenticated chat endpoint is not called. | Signed-in chat and privacy data. | — |
| 6a guardian autofill | Resident selects guardian; registered primary occupant identifier fills. | Resident submission/approval/deletion. | — |
| 6b pending resident | Resident views fifth pending resident; no delete control is present. | Creation completion, admin decision, deletion. | C |
| C-3 move-out | Resident opens move-out; self-move or moving-company path and required controls are enforced. | Submit, approve/reject, completion/cancel. | C |
| tenancy submission | Resident supplies contract number/dates and submits without Ejar metadata; accepted request/fields are asserted. | Admin approve/reject, expiry, deletion. | C, H |
| C-5 approval | Resident submits free and priced requests; both are pending/no Pay Now; admin session advances both. | Admin rejection, cancellation/refund, post-approval reversal. | A, H |
| C-6 registry | Admin opens registry and independently scrolls all booking rows. | Edit/save/delete and negative authorization. | — |
| Section 1 cross-tab identity | Admin tab is open; second tab changes to owner identity; `/api/users/me` is **200** with owner Clerk ID, `/api/admin/summary` and `/api/admin/pending-items` are each **403**, owner approve mutation is **403**, and stale admin dashboard/actions disappear. | Other admin mutations/routes, logout propagation, business-object lifecycle. | — |
| D-1 replacement | Remove displayed mismatched same-unit pending-invitation resident, add replacement adult with portal access, and assert POST `/api/residents` **201**, replacement visible, and new pending invitation. | Invitation-link consumption, email delivery, admin removal. | C, H |
| D-2 second resident | Remove second resident; final Waha state has six rows, credential index 2 fully revoked, index 1 active, and every application active. | Removed user's sign-in, move-out, booking cancellation. | H |
| D-2 applicant | Remove applicant; final Waha state has six rows with every application and credential revoked. | Sign-in, move-out, payment/refund, re-entry. | H |

The table contains 37 selected browser cases, including the corrected B5,
Section 1, D-1, and both D-2 cases. “Creation” means creation or accepted
submission in the test, not that the test failed; the flag records the missing
continuation.

## 6. Required corrected journeys and residual audit flags

### B5 — corrected full cancellation/re-entry/refusal

B5 is no longer accurately summarized as “book and inspect allowance.” It
creates a live zero-price booking through the UI, proves `201`,
`confirmed/not_required/zero_price_facility`, no checkout POST, and a claim
bound to that booking; cancels through rendered My Bookings; leaves and
re-enters the portal; reloads allowance from the API; and attempts a different
future slot after cancellation. The final assertion is **409** with an
allowance/monthly/free error, while the original claim remains bound. This is
the required full cancellation/re-entry/refusal journey. It still does not
test refund, reset, or claim deletion. **Flags: C and H** (not a claim that
cancellation incorrectly restored allowance).

### Section 1 — cross-tab identity and mutation refusal

The corrected journey proves identity independently via `/api/users/me`, not
just by a stale page: owner `/users/me` is 200 and has the owner Clerk ID;
both admin reads (`/api/admin/summary` and `/api/admin/pending-items`) are 403;
the owner approve mutation is 403; and the old admin tab loses its dashboard
and admin actions. It does not prove every admin route or every mutation.

### D-1 and D-2

D-1 clears a mismatched same-unit pending invitation before reissuing a
replacement adult invitation and asserts the new pending row. D-2 has both
required cases: secondary-resident removal revokes only the full second
credential chain while preserving the first chain and active applications;
applicant removal ends the application and revokes both chains. Invitation
consumption, email delivery, removed-user sign-in, move-out, and booking
cancellation remain outside scope.

### Late Waha callback fail-closed cases

The payment matrix explicitly includes both late Waha replacement cases:
callback after application revocation and callback after the second-holder slot
is cleared. Each ends `failed`, creates no replacement credential, and leaves
the existing credential `lost`. The cancelled facility-hold late callback is
also `rejected` and cannot resurrect a booking. Provider-pending, tampered
amount/user/unit, provider failure, duplicate, and retry cases are separately
asserted. These are fail-closed callback checks, not an end-to-end payment
provider or replacement approval journey.

## 7. Final finding register

* **Creation-without-deletion (C):** zero-price booking/allowance, tenancy and
  owner claims, vehicles, Waha issuance, resident/invitation replacement,
  guest/permit producers, documents, and renewal C have accepted creation
  paths without a corresponding ordinary-user delete/reversal in the same
  case. D-1/D-2 are deletion-focused exceptions, not proof that every
  creation path has deletion.
* **Approval-without-rejection (A):** C-5 advances both free and priced
  requests but never rejects them; many API positive approval/linkage and
  alert-producer cases stop at accepted/approved. Title-deed and selected
  tenancy cases do contain rejection guards, but that does not make every
  approval journey bidirectional.
* **Happy-path-without-reversal (H):** C-5, tenancy, document permission,
  Waha/vehicle issuance, renewal continuation, and D-1 stop after the
  successful/accepted path. The release and callback matrices provide
  meaningful reversal/fail-closed coverage, but do not close those gaps.

**Conclusion:** the clean root selection is fully accounted for as 200 cases
(155 API + 8 portal contracts + 37 browser). The selected tests establish the
corrected B5 cancellation/re-entry/refusal behavior, Section 1 cross-tab
identity/read/mutation boundary, D-1 replacement invitation, both D-2 removal
semantics, and late Waha callback fail-closed behavior. They do not establish
that every selected creation has deletion, every approval has rejection, or
every happy path has reversal; those remain explicit audit findings.