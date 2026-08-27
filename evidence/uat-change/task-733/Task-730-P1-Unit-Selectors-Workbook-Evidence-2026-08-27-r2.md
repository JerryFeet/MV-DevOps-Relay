# Task 730 P1 unit-selector workbook evidence — r2

## Result

PASS. A focused Playwright run completed with 9/9 tests passing across real Clerk resident, guard, and admin sessions plus the public homepage project.

## Browser proof

- Owner verification: Building and Apartment are native selectors; 30 building values and apartments 1–34.
- Tenant verification: same contract in English and Arabic screenshots.
- Guard resident and permit workflows: constrained canonical picker; `CE34` enables search while `CC1` and `HOA COMMON` keep submission disabled.
- Unit Registry, Historical Records, and Waha Unit View: 1,020 canonical values (`30 × 34`) and no `CC` or `HOA COMMON`.
- Identifiers remain `/^[A-Z]+$/`, `/^[0-9]+$/`, or `/^[A-Z]+[0-9]+$/` under Arabic UI.
- No resident data, credential, token, or production data is included.

## Deliberate refusal

The test deliberately presents forbidden `CC1`, `HOA COMMON`, and Arabic `و١٤` forms. Passing means the forbidden values are absent or cannot enable submission.

## Retained source and screenshots

- `Task-730-732-browser-evidence-source-r2.ts`
- `Task-730-P1-tenant-verification-en-r2.png`
- `Task-730-P1-tenant-verification-ar-r2.png`
- `Task-730-P1-owner-refusal-r2.png`
- `Task-730-P1-gate-picker-en-r2.png`
- `Task-730-P1-gate-picker-ar-r2.png`
- `Task-730-P1-admin-filters-en-r2.png`

Native mobile sign-in remains deferred. Existing mobile selector source/unit coverage was not represented as a browser session.