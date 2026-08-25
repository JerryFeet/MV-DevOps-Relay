# Go-Live Workbook walkthrough — Section F (Security guard)

**Environment:** development only; real Clerk-authenticated guard session with development-only seeded credentials and permits.  
**Source:** `artifacts/hoa-portal/e2e/guard-gate-walkthrough.spec.ts` and `artifacts/hoa-portal/e2e/helpers/db.ts`  
**Run:** 2 passed (guard setup plus walkthrough).

| Workbook ID | Result | What the screen actually displayed | Screenshot |
|---|---|---|---|
| F1, F3 | PASS | The signed-in guard reached Security Gate and the active-session area named `E2E Guard`. | `screenshots/section-f/guard-gate-walkthrough-Gua-6c747-s-out-after-15-minutes-idle-guard/01-guest-pass-approved.png` |
| F4 | PASS for typed entry; physical scan manual | The camera control reported unavailable in headless browser; typed seeded guest credential returned the approved gate view. | `screenshots/section-f/guard-gate-walkthrough-Gua-6c747-s-out-after-15-minutes-idle-guard/00-camera-unavailable-in-headless-uat.png`, `screenshots/section-f/guard-gate-walkthrough-Gua-6c747-s-out-after-15-minutes-idle-guard/01-guest-pass-approved.png` |
| F5 | PASS for typed entry | Seeded paid Guest Day Pass showed paid status, guest count, unit, and vehicle plate. | `screenshots/section-f/guard-gate-walkthrough-Gua-6c747-s-out-after-15-minutes-idle-guard/02-paid-guest-day-pass-approved.png` |
| F6 | PASS for typed entry | Seeded Waha credential showed holder and unit in the approved view. | `screenshots/section-f/guard-gate-walkthrough-Gua-6c747-s-out-after-15-minutes-idle-guard/03-waha-credential-approved.png` |
| F8 | PASS — deliberate refusal | National-ID lookup showed the resident name and unit. The browser test asserted that neither the submitted National ID nor the fixture email existed in the gate response. | `screenshots/section-f/guard-gate-walkthrough-Gua-6c747-s-out-after-15-minutes-idle-guard/04-national-id-resident-result.png` |
| F10–F12 | PASS | Seeded move-in, move-out, and renovation permit lookups showed approved status; renovation also showed contractor name and mobile. | `screenshots/section-f/guard-gate-walkthrough-Gua-6c747-s-out-after-15-minutes-idle-guard/05-move-in-permit-approved.png`, `screenshots/section-f/guard-gate-walkthrough-Gua-6c747-s-out-after-15-minutes-idle-guard/06-move-out-permit-approved.png`, `screenshots/section-f/guard-gate-walkthrough-Gua-6c747-s-out-after-15-minutes-idle-guard/07-renovation-permit-approved.png` |

## Returned to manual

- **F2:** resident/admin route refusal was not re-walked in the screenshot run.
- **F4–F6 physical scan:** real barcode/QR and camera on a real device remain manual.
- **F7:** expired/revoked/wrong-date visible reason was not seeded in this run.
- **F9:** unit lookup privacy view was not re-walked.
- **F13:** Arabic guard screen was not re-walked.
- **F14:** the test’s browser clock captured the timer screen, but the workbook requires a genuine 15-minute idle; manual.
- **F15:** live suspension of an open guard session was outside the requested automation scope.
