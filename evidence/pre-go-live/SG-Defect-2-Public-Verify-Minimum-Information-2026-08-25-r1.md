# Defect 2 — Public QR verification minimum-information response

**Route:** `GET /api/verify?token=…`  
**Audience:** public QR scanner; rate-limited  
**Evidence revision:** r1  
**Classification:** corrective privacy control; not a deployment or production-data record

## Unsafe response shape before correction

A public QR verification response included a verdict alongside visitor/host and operational detail. Its unsafe success shape included this field set:

`{ valid, status, visitDate, message, guestName, hostName, unitNumber, vehiclePlate, reason, passId, passUuid, guestId, residentId, nationalId, sponsorImageUrl, hostImageUrl, … }`

The handler also resolved a Clerk sponsor image for public output. This made identity, operational, and image data visible to an unauthenticated scanner.

## Response shape after correction

For a found pass, including the date-window and normal-verdict branches, public output is allowlisted to:

`{ valid, status, visitDate, message }`

For a missing pass:

`{ valid: false, status: "NOT_FOUND", message }`

For a rate-limited request:

`{ error: "too_many_requests", message }`

No verification token is echoed. No host, visitor, unit, plate, reason, internal ID, National ID, raw timestamp, or Clerk image field is returned.

## T7 operational continuity

The scanner retains the scanned token locally for the authenticated `POST /api/security/gate/entry-exit` request. The server resolves that token to the pass internally and persists the resolved pass ID; it never returns the token to the browser. This preserves entry/exit logging without reopening public disclosure.

## Verification

- API ownership/privacy suite: 69/69 passing.
- Regression tests assert the public verifier allowlist and public rate limiting.
- Token-only movement logging is asserted to persist against the resolved pass ID.
- No live endpoint was queried and no resident, guest, token, image, or production record is included in this evidence.
