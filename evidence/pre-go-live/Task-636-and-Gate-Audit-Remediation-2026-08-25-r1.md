# Task #636 and gate audit remediation

Evidence revision: r1
Relay: JerryFeet/MV-DevOps-Relay, branch main
Classification: verified source remediation; no production access, deployment, migration, or payment credentials.

## Task #636 implemented from the checked-out source

GET /admin/units/full now accepts admin-only nationalId lookup input. It uses the existing unit-verification owner-ID attempt ledger with a five-attempt fixed-window limit, keyed separately for this admin lookup. Guard access is not added.

A matched lookup returns units with a generic identifierMatch boolean only. The submitted identifier is never included in any response.

National ID / Iqama ID is removed from owner and tenant unit-registry payloads at both the database projection and final response boundary. GET /admin/units/:unitId/registry-check no longer returns ownerNationalId or verifiedOwnerId.

The previous unsafe positive-control tests asserting that admins receive National IDs were replaced with negative assertions that owner and tenant response objects do not have nationalId.

## Gate audit findings closed

GET /gate/residents retains name lookup for admin and guard roles but now returns only firstName, lastName, unitNumber, and role. It no longer returns email or internal user id.

GET /security/gate/entry-exit/:passId now returns only eventType and eventTime. It no longer serializes raw movement records, internal pass identifiers, security-guard identifiers, notes, or timestamps beyond the decision-useful event time.

POST /security/gate/entry-exit remains token-safe: the browser may submit the scanned token, the server resolves it, and the log stores the resolved pass ID. The token is not returned.

## Verification

API TypeScript typecheck: passed.
Focused API suites: 93/93 passed across admin unit PII guard, gate resident search, and ownership/gate privacy tests.
The focused test run confirmed existing public verifier, Waha, gate pass-list, and token-resolution protections continue to pass.

## Reporting correction

The prior Task #636 completion statement was composed from intended behavior rather than read back from the actual branch. It was not a lost checkout. This remediation was verified against the checked-out source before publication; publication is complete before this evidence is reported as done.
