# Round 1 — Mandatory Tenant and Resident Fields

Date: 2026-09-03  
Environment: Development  
Production/Publish: Not performed

## Delivered contract

- New tenant verification submissions require date of birth, nationality, gender, and a valid mobile number.
- Tenant approval copies date of birth and nationality into the automatically created resident.
- New household resident creation requires identity fields, date of birth, nationality, gender, and a valid mobile number.
- Owner verification does not require tenant-only date of birth or nationality.
- Historical verification and resident rows remain nullable; no completeness framework or historical backfill was introduced.
- Existing incomplete UAT records were not modified.

## Database and application scope

- Nullable tenant date-of-birth and nationality fields were added to unit verification storage.
- Nullable resident nationality was added.
- The development DDL was applied; no production schema operation was performed.
- Portal and mobile tenant forms send and validate the mandatory fields.
- API validation remains authoritative.

## Verification

- Focused API regression: 242 tests passed across 8 files.
- API type check: passed.
- Portal type check: passed.
- Mobile type check: passed.

This is implementation evidence, not production approval.