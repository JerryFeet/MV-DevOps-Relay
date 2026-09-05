# Round 2 Remaining Items — Implementation Report

## Delivered

- Canonical building + unit references across API, portal, and mobile visible identity surfaces; users.unitNumber retained as a compatibility field because non-display paths still depend on it.
- Unit Registry portal-access and active Waha-credential indicators, plus vehicle assigned-lot/type details.
- Strict resident and tenant DOB rules, nationality removed from new writes, and exact bilingual false-registration disclaimer.
- View-only PDF, DOCX, and image preview paths with authenticated private-object handling and resident management refusal.
- Owner claims use account-sourced names and mandatory 16-digit deed numbers; new deed upload is retired. Historical deed metadata remains readable/cleanable.
- Current approval wording is Mullak verification; obsolete basis remains historical-only.
- Tenant parking confirmation removed; vehicle registration requires an active lot owned by the caller's canonical unit.
- Exact-message communication confirmation with Send and Back behavior.
- Admin queues and management tools separated; all public administrator-access links removed.
- Baseline advanced through migration 0055 without modifying accepted occupancy migrations 0053/0054 or occupancy behavior.

## Consequences requested before implementation

- C-2: new deed uploads are retired; historical deed records remain for historical viewing and cleanup. The current approval basis is deed_number_verified_against_mullak.
- users.unitNumber cannot yet be retired safely; it remains compatibility-only while visible identity uses canonical units.building + units.unitNumber.
- nationality column is retained nullable for historical compatibility, but forms/API writes no longer require or write it.
- The exact bilingual disclaimer existed in the completed implementation and was confirmed in the browser walkthrough.

## Occupancy preservation

No changes were made to the canonical occupancy engine or migrations 0053/0054. The 0055 migration adds only the nullable title_deed_number field and exact 16-ASCII-digit-or-null constraint.
