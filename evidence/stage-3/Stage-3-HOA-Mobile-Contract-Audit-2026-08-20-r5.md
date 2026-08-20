# Stage 3 — HOA Mobile API Contract Audit (r5)

**Audit date:** 2026-08-20  
**Scope:** Every active HOA Mobile API-consuming resident or administrator list, plus the two r4 mobile contract mismatches.  
**Classification:** Correction evidence — not a Stage 3 acceptance package.

## r5 correction result

| r4 mismatch | r5 result | Automated evidence | Acceptance state |
|---|---|---|---|
| J7 — HOA document access | **Implemented.** Both HOA-document and personal-document actions build an authenticated `GET /api/documents/:id/download` request using the current Clerk token. No document action opens `item.fileUrl` directly; the stored URL is retained only to derive a local filename extension for a completed authorized download. | `authenticatedDocumentDownload.test.ts` verifies the protected endpoint and bearer header. `documentsCrossUserPrivacy.test.ts` passes 14 API authorization/privacy checks, including unauthenticated rejection and cross-resident denial. | **Implemented — resident UAT pending.** This is the immediate routing repair only; document-library parity remains Stage 4b work. |
| H3 — complete guest history | **Implemented.** Guests use the generated typed `listGuests` contract in a React Query infinite query, requesting `page` and `limit=50`. The screen flattens every fetched page, exposes a “Showing *n* of *total*” count, and provides “Load more guests.” | `GuestPagination.test.tsx` covers first-page omission disclosure, request for the next page, two-page rendering, and retryable page-load failure. | **Implemented — resident UAT pending.** A resident is never shown a partial result set without the count and explicit notification that more history exists. |

## Active mobile-list audit

This is a source/API-contract audit. It reports any currently single-fetch use of a paginated API as a separately actionable risk rather than silently treating the r5 guest repair as universal.

| List screen | Current client behavior | Contract / finding | State |
|---|---|---|---|
| Guests | Typed paged request with explicit continuation, count, loading, refresh, and retryable partial-history disclosure. | `GET /api/guests` is paginated. | **Fixed in r5.** |
| Documents | Generated `useListDocuments` result. | Current document list contract is an array; file retrieval is now routed through the authenticated download endpoint. | **J7 fixed; full library parity deferred to Stage 4b.** |
| Vehicles | One `GET /api/vehicles` request. | The vehicle list contract is paginated; a resident with more than the server default can receive an incomplete history. | **Open separate hardening defect — MOB-LIST-001.** |
| Renovation permits | One `GET /api/permits?limit=200` request. | The explicit cap can omit permits beyond 200. | **Open separate hardening defect — MOB-LIST-002.** |
| Bookings | One generated `useListBookings` request. | The bookings list contract is paginated; continuation is not implemented in this screen. | **Open separate hardening defect — MOB-LIST-003.** |
| Announcements | One generated `useListAnnouncements` request. | The announcements list contract is paginated; continuation is not implemented in this screen. | **Open separate hardening defect — MOB-LIST-004.** |
| Communications (administrator screen) | One `GET /api/communications` request, gated to administrators. | The administrator communications list is paginated; continuation is not implemented. It is not resident-reachable in the current navigation. | **Open separate hardening defect — MOB-LIST-005.** |

## Test and runtime verification

- `pnpm --filter @workspace/hoa-mobile run typecheck` — **PASS**.
- `pnpm --filter @workspace/hoa-mobile run test` — **PASS: 14 files / 380 tests**.
- Focused mobile tests — **PASS: 5 new correction checks** (two authenticated-download request checks and three pagination checks).
- `pnpm --filter @workspace/api-server exec vitest run src/__tests__/documentsCrossUserPrivacy.test.ts` — **PASS: 14 tests**.
- The Expo workflow was restarted and its direct Expo preview rendered the sign-in screen without a fatal load error. The browser tester could not exercise an authenticated mobile tab because its automation target was routed to the shared portal proxy instead of the Expo-specific host. This is recorded as an environment-routing limitation, **not** as resident UAT evidence.

## Audit boundary

This r5 audit closes neither formal Stage 3 acceptance nor the remaining focused resident/admin browser/device UAT. It does not conceal the five independent pagination hardening findings above, and it does not enlarge J7 into the Stage 4b document-library project.