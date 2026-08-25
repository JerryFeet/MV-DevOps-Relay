# SG6 — National ID/Iqama Gate Lookup Evidence

**Date:** 2026-08-25  
**Scope:** Security Guard requirement SG6; gate resident lookup by name, National ID/Iqama, or unit.

## Delivered behavior

- `GET /api/gate/residents` is restricted to `admin` and `guard`; owner, tenant, and supervisor callers are denied.
- The endpoint accepts one of `name`, `nationalId`, or `unitNumber`.
- Every successful resident result is the minimal projection `{ firstName, lastName, unitNumber, role }`. It contains no database ID, Clerk ID, email, National ID/Iqama, phone, or other contact field.
- National ID/Iqama input is normalized before matching. Malformed, unknown, and non-matching values return the same empty response (`[]`), so the endpoint does not reveal identifier existence through response shape.
- Unit input is normalized across spaces and hyphens, so equivalent forms such as `B 202` and `B-202` resolve consistently.

## Fixed-window and identifier-storage decision

SG6 follows the established T7 durable **fixed-window** limiter. This is intentionally one shared implementation, not a new rolling-window mechanism.

For a National ID/Iqama request, the route consumes two durable limits before querying residents:

1. per authenticated account — `gate_national_id_account`;
2. per searched identifier — `gate_national_id_value`.

Both use the existing 5-per-minute / 100-per-day fixed-window counter. The counters persist only `scope` and `subject_key` values. The identifier subject is `gate-identifier:<sha256>` of the **normalized** identifier: the raw National ID/Iqama is not written to the counter table or the failed-lookup log. Normalizing before hashing also prevents whitespace/hyphen variants from evading a shared identifier limit.

Failed identifier lookups log only the opaque subject, caller context, generic reason, and the generic text `No matching resident found.`; the submitted identifier is never logged.

## Source read-back

- `artifacts/api-server/src/routes/users.ts`: gate-only authorization; query selection; pre-query durable account and identifier limits; minimal DB selection; generic failed-identifier audit event.
- `artifacts/api-server/src/lib/gateResidentSearch.ts`: National-ID/Iqama and unit normalization, safe resident projection, indistinguishable empty results, and normalized SHA-256 subject derivation.
- `artifacts/api-server/src/lib/durableRateLimit.ts` and `lib/db/src/schema/apiRateLimitCounters.ts`: the shared database-backed fixed-window implementation and its stored fields.
- `artifacts/hoa-portal/src/pages/portal/SecurityGate.tsx`: Name / National ID-Iqama / Unit mode selector, endpoint query selection, and active-session identity panel.

## Automated verification

| Check | Result | Evidence |
| --- | --- | --- |
| API lookup tests | PASS | `pnpm --filter @workspace/api-server exec vitest run src/__tests__/gateResidentSearch.test.ts` — 19 tests passed |
| API typecheck | PASS | `pnpm --filter @workspace/api-server run typecheck` |
| Gate ownership/access regression tests | PASS | `gateResidentSearch.test.ts` plus `ownership.test.ts` — 91 tests passed |
| Portal gate UI tests | PASS | `pnpm --filter @workspace/hoa-portal exec vitest run src/__tests__/gateResidentsTabVisibility.test.tsx src/__tests__/gateSession.test.ts` — 14 tests passed |
| Portal typecheck | PASS | `pnpm --filter @workspace/hoa-portal run typecheck` |
| Workflow startup | PASS | API server rebuilt and listened on port 8080; portal Vite server restarted cleanly |

The lookup tests cover role access, name search, National-ID/Iqama owner and tenant matches, strict projection privacy, malformed/unknown/non-match equivalence, opaque subject formatting, normalized-hash equivalence, and normalized unit matching.

## Real-browser verification

A fresh-browser Clerk programmatic login as the configured E2E admin passed at `/portal/security-gate`:

- active-session panel visibly identified `E2E Admin`;
- Residents showed `Name`, `National ID / Iqama`, and `Unit`;
- selecting the ID/Iqama mode displayed `Enter National ID / Iqama`;
- no resident National ID, Iqama, email, or internal user ID was shown;
- no application console errors or failed API calls were observed. The only warning was Clerk's expected development-key warning.

## Boundaries

- No production write, deployment, payment configuration, migration, or schema change occurred for this SG6 slice.
- The Stage 6 development-schema freeze remains intact.