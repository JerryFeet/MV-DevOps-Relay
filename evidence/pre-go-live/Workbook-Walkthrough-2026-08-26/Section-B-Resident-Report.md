# Go-Live Workbook walkthrough — Section B (Resident)

**Environment:** development only; real Clerk-authenticated verified-owner session and seeded active Waha Pass.  
**Source:** `artifacts/hoa-portal/e2e/workbook-resident-walkthrough.spec.ts`  
**Run:** 7 passed, 1 skipped. No form submission, upload, deletion, booking, or production access.

| Workbook ID | Result | What the screen displayed | Screenshot |
|---|---|---|---|
| B3 | PASS | Waha Pass said “Madain Village resident facility-access credential”; no “gate access” text was rendered. | `screenshots/section-b/workbook-resident-walkthro-10b34--facility-access-credential-workbook-resident/B03-01-waha-facility-access.png` |
| B5 | PASS | The Add Member form showed the country-code selector set to `SA` / `+966`, with Saudi Arabia identified as the active phone country. | `screenshots/section-b/workbook-resident-walkthro-4a023-or-defaults-to-Saudi-Arabia-workbook-resident/B05-01-saudi-phone-selector.png` |
| B6 | PASS — deliberate refusal | Documents rendered without Add Folder, Add Document, upload, delete/remove, or file-input controls for the resident. | `screenshots/section-b/workbook-resident-walkthro-e1d0e-or-file-management-controls-workbook-resident/B06-01-documents-read-only.png` |
| B8 | PASS | Resident navigation had no Maintenance link; `/portal/maintenance` rendered the portal’s not-found screen. | `screenshots/section-b/workbook-resident-walkthro-a4a1c--resolves-to-the-portal-404-workbook-resident/B08-01-resident-navigation-no-maintenance.png`, `screenshots/section-b/workbook-resident-walkthro-a4a1c--resolves-to-the-portal-404-workbook-resident/B08-02-maintenance-route-404.png` |
| B9 | PASS | Dalil introduced itself as a Madain Village guide and stated that it has no access to personal information such as unit, bookings, payments, or household. | `screenshots/section-b/workbook-resident-walkthro-a5cab-no-personal-data-disclosure-workbook-resident/B09-01-dalil-intro-no-personal-data.png` |

## Observed but not sufficient to close a workbook ID

The calendar opened and displayed a formatted date plus an available `HH:MM` slot. These screenshots are retained, but they do **not** prove the exact 14-day boundary, half-hour cadence, Thursday/Friday 01:00 cutoff, `00:30` representation, or Sunday–Wednesday 23:00 cutoff:

- `screenshots/section-b/workbook-resident-walkthro-3e178-ded-availability-is-visible-workbook-resident/B12-01-calendar-boundary-and-date-format.png`
- `screenshots/section-b/workbook-resident-walkthro-3e178-ded-availability-is-visible-workbook-resident/B12-02-available-slot-display.png`

## Returned to manual

- **B1–B2:** not in the requested automated scope.
- **B4:** the exact parking label is only on the owner-verification form. The authenticated fixture is already verified; reopening that form would mutate its verification lifecycle.
- **B7:** not in the requested automated scope.
- **B10–B11:** no seeded published Dalil knowledge set exists. Calling the live assistant would not create a deterministic, reviewable answer.
- **B12.1–B12.5:** the walkthrough only captured the calendar and one available slot; each exact business-rule display remains manual.
