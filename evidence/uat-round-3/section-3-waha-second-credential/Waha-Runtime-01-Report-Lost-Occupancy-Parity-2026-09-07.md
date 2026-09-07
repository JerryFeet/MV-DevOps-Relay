# Waha Runtime 01 — `report-lost` Occupancy-Lock Parity

Date: 2026-09-07  
Classification: **DISPROVED**

## Question

Does `POST /api/waha-pass/:id/report-lost` reject an applicant who still owns the historical application but whose current canonical occupancy has moved to another unit?

## Runtime method

An executable Supertest regression invoked the real Express route with the project database adapter replaced by the established in-memory persistence harness.

Fixture:

- Unit A had an active Waha application and active credential owned by the applicant.
- The same applicant's current user and active resident linkage were moved to unit B.
- The historical application and credential remained stored against unit A.

Invocation:

```text
POST /api/waha-pass/1/report-lost
{"credentialId":1,"reason":"lost"}
```

## Observed result

- HTTP status: `200`
- Response status: `lost`
- `replacementRequired`: `true`
- Unit A application: remained `active`
- Unit A credential: changed from `active` to `lost`
- Replacement request: created for the unit A credential
- Waha event: `lost_reported` created for the unit A credential

## Conclusion

Occupancy-lock parity is disproved. Applicant ownership and active credential state were sufficient even though the caller's current occupancy was unit B. The route mutated the historical unit A credential and created its replacement workflow.

No product behavior was changed.

## Executable evidence

Test:

```text
artifacts/api-server/src/__tests__/stage4I3I4Guards.test.ts
runtime observation: a moved applicant can report an old-unit credential lost
```

Validation:

```text
Test Files  1 passed (1)
Tests       26 passed (26)
```
