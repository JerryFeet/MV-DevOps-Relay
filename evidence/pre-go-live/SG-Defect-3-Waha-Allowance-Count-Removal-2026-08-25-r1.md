# Defect 3 — Waha verification allowance-count removal

**Route:** `GET /api/verify/waha?token=…` or `?passNumber=…`  
**Audience:** authenticated gate-role users only  
**Evidence revision:** r1  
**Classification:** corrective privacy control; not a deployment or production-data record

## Response shape before correction

The authenticated Waha verification result included an unnecessary same-day allowance metric:

`{ valid, status, passNumber, credentialIndex, holderName, occupancyTrack, unitNumber, revocationReason, sameDayGuestCount, message }`

`sameDayGuestCount` disclosed an aggregate that is not required to decide whether a Waha credential admits its holder.

## Response shape after correction

The result remains an authenticated gate-decision response but omits the aggregate:

`{ valid, status, passNumber, credentialIndex, holderName, occupancyTrack, unitNumber, revocationReason, message }`

The portal result card no longer renders or warns on a same-day guest-count value.

## Decision and operational boundary

This correction removes only the extraneous allowance-count disclosure. It does not change Waha pass status evaluation, lost/stolen/revoked handling, gate-role authorization, or payment-attempt retention.

## Verification

- API ownership/privacy suite: 69/69 passing.
- Regression coverage asserts `sameDayGuestCount` is absent from the Waha verifier response.
- Focused portal scanner/privacy suite: 59/59 passing; legacy count rendering assertions were removed because the field is no longer part of the UI contract.
- No live endpoint was queried and no resident, credential, or production record is included in this evidence.
