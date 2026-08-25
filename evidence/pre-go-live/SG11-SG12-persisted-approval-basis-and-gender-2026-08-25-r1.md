# SG11 and SG12 persisted application slice

## Scope
- SG11: approval basis is mandatory for owner and tenancy approvals; Other requires explanation; values persist with the verification decision record.
- SG12: male/female gender is mandatory for owner verification, tenant verification, resident registration, and guest registration; it is persisted as a record attribute only.

## Explicit exclusions
- No Mullak/Ejar integration, biometric/photo handling, gender-based filtering, reporting, eligibility, booking, or facility behavior.
- Guest Day Pass gender remains absent. The optional day-pass vehicle-plate schema column is present but SG9 flow work is not claimed here.

## Verification
- Development migration 0042 applied directly as one static forward migration; no drizzle push and no historical migration replay.
- Database read-back: unit_verifications approval/gender columns=3; resident gender=1; guest gender=1; day-pass vehicle plate=1; null gender counts were 0, 0, 0.
- API, portal, and mobile typechecks passed.
- API approval-boundary suite: 20/20 passed.
- Portal Arabic layout coverage: 102/102 passed.
- Mobile guest-form bilingual and sentinel coverage: 78/78 passed.

## Evidence discipline
The source, schema, runtime database state, and focused tests were read back before publication.
