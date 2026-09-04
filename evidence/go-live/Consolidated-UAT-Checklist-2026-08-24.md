# Consolidated Manual UAT Checklist

**Prepared:** 2026-08-24  
**Authority:** Decision 61 carry-forward items and the accepted Stage 6C completion note.  
**Run order:** Mobile browser first. Do not mark an item passed from automated evidence alone.  
**Release rule:** Deployment remains prohibited until every applicable item has an observed result, failures are resolved or explicitly rejected by management, and management signs off.

## How to Use This Checklist

1. Use a genuine fresh identity for every “first-time” check; do not substitute an established seeded account.
2. Record the tester, environment, time, role, result, and a screenshot/video/reference for every line.
3. Run each applicable bilingual visual check in English and Arabic.
4. Use the desktop/admin/gate section only after mobile-browser checks are complete.
5. Mark an item `Not applicable` only with a written reason and management acknowledgement.
6. Before Publish, confirm `PAYMENT_TEST_PROVIDER` and `PAYMENT_TEST_OUTCOME` are absent from committed `.replit` and exist only in Replit Development environment configuration; retain the production fail-closed guard as defense in depth.

Suggested recording fields: **Result** = Pass / Fail / Blocked / N/A; **Evidence** = URL, screenshot ID, recording, or exported result.

## A. Mobile Browser — Fresh First-Time Paths

| ID | Check | Expected observed result | Result | Evidence |
| --- | --- | --- | --- | --- |
| F1 | First sign-in | A brand-new Clerk identity reaches populated `/portal` and `/portal/unit-verification`; no blank route, duplicate profile, or sync failure. |  |  |
| F2 | First unit claim | A fresh resident completes the first eligible verification/claim path; profile and identity remain linked without seeded-state assumptions. |  |  |
| F3 | First booking | A fresh verified resident creates a first booking, sees it in My Bookings, and can exercise the correct cancellation/payment/attribution behavior. |  |  |
| F4 | First document view | A fresh resident opens the first visible document through the authenticated library/download path. |  |  |
| F5 | First guest registration | A fresh verified resident completes first guest registration and reaches the guest/day-pass result. |  |  |

## B. Mobile Browser — Resident, Owner, and Tenant Journeys

| ID | Requirement | Expected observed result | Result | Evidence |
| --- | --- | --- | --- | --- |
| I3 | Waha wording | The resident-facing Waha screen and credential describe it as a facility-access credential in English and Arabic. |  |  |
| I4 | Main-tenant parity | A verified main tenant can use Waha, resident, and Guest Day Pass capabilities; ownership-change initiation and T10 tenant-approval remain blocked. |  |  |
| B1 | Parking wording | Unit verification/admin-visible parking surfaces show “Underground Parking” and its Arabic equivalent. |  |  |
| B2 | Title deed required | Owner submission without a title deed is visibly blocked with a localized error. |  |  |
| B3 | Mobile required | Required mobile input uses the shared component and displays localized validation. |  |  |
| J1 | Document mutation boundary | Non-admin user sees no upload/replace/delete controls and crafted mutation is rejected; the administrator control succeeds. |  |  |
| J5-T | Tenant document privacy | Tenant cannot see or retrieve Invoices, Financial Reports, or Minutes of Meeting. |  |  |
| J5-H | Household visibility floor | Household member sees only `all_portal_users` documents and cannot enumerate/retrieve owner-only content. |  |  |
| D1 | Resident document data path | With a resident-visible document present, library listing, download link, and authenticated retrieval work. |  |  |
| F6 | Facility data paths | With facilities present, facility booking panel and My Bookings open with a correct populated or empty state. |  |  |
| G1 | Guest dialog | A verified resident opens and completes the Guest Day Pass registration dialog. |  |  |
| V1 | Vehicle dialog | A verified resident opens the Add Vehicle dialog and receives the correct validation/state flow. |  |  |
| H2-V1 | Dalil — mobile English visual review | On the mobile portal, the Dalil navigation label, page/chat header, approved English opening message, empty-document state, and `Ask about the portal or community rules` placeholder are all visible, legible, and correctly ordered. |  |  |
| H2-V2 | Dalil — mobile Arabic visual review | On the mobile portal in Arabic/RTL, the `دليل` navigation label, page/chat header, approved Arabic opening message, empty-document state, and `اسأل عن البوابة أو أنظمة المجمع` placeholder are visible, legible, and correctly ordered. |  |  |
| X3-13 | Ownership-release notification | The ownership/release source flow emits event 13 exactly once, to the correct recipient, in the correct language, with durable email/push intent. |  |  |
| X3-14 | Renewal notification | Renewal reminder/submission/decision emits event 14 exactly once with correct recipient/language/channel behavior. |  |  |
| X3-16 | Suspension notification | Lease expiry suspension emits event 16 exactly once and does not incorrectly bypass its policy. |  |  |
| R1 | Hydration reliability | Broad mobile portal navigation remains responsive without the earlier long route-load/hydration failure. |  |  |

## C. Desktop/Admin/Gate Checks

| ID | Requirement | Expected observed result | Result | Evidence |
| --- | --- | --- | --- | --- |
| K2 | Communication context | Administrator sees full sender name, unit, email, and mobile in the communications row/detail. |  |  |
| K3 | Communication rejection | Administrator rejection immediately shows the bilingual standard reply and `rejected` status. |  |  |
| K4 | Maintenance deferral | Administrator deferral shows the bilingual maintenance reply and `deferred_to_maintenance`, without creating a maintenance ticket. |  |  |
| B5 | Registry owner name | Administrator registry visibly shows the owner name, including Arabic presentation where applicable. |  |  |
| W1 | Waha narrow viewport | In Arabic on a narrow viewport, administrator Waha credential rows keep the Active badge and Revoke action legible and usable. |  |  |
| T10 | Tenant-decision boundary | Administrator receives `403` when attempting tenant verification approve/reject; the verified owner is the only decision-maker. |  |  |
| R2 | Owner release dry run | Administrator opens the server-provided release plan, verifies affected residents/vehicles/credentials/bookings/paid value, then executes only after review. |  |  |
| R3 | Release rollback | A deliberately failed terminal release leaves records unchanged and creates no completed release operation or identity-deletion job. |  |  |
| R4 | Terminal-operation idempotency | Two concurrent terminal operations produce one real ending and a clear already-ended result, with no duplicate archive/revoke/cancel/delete. |  |  |
| R5 | Booking attribution guard | An unlinked caller cannot create an unattributable booking; retained bookings always keep unit attribution. |  |  |
| T11 | Tenant release | Tenant can request a release; only an administrator executes it; concurrent move-out/admin release reaches one clean ending without `500`. |  |  |
| T12 | Expiry suspension | On the lease-expiry date, tenant access and Waha/gate access suspend, but deletion does not run on day zero. |  |  |
| T13 | Delayed deletion | Configured expiry-deletion delay is honored; a pending renewal blocks deletion until an owner decision. |  |  |
| T14 | Renewal restoration | Owner approval restores access/new lease end; rejection follows delayed deletion rules; mandatory event-12 reminders appear at 30/14/7/1 days without same-day duplicates. |  |  |
| T15 | Lifecycle delivery | Events 12–16 reach the correct recipient/language/channel, honor the mandatory/preference rules, retry correctly, and do not duplicate. |  |  |
| O1 | Ownership initiation | Verified owner initiates only for own unit; administrator can manage permitted cases; tenant/unverified callers are refused; initiation changes no protected data. |  |  |
| O2 | Typed confirmation | Administrator must type the exact unit number before an irreversible release; impact counts match before execution. |  |  |
| O3 | Ownership-release terminal state | Tenant household, tenant vehicles/Waha/bookings/verification remain as required; outgoing owner dependencies reach terminal state; a revoked credential fails at gate immediately. |  |  |
| O4 | Audit/anonymisation | Account deletion and retained-record anonymisation are auditable while ownership history remains usable. |  |  |
| O5 | Ownerless registry | Released and never-registered units appear under ownerless registry filters; ordinary B7 incoming-owner claim removes released status. |  |  |
| O6 | Cancellation idempotency | Ownership cancellation and X3 event 11 occur exactly once within their transaction boundary. |  |  |
| H2-V3 | Dalil — desktop English visual review | On the desktop portal, the Dalil navigation label, page/chat header, approved English opening message, empty-document state, and input placeholder are visible and consistent with mobile. |  |  |
| H2-V4 | Dalil — desktop Arabic visual review | On the desktop portal in Arabic/RTL, the `دليل` navigation label, page/chat header, approved Arabic opening message, empty-document state, and input placeholder are visible and consistent with mobile. |  |  |
| H2-V5 | Dalil — administrator knowledge controls | An administrator sees the knowledge-document audience selector and governance warning; both English and Arabic presentation are visually reviewed. |  |  |
| SG1-GATE | Security Gate — five guard purposes | On one real guard account, the guard visibly completes National-ID resident lookup, Guest Pass, paid Guest Day Pass, move-in/move-out permit, and renovation-permit checks. Record the visible fields and verify no National ID/Iqama is displayed. |  | `evidence/security-guard/SG-Guard-Manual-UAT-Paths-2026-08-25.md` |
| SG9-GATE | Security Gate — physical scanner and manual fallback | On a physical device, attempt Guest Pass, paid Guest Day Pass, and Waha camera scans. If camera hardware is unavailable, record the portal fallback and use manual entry only for live classifier verification; do not call typed input a camera scan. |  | `evidence/security-guard/SG-Guard-Manual-UAT-Paths-2026-08-25.md` |
| SG5-GATE-REALTIME | Security Gate — real-time inactivity timeout | Leave a real guard session untouched for at least 15 minutes while doing unrelated work, then confirm the protected page is replaced by Clerk sign-in and record actual start/return times. |  | `evidence/security-guard/SG-Guard-Manual-UAT-Paths-2026-08-25.md` |

## D. Completion Record

| Field | Record |
| --- | --- |
| UAT environment |  |
| Mobile browser/device |  |
| Desktop/admin/gate environment |  |
| Fresh identities used |  |
| Tester(s) |  |
| Started / completed |  |
| Failed or blocked items |  |
| Corrective evidence |  |
| Management sign-off |  |

## Explicitly Not Carried as Manual Passes

`B6` and `J3` remain automated gates, not Decision 61 manual checks. A signed-out document review may be useful as supplemental observation but cannot replace the authenticated/private-document controls above.

## Sources

- `attached_assets/Stage6C-ACCEPTED-Build-Complete_1787559930996.md`
- `attached_assets/Stage4-ACCEPTED_1787422550225.md`
- `exports/stage-4/Stage-4-Requirements-Traceability-2026-08-22-r1.md`
- `exports/stage4b-delivery-2026-08-21-r3/stage4b-r3-status.md`
- `exports/stage4b-delivery-2026-08-21-r4/stage4b-r4-status.md`
- `exports/stage-5/Stage-5-Phase-1-Implementation-Report-2026-08-22-r2.md`
- `exports/stage-6/Stage-6-Split-Proposal-2026-08-23-r2.md`
- `evidence/stage-6b/Stage-6B-Lifecycle-X3-Verification-2026-08-23.md`
- `evidence/stage-6c/Stage-6C-Conditions-Resolution-2026-08-24.md`