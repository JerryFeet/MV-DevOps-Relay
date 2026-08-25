# Gate defect fixes — consolidated evidence

Evidence revision: r2
Relay: JerryFeet/MV-DevOps-Relay, branch main
Classification: corrective privacy and gate-operation evidence only

## Defect 1 — GET /api/security/gate/passes

Before: the route serialized raw guest-pass records, exposing an over-broad shape containing id, passUuid, verificationToken, guestId, residentId, nationalId, raw timestamps, and pass data not needed for a gate decision.

After: each item is exactly { guestName, hostName, unitNumber, visitDate, vehiclePlate, valid, status, message }.

National ID/Iqama, verification tokens, pass UUIDs, guest/resident IDs, and raw timestamps are not returned.

## Defect 2 — GET /api/verify?token=...

Before: the public response combined the verdict with guest/host details, identifiers, unit/plate/reason data, and a Clerk sponsor image URL.

After: a found pass returns exactly { valid, status, visitDate, message }. A missing pass returns { valid: false, status: NOT_FOUND, message }; rate limiting returns { error: too_many_requests, message }.

No host name, guest name, unit, plate, reason, identifier, National ID, token, or image is returned. The public rate limit remains active.

T7 continuity: the gate browser submits the scanned token to the authenticated entry/exit route; the server resolves the pass and persists the resolved pass ID. The token is never returned. Guest movement logging remains functional.

## Defect 3 — GET /api/verify/waha

Before: the authenticated gate response included sameDayGuestCount in addition to the Waha decision fields.

After: the response remains { valid, status, passNumber, credentialIndex, holderName, occupancyTrack, unitNumber, revocationReason, message }.

The unnecessary allowance-count field is absent from the API contract and portal result UI. Waha validity and status handling are unchanged.

## Verification

API ownership/privacy suite: 69/69 passing before the additional server-resolved-ID assertion; combined focused API run after that assertion: 80/80 passing.
Portal scanner/privacy suite: 59/59 passing.
Token-only movement regression asserts the persisted pass ID is the server-resolved ID, not an optional request field.
No live endpoint, production data, or credential was used.
