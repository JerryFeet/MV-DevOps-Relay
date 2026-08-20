# HOA Stage 4b — Schema and Authorization Source Snapshot (r2)

**Snapshot date:** 2026-08-20  
**Purpose:** Human-reviewable source summary for the Stage 4b r2 folder-visibility correction. This file contains no user records, document contents, object keys, credentials, or production output.

## Library data model

`document_folders` stores the bilingual folder name, default visibility, default download mode, display order, active state, and triage state.

`documents` stores an immutable library placement (`folder_id`), the document visibility, download mode, archival/replacement metadata, and legacy compatibility fields. The current visibility values, from least to most restrictive, are:

1. `all_portal_users`
2. `verified_owners`
3. `admin_only`

The `documents` model retains `is_public` only for staged legacy compatibility. It is not consumed by the Stage 4b document authorization path.

## Source-of-truth authorization

The authenticated documents route resolves an effective visibility by taking the stricter of a document's requested visibility and its folder default. It uses that result for listing, metadata lookup, authenticated download, and link generation.

The route also blocks:

- inactive or triage folders for non-admin callers;
- non-admin callers whose role/verification state does not meet the effective visibility;
- direct uploads by non-admin callers;
- attempts to place a document below its folder's visibility floor;
- attempts to tighten a folder while its existing documents remain less restrictive.

## Database enforcement

Application checks are not the only protection. The database has two triggers:

| Trigger | Guarded action | Rejection condition |
|---|---|---|
| `documents_visibility_floor_guard` | document insert/update of folder or visibility | document rank is below folder rank |
| `document_folders_visibility_floor_guard` | folder default visibility update | the new tighter floor would invalidate an existing document |

The migrations also assert that no document/folder violation remains after mapping or repair.

## `is_public` retirement boundary

The legacy field must remain inert—not deleted—until a reviewed post-Stage-4-acceptance cleanup confirms that:

1. every retained legacy document has a valid folder and visibility;
2. the former public-homepage document contract has been formally retired; and
3. no authorization, listing, download, or link-generation path reads the field.

Only then may a dedicated migration remove it.

## Relevant source authorities

- `lib/db/migrations/0026_stage4b_document_library.sql` — corrected first-run mapping and invariant installation
- `lib/db/migrations/0027_stage4b_document_visibility_floor_fix.sql` — repair for databases that previously received r1
- `lib/db/src/schema/documents.ts` — application schema
- `artifacts/api-server/src/routes/documents.ts` — API authorization and folder lifecycle validation
- `scripts/stage4b-folder-floor-fixture.sql` — isolated migration proof
