# SG1 — Five-Purpose Security Gate Dashboard Evidence

**Date:** 2026-08-25  
**Scope:** Security Guard requirement SG1: a guard dashboard answers five gatehouse questions without exposing unnecessary resident or permit information.

## Delivered dashboard purposes

1. **Resident identity lookup** — searches by name, National ID/Iqama, or unit and returns only name, unit, and role. National ID/Iqama is an input-only lookup value and is not rendered in the result.
2. **Guest Pass scan** — the unified scanner classifies and evaluates a Guest Pass and gives an entry decision.
3. **Paid Guest Day Pass scan** — the same scanner classifies a Day Pass and shows gate-safe coverage, host, unit, and paid status; it does not expose the payment attempt.
4. **Move-in / move-out permit lookup** — returns the approved decision and permitted dates for the requested unit only.
5. **Renovation permit lookup** — returns the approved decision and permitted dates, plus contractor name and mobile only when allowed.

The Security Gate page is restricted to guard and admin roles. It prominently identifies the active guard session, offers one unified scanner rather than separate credentials panels, and instructs the guard to request physical ID when credential-holder identity is uncertain.

## Automated acceptance coverage

| Layer | Result | What it proves |
| --- | --- | --- |
| Guard dashboard UI | PASS — 27 focused portal tests | A deterministic guard-page journey scans a Guest Pass, scans a paid Day Pass, searches a resident, checks move-in, checks move-out, and checks renovation. It asserts the expected gate-safe fields and that a National ID never appears in the resident result. |
| Scanner and movement controls | PASS | Valid Guest Passes alone receive entry/exit controls; Day Passes do not. Unknown and service-unavailable results are explicit, never blank or misclassified. |
| Gate API projections | PASS — 25 focused API tests | Guard/admin authorization; resident result minimization; National ID/Iqama lookup normalization and hashed rate-limit subjects; approved permit projections; credential classification and dated-status decisions. |
| Portal typecheck | PASS | pnpm --filter @workspace/hoa-portal run typecheck |
| API typecheck | PASS | pnpm --filter @workspace/api-server run typecheck |
| Diff whitespace validation | PASS | git diff --check |

## Data-minimization checks

- Resident results do not include National ID/Iqama, internal IDs, contact details, or staff accounts.
- Renovation results exclude contractor license, permit description, payment status, and internal IDs.
- The unified scanner does not expose raw credential input, internal IDs, payment attempts, or resident photographs.
- Lookup failures show that the system could not be reached; they are not reported as a non-match or rejected permit.

## Evidence boundary

- This is deterministic automated guard-role acceptance at both the rendered dashboard and API boundaries. The development database currently contains no guard account, so a Clerk-authenticated live-browser guard walkthrough was not run and is not claimed here.
- No production write, deployment, payment action, automatic schema migration, or live business-data change was made for this evidence.

---

## Acceptance status update

This preliminary report is superseded for final acceptance by [SG1 and SG5 — Real Guard-Authenticated Walkthrough](SG1-SG5-Real-Guard-Walkthrough-2026-08-25.md). The required real Clerk-authenticated portal/API walkthrough passed on 2026-08-25. Physical-camera hardware scanning remains explicitly manual UAT and is not represented as automated evidence.
