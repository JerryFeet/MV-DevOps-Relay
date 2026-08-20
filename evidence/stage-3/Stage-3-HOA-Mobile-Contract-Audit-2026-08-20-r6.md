# Stage 3 — HOA Mobile API Contract Audit (r6)

**Audit date:** 2026-08-20  
**Scope:** r6 correction to the r5 J7/H3 mobile evidence.  
**Classification:** Correction evidence — not a Stage 3 acceptance package.

## r6 correction

r5 correctly replaced direct HOA-document `fileUrl` opening with the authenticated `GET /api/documents/:id/download` route. Independent review then found that the web branch opened the returned blob in a new tab only after asynchronous token and fetch work, which can be blocked by browser popup policy.

r6 resolves that user-visible failure:

1. The resident’s press handler opens a blank document window **synchronously before the first await**.
2. A blocked popup becomes a clear resident-visible error.
3. The current Clerk token is then used to fetch `/api/documents/:id/download`.
4. The authorized blob is loaded into the already-open window.
5. A window closed during the download becomes a clear resident-visible error.

No document action opens `item.fileUrl` directly. The stored value is retained only to infer a native cached-file extension after a successful protected download.

## H3 status remains implemented

Guest history continues to use typed `listGuests({ page, limit: 50 })` infinite pagination. The resident sees the loaded/total count, an explicit incomplete-history disclosure, a “Load more guests” action, loading state, refresh, retryable continuation failure, and the combined contents of every fetched page. There is no known state that silently represents an incomplete guest history as complete.

## r6 validation

- `pnpm --filter @workspace/hoa-mobile run typecheck` — **PASS**.
- `pnpm --filter @workspace/hoa-mobile run test` — **PASS: 14 files / 383 tests**.
- Focused mobile correction tests — **PASS: 8 checks**:
  - protected route and bearer header construction;
  - no-token request construction;
  - synchronous document-window creation;
  - popup-blocked error;
  - authorized fetch/header propagation into the already-open window;
  - closed-window error;
  - guest multi-page continuation and omission disclosure;
  - guest continuation error disclosure.
- `pnpm --filter @workspace/api-server exec vitest run src/__tests__/documentsCrossUserPrivacy.test.ts` — **PASS: 14 API authorization/privacy tests**.
- Independent code review — **PASS** after the r6 popup-policy correction.

## Audit boundary

The remaining r5 separate hardening findings are unchanged: vehicles, renovation permits, bookings, announcements, and administrator communications still have one-fetch or bounded paginated-list risks. Full document-library/mobile parity remains Stage 4b. r6 does not claim Stage 3 acceptance, replace focused resident/admin device UAT, or authorize production deployment.