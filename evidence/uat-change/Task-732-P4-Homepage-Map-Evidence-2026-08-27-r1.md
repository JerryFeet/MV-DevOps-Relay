# Task 732 — P4 Homepage Map Location Evidence

**Date:** 2026-08-27  
**Decision:** PASS — implementation and responsive browser evidence complete  
**Scope:** Pin the public homepage map to Madain Village.

## Accepted location

- Plus Code: `RQGJ+V8 Al Munsiyah, Riyadh`
- Full Plus Code: `7HP8RQGJ+V8`
- Center: `24.8271875, 46.7808125`
- Zoom: `17`

## Implementation evidence

- The homepage map embed uses the accepted coordinates and zoom.
- The existing homepage contact email is unchanged.
- The map container remains responsive and centered without horizontal overflow.
- Regression tests pin the coordinates, Plus Code, and zoom to prevent location drift.

## Browser evidence

Responsive browser verification passed at:

- Desktop: 1440 px viewport — centered, no horizontal overflow.
- Mobile portrait: 390 px viewport — centered, no horizontal overflow.
- Mobile landscape: 844 px viewport — centered, no horizontal overflow.

Local captured references:

- `evidence/task-732-map-location-desktop.jpg`
- `evidence/task-732-map-location-mobile.jpg`

## Automated evidence

- Homepage map location regression tests: passed.
- Portal full suite: **70 files passed; 1,365 tests passed**.
- Portal production build: passed with required `PORT` and `BASE_PATH`.
- Portal typecheck and translation guard: passed.
- Final full browser E2E run: **91 passed; 7 skipped; 0 failed** across 98 tests.
- `git diff --check`: passed.

## Security and release boundaries

- No schema change, migration, or database push was performed.
- No production deployment was performed.
- Native mobile sign-in remains deferred.
- No credentials, personal data, or private location data are included in this evidence; the location is the approved public community location.

## Deviations

None from the accepted P4 contract.
