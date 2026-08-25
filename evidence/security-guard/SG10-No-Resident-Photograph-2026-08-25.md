# SG10 — No Resident Photograph Requirement Evidence

**Date:** 2026-08-25  
**Scope:** Security Guard requirement SG10: no personal photograph is collected, stored, requested, or displayed for residents; guards use a physical ID card when credential-holder identity is uncertain.

## Product and legal constraint

The approved SG10 requirement is a Saudi cultural and legal constraint: resident photographs, including women’s photographs, must not be collected. This supersedes the former C2 registration-photo requirement and former H8a resident-photo deletion behavior. A pass proves its credential validity and names its holder; it does not prove the presenter is that holder.

## Delivered behavior

- The gate Scanner visibly states in English and Arabic: it confirms that the pass is valid and names the holder; where a guard is unsure, the guard asks to see the person’s physical ID card.
- The Scanner view has no resident photo/avatar element or image result field.
- The active resident API response uses a defense-in-depth projection that removes a legacy `idPhotoKey` even from mock/legacy-shaped records.
- Registration and resident invitation routes accept complete residents without collecting or returning a photo key.
- The portal/mobile resident identity displays use text or initials, not a resident photograph. Static source inventory found no resident-photo upload/display path in active portal, mobile, or API production source.

## Schema and development-data proof (read-only)

The development database was queried read-only on 2026-08-25:

| Check | Result |
| --- | --- |
| `public.residents.id_photo_key` exists | `false` |
| `public.resident_photo_deletion_jobs` exists | `false` |
| `public.residents` row count | `0` |

The active cleanup migration removes both the retired column and photo-deletion outbox. With the column absent and the rebuilt development residents table empty, no resident row can retain a photo key in development. This evidence does **not** claim a fresh storage-bucket enumeration in this slice; the active source has no resident-photo object path, and prior baseline notes record the bucket was empty. That boundary is stated explicitly to avoid treating historical evidence as a current read.

## Automated verification

| Check | Result | Evidence |
| --- | --- | --- |
| Self-registration no-photo contract | PASS | verifies response contains no `idPhotoKey` |
| Household invitation no-photo contract | PASS | verifies response and stored resident contain no `idPhotoKey` |
| Resident registration/invitation API suite | PASS | 62 focused tests |
| Gate wording/UI, Arabic completeness, translation fallback | PASS | 19 focused portal tests |
| API typecheck | PASS | `pnpm --filter @workspace/api-server run typecheck` |
| Portal typecheck | PASS | `pnpm --filter @workspace/hoa-portal run typecheck` |
| Portal service restart | PASS | Vite restarted cleanly |

A shared invitation test fixture was updated to include the already-required `gender` field. Before that fixture correction every invitation case returned the route’s documented validation `400`, preventing the no-photo contract from being exercised. No runtime photo behavior changed as part of that correction.

## Real-browser acceptance check

A Playwright testing agent signed in as the existing `E2E Admin` development user and loaded `/portal/security-gate` without submitting a credential, search, permit lookup, or movement action. The Scanner visibly showed the credential-validity/holder text and physical-ID instruction. No resident photo/avatar appeared in the Scanner content area, no application API request failed, and no browser error occurred. No business data was created or changed.

## Boundaries

- This slice makes no production write, deployment, payment change, storage write, schema change, or personal-data collection change.
- Generic documents/facility-image capabilities remain separate from resident identity and are not evidence of a resident-photo feature.
- Earlier H8 lifecycle evidence that describes retaining or deleting resident-photo keys is superseded by SG10 and must not be used as current SG10 acceptance proof.