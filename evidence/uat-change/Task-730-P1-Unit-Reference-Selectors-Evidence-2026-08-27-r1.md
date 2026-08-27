# Task 730 — P1 Unit Reference Selectors Evidence

**Date:** 2026-08-27  
**Decision:** PASS — implementation and regression evidence complete  
**Scope:** Replace resident-facing free-text unit entry with constrained, canonical building/apartment selectors while preserving approval-time physical-unit verification.

## Accepted contract

- Buildings: `A`–`Z`, `CA`, `CB`, `CD`, `CE` (30 values).
- `CC` is intentionally omitted.
- Apartments: `1`–`34`.
- Values use Latin letters and Western digits in both English and Arabic.
- `HOA COMMON` remains a valid stored system unit but is never offered in resident selectors.
- Selection validates syntax only; administrative approval still determines physical-unit existence.
- Security Gate uses a constrained searchable picker and cannot submit arbitrary unit text.

## Implementation evidence

- `lib/unit-reference/src/index.ts` is the shared canonical option, composition, and validation contract.
- Portal owner/tenant verification uses separate building and apartment selectors.
- Portal Security Gate resident and permit lookups use the constrained canonical typeahead.
- Portal historical records, unit registry, and admin/Waha searches use canonical unit references.
- Mobile unit verification and move-permit forms use touch-friendly building/apartment selectors.
- Gate E2E fixtures now use a canonical unit reference and prove the live permit lookup flow.
- Unit Registry E2E evidence reads the live API result and confirms `HOA COMMON` is absent from both returned records and selectable options.

## Automated evidence

- Portal unit selector contract tests: passed.
- Portal full suite: **70 files passed; 1,365 tests passed**.
- Mobile full suite: **18 files passed; 403 tests passed**.
- API full suite: **98 files passed; 1,412 tests passed; 21 skipped**.
- Focused browser correction run: **7 passed; 2 skipped**.
- Final full browser E2E run: **91 passed; 7 skipped; 0 failed** across 98 tests.
- Portal, mobile, and API typechecks: passed.
- Translation guard, React type-version pin, H4 schema-integrity guard, and `git diff --check`: passed.

## Security and data boundaries

- No schema change or database migration was introduced.
- No production data was accessed or published.
- No resident personal data, credentials, tokens, or storage identifiers are included in this evidence.
- Existing stored `HOA COMMON` behavior is unchanged.

## Deviations

None from the accepted P1 contract.
