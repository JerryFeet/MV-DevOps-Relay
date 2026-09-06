# Section 3 — Waha second-credential invariant route matrix

**Draft date:** 2026-09-07  
**Evidence status:** pre-fix runtime evidence plus code audit. Runtime-confirmed
statements are marked **confirmed pre-fix**; all other gaps remain code-audit-only.

## Invariants

| ID | Invariant |
|---|---|
| I1 | A Waha record exposed to a user belongs to that user's current verified, active unit and valid lifecycle state. |
| I2 | Credential 2 is only an active, adult (DOB present and age >=18), portal-enabled active household resident of that application unit. |
| I3 | The applicant/occupancy relationship remains canonical and locked when entitlement state changes. |
| I4 | An active application has exactly Credential 1 and Credential 2; each credential index is unique and state transitions are safe. |
| I5 | Revocation, loss/replacement, release, payment, gate, booking and day-pass consequences preserve the same entitlement lifecycle. |

## Route matrix

| Surface / route | I1 | I2 | I3 | I4 | I5 | Audit evidence / gap |
|---|---|---|---|---|---|---|
| `GET /waha-pass/eligibility` | unit from locked occupancy | classifies DOB/adult/access | `assertActiveOccupantEligibility` | n/a | n/a | Enforces selection rules; source `wahaPasses.ts:137-248`. |
| `POST /waha-pass/apply` | caller-unit resident lookup | preflight precise 422 rules | transaction occupancy recheck | creates application only | n/a | Enforces I1-I3; source `:250-321`. |
| `GET /waha-pass/mine` | **confirmed pre-fix gap** | n/a | n/a | returns all app credentials | n/a | **Confirmed pre-fix:** browser 3a received current units 57 and 58 across attempt/retry while `/mine` repeatedly returned stale unit 47. Audit shows lookup by applicant only, without current unit or allowed status filter (`:332-365`). |
| `GET /waha-pass/admin` | admin role only | enrichment only | n/a | lists all | n/a | Code-audit-only: broad admin list is expected, but no lifecycle filter (`:368-388`). |
| `POST /:id/approve` | confirms locked applicant unit equals app unit | resolves requested resident but does not revalidate I2 at approval | locked occupancy transaction | creates two rows | gate/pass effects later | Code-audit candidate: two inserts without database exactly-two/index-unique constraint; source `:390-505`. |
| `POST /:id/reject` | application id/status | n/a | no occupancy recheck | n/a | decision notification | Code-audit-only lifecycle asymmetry: no transaction/lock comparable to approval (`:507-568`). |
| `POST /:id/revoke` | application state | n/a | admin only | may revoke one/all | cancels bookings best effort | Code-audit candidate: per-row writes and booking cancellation outside atomic transaction (`:571-710`). |
| `POST /:id/assign-second` | **confirmed pre-fix gap** | **confirmed pre-fix gap** | **confirmed pre-fix gap** | **candidate gap** | n/a | **Confirmed pre-fix:** browser 3b found `Round3Underage Fixture` in the visible selector. Focused API calls for missing DOB, under-age, no access, and moved-unit application all returned 200. Audit: resident is filtered by caller unit/status only; no DOB/adult/access, app-unit equality, occupancy lock, active Credential 2 existence, or reassignment safety (`:714-779`). |
| `POST /:id/report-lost` | applicant/app active | n/a | applicant check, no occupancy lock | credential transition | replacement starts later | Code-audit candidate: lifecycle checks are route-local and asymmetrical with revoke/release (`:781+`). |
| replacement review / `POST /:id/replacement-pay` | application/credential checks | n/a | route-local | replacement credential flow | provider payment initiation | Code-audit-only; inspect `wahaPasses.ts` replacement handlers and callback before runtime claim. |
| provider callback / payment callback core | payment reference | n/a | callback authorization/idempotency | replacement issuance | lifecycle mutation | Code-audit candidate: replacement callback concurrency needs a focused lock/idempotency proof; no runtime evidence yet. |
| guest day-pass `mine/create/payment/verify` | unit relationship differs by route | n/a | purchaser/guest unit relationship | n/a | paid/issued/gate state | Code-audit candidate: mine/create/gate asymmetry requires a route-by-route authenticated test. |
| dedicated Waha gate scan and unified gate scan | credential token check | n/a | n/a | credential status required | entry decision | Code-audit-only: compare dedicated verify route and unified scanner status/unit semantics. |
| booking create/read/cancel | caller unit + active pass gate | n/a | booking ownership | active credential gate | revoke should cancel future bookings | Existing F8 coverage plus audit: cancellation is best effort from revoke, so atomic relationship is a candidate gap. |
| household removal | resident unit/status mutation | must invalidate C2 eligibility | occupant relationship | must not leave held C2 unsafe | gate/booking impact | Code-audit-only: removal paths require cross-domain regression. |
| tenancy suspend/resume/release | unit active occupancy | resident eligibility changes | canonical occupancy state | application lifecycle coupling | downstream cancellation | Code-audit candidate: release lifecycle must be compared with Waha revoke and credential release paths. |
| ownership verification/release paths | verified owner binding | household access downstream | canonical owner occupancy | app entitlement coupling | release effects | Code-audit-only; `assertActiveOccupantEligibility` is the common protection for apply/approval, not demonstrated for every release path. |
| schedulers | stale lifecycle cleanup | n/a | n/a | expiry/credential state | booking/day-pass cleanup | Code-audit-only: scheduler effects need deterministic clock tests. |

## Confirmed test candidates and boundaries

1. **`/mine` current-unit/status scope — confirmed pre-fix:** browser test 3a used
   fresh run/worker/retry-scoped verified-resident units, navigated normally, and
   failed current user/app unit equality twice: current 57/58 versus returned 47.
2. **Credential-2 UI population — confirmed pre-fix:** dedicated Clerk identity has a stable isolated
   non-system unit, an active application, active C1, unassigned active C2, and a
   marked 15-year-old portal-enabled household resident. Browser test 3b observed
   `["Select household member…", "E2E Round3Waha", "Round3Underage Fixture"]`.
3. **Assign-second API parity — confirmed pre-fix:** focused mock-server tests require the same precise
   `SECOND_RESIDENT_DOB_ABSENT`, `SECOND_RESIDENT_UNDER_18`, and
   `SECOND_RESIDENT_NO_PORTAL_ACCESS` responses as apply, plus old-app/current-unit
   mismatch rejection. All four calls returned 200 before remediation.
4. **Schema/cardinality:** approval creates two credentials in application code, but
   this draft has not established a database `credential_index` uniqueness constraint
   or exactly-two enforcement. Treat as code-audit-only until migration/schema evidence
   and concurrency testing are obtained.

## Evidence handling

The fixtures preserve historical rows and stop on unmarked occupants or applications
in the reserved unit. They use transactions and rollback. The dedicated underage
resident is expressly marked and tolerated on rerun; no browser regression submits an
assignment or otherwise mutates Credential 2.