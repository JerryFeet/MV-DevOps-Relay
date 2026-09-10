# Round 4 — B4 and D-17 through D-22 Publication Manifest

**Evidence date:** 2026-09-10  
**Repository:** `JerryFeet/MV-DevOps-Relay`  
**Branch:** `main`  
**Publication format:** individual files; no ZIP

## Files

| File | SHA-256 |
|---|---|
| `Round-4-B4-Waha-Enumeration-2026-09-10-r1.md` | `fdd5df3a8bae4ad1968411f0be4f5f80e2a054a8e9675c43574ba42429182e14` |
| `Round-4-D17-D22-A1a-Matrix-2026-09-10-r1.md` | `98ddc313f17858fe564b5e63bea5f686dbc9f2293121900fe6ea2d4f8c15be03` |
| `Round-4-B4-D17-D22-Canonical-Gate-PASS-2026-09-10-r1.txt` | `76667ce88c7c3361d3521d9f73fcf4dbcbcbff903058df48fab972203a6b8ae9` |

## Relay publication objects

| File | Evidence commit | Git blob |
|---|---|---|
| `Round-4-B4-Waha-Enumeration-2026-09-10-r1.md` | `7b2071c21425cdb84f0466da3aa2db9fa0a61d75` | `0dd581727fab2984dd4346e4355fd59ea47bf66e` |
| `Round-4-D17-D22-A1a-Matrix-2026-09-10-r1.md` | `ec9c0d22cbf571782850beee2d587dd1f3a8abcd` | `ab151cf9ad485540b777468b4d1675ae8ad6f2a1` |
| `Round-4-B4-D17-D22-Canonical-Gate-PASS-2026-09-10-r1.txt` | `f37d284d3a019cbf75742a2b21b5535776e46efa` | `f845d27f20ba06ca2d826048f7d48965a0a08f10` |

The final evidence-content commit before this manifest is `f37d284d3a019cbf75742a2b21b5535776e46efa`.

## Acceptance summary

- B4 Waha enumeration is complete for the investigated candidates.
- Concurrent replacement payment and concurrent direct revocation are **Family A** and corrected with real serialization boundaries.
- Direct revocation versus terminal lifecycle release is **Family B** and corrected to one authoritative outcome.
- Concurrent initial application is disproven as Family A by canonical admission locking plus the existing live partial unique index.
- D-17 and D-22 are **neither family**.
- D-18 through D-21 are **Family B** and are denied in both the portal and direct APIs.
- The sole canonical gate passes **337/337**: API 284, portal 14, browser 39.
- No schema operation or immutable-protection bypass ran.

## Boundaries

- External email/push delivery, physical gate scanning after revocation, provider refunds, and later lifecycle reversals are not claimed by this delivery.
- The Waha application mock regression does not independently execute a two-session PostgreSQL race or query the live catalog.
- The publication manifest records local content hashes; immutable GitHub blob and commit IDs are verified after publication and reported in delivery.