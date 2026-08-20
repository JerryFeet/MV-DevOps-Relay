# Stage 3 — HOA Mobile API Contract Audit (r4)

**Audit date:** 2026-08-20  
**Scope:** Every current HOA Mobile API-consuming resident screen and hook, checked against the active API contract after Stage 1, 2, 2b, and 3 changes.

## Audit result

This is a complete source/API-contract inventory, not a replacement for focused browser/device UAT. It distinguishes confirmed resident breaks from hardening gaps that have not been reproduced as current failures.

## Confirmed mismatches

| Screen | Active contract | Resident-visible result | Stage cause | Severity | State |
|---|---|---|---|---|---|
| Renovation permits | Stage 3 G2/G4/G5 requires five active scope IDs, common-area impact, conditional details, and canonical Saudi E.164 mobile. | The former mobile payload was rejected even when a resident completed the form. | Stage 3 API contract changed while mobile retained retired IDs and omitted fields. | **P0** | **Fixed.** Current mobile sends the five IDs, impact choice/details, and E.164 number. |
| HOA documents | Private documents must open through authenticated `GET /api/documents/:id/download`. | The screen opens `fileUrl` directly, so a resident cannot open a private HOA document through the authorized flow. | Stage 2/2b private-object access, with a mobile public-URL assumption left behind. | **P1** — affected document access is blocked; no data corruption and not every resident workflow is blocked. | **Planned; not fixed.** Reuse the authenticated download flow used for personal documents. |
| Guests | `GET /api/guests` is paginated. | Only the first page is rendered; residents with more than the default page size cannot see older guests and are not told entries are omitted. | Stage 1/2 pagination contract, with a single-fetch mobile list left behind. | **P1** — list history is incomplete, but registering a guest and current passes remain available. | **Planned; not fixed.** Add explicit load-more or infinite pagination. |

## Reviewed and contract-consistent

| Area | Result |
|---|---|
| Dashboard | Current profile, pinned announcements (`isExpired`), and upcoming-booking response use are contract-consistent. |
| Profile and personal-document upload | `users/me`, notification preferences, upload request URL, and document creation match active request/response contracts. |
| Announcements and bookings | Generated query clients match active list contracts; dashboard use of announcement expiry and booking status is consistent. |
| Vehicles | The ordinary vehicle flow remains valid. Optional basement/document scenarios need fixture coverage but are not proven runtime failures. |
| Communications | The screen gates its list to administrators. The resident endpoint remains `/api/communications/mine`; no resident-reachable mismatch is established because current resident navigation does not expose this screen. |
| Waha Pass and Guest Day Pass | Eligibility, pass, and verification paths are contract-consistent. Replacement/credential state fixture coverage remains a hardening gap, not a reproduced failure. |
| Unit verification | Owner/tenant submission paths and current status display are contract-consistent; the status map should be kept exhaustive as lifecycle values evolve. |
| HOA assistant | Authenticated streamed `POST /api/ai/chat` uses the expected message/history request shape and stream event handling. |
| Push-token registration | Authenticated `POST /api/push-tokens` sends the current token/device ID request shape. |

## Audit completion statement

No active mobile API-consuming resident screen or hook is unexamined in this audit: dashboard, profile, announcements, bookings, permits, vehicles, guests, documents, communications, Waha Pass, unit verification, HOA assistant, and push-token registration are all covered above. This completion statement does **not** mark the two P1 findings resolved or replace the focused resident/admin browser UAT required for Stage 3 acceptance.

## Remaining hardening gaps (not confirmed breaks)

- Vehicle optional basement-parking and registration-document scenarios need fixture coverage.
- Guest/pass status enum rendering, booking cancellation with stale state, Waha replacement/credential states, and unit-verification future status values need focused fixtures.
- These are deliberately not promoted to release-blocking defects without a current contract mismatch or reproducible resident failure.