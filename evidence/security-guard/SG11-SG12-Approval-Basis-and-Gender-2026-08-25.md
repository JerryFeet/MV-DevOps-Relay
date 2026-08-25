# SG11 and SG12 — Approval Basis and Gender Evidence

**Date:** 2026-08-25  
**Scope:** Security Guard requirements SG11 and SG12: persist and display each approval basis historically; require recorded gender for owner verification, tenant verification, resident registration, and guest registration, while keeping Guest Day Pass vehicle plates optional.

## Delivered behavior

- Owner-manual and tenant approvals validate the allowed basis values, persist the selected bases, and persist an Other rationale only when Other is selected.
- The admin-only approval-history endpoint returns approved records with their persisted basis and optional rationale. Non-admin callers are denied.
- The administrator page renders a populated approval-history record with requester, unit, Approved status, translated basis labels, and the recorded Other rationale.
- Owner verification, tenant verification, resident registration, and guest registration reject absent or invalid gender values. Accepted values are male and female.
- Guest Day Passes intentionally remain outside the gender requirement. A vehicle plate remains optional; an omitted plate is preserved as null in the owner list response.

## Historical approval-basis durability

A focused owner-manual lifecycle regression approves a title-deed verification with the bases Title deed reviewed and Other, records an Other rationale, deletes the title-deed object, and then proves the approved verification still contains the persisted basis and rationale. The document lifecycle therefore cannot erase the operational approval record.

## Schema and development-data proof (read-only)

The development database was queried read-only on 2026-08-25:

| Table | Gender column | Total rows | Null-gender rows |
| --- | --- | ---: | ---: |
| unit_verifications | present, nullable for legacy history | 0 | 0 |
| residents | present, nullable for legacy history | 0 | 0 |
| guests | present, nullable for legacy history | 0 | 0 |

The canonical baseline includes those three gender columns and check constraints allowing only male or female when a legacy value is present. The forward migration deliberately leaves the columns nullable for records created before the application requirement; new submissions are enforced by the API. The rebuilt development data is empty, so this is not presented as a populated historical-data backfill proof.

## Automated verification

| Check | Result | Evidence |
| --- | --- | --- |
| SG12 owner/tenant/resident/guest validation and optional Day Pass plate | PASS | 117 focused API tests across stage4B1B6Corrections, residentsPortalInvite, vehicleGuestValidation, and stage4I3I4Guards |
| Approval-basis validation, admin-only history, title-deed deletion durability, and approval concurrency | PASS | 42 focused API tests across tenantVerificationAdminBlock and unitVerificationTitleDeedLifecycle |
| Populated administrator approval-history rendering, admin Arabic translations, translation completeness | PASS | 110 focused portal tests |
| Mobile approval-basis translations and bilingual guest form coverage | PASS | 79 focused mobile tests |
| API typecheck | PASS | pnpm --filter @workspace/api-server run typecheck |
| Portal typecheck | PASS | pnpm --filter @workspace/hoa-portal run typecheck |
| Diff whitespace validation | PASS | git diff --check |

The portal UI test renders a deterministic populated history fixture rather than creating a live development verification record. It proves that Alice Smith at unit A 101 is shown as Approved with Title deed reviewed, Other, and the recorded rationale. This avoids mutating business data while still covering the visible admin contract.

## Boundaries

- This evidence makes no production write, deployment, payment change, live business-data change, or automatic schema migration.
- The development database has zero rows in the three historical gender tables. The evidence proves the active new-submission contract and schema shape; it does not claim a populated historical backfill run.
- Day Passes are intentionally excluded from the SG12 gender requirement. This report does not reinterpret that product rule.