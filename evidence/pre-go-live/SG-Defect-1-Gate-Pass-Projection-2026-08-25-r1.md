# Defect 1 — Gate-pass response projection

**Route:** `GET /api/security/gate/passes`  
**Audience:** authenticated gate-role users only  
**Evidence revision:** r1  
**Classification:** corrective privacy control; not a deployment or production-data record

## Unsafe response shape before correction

The route serialized raw guest-pass rows rather than an explicit gate-decision DTO. The externally observable shape was a raw pass record / joined record, including fields from this unsafe set:

`{ id, passUuid, verificationToken, guestId, residentId, nationalId, guestName, vehiclePlate, visitDate, status, raw timestamp fields, ...rawPassFields }`

This was an over-broad representation: internal identifiers and credentials were returned to a shared gate session even though the decision screen does not require them.

## Response shape after correction

Each array entry is now exactly the gate-decision projection:

`{ guestName, hostName, unitNumber, visitDate, vehiclePlate, valid, status, message }`

No token, National ID, pass UUID, guest ID, resident ID, or raw database timestamps are part of the response contract.

## Decision and operational boundary

Gate users retain the minimum information necessary to make an admission decision: the named visitor, named host/unit, scheduled day, optional vehicle plate, validity verdict, status, and explanatory message. The endpoint remains guarded by the existing gate-role authorization check.

## Verification

- API ownership/privacy suite: 69/69 passing.
- Regression assertion checks every returned gate-pass object has no `id`, `guestId`, `residentId`, `nationalId`, or `verificationToken`.
- No live endpoint was queried and no resident, guest, or production record is included in this evidence.
