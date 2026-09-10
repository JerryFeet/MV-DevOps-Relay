# Round 4 — B4 Waha Enumeration

**Evidence date:** 2026-09-10  
**Scope:** Waha duplicate-operation and second-path enumeration completed before D-17–D-22  
**Schema operations:** none

## Findings and classifications

| Finding | Classification | Deterministic result | Corrected boundary |
|---|---|---|---|
| Concurrent replacement-payment initiation | **Family A** | Both HTTP requests passed route admission before release; only one provider charge/payment attempt may win. | Per-credential serialized admission; the loser receives the winner’s charge/payment details. |
| Direct HTTP revocation versus lifecycle release | **Family B** | Two paths reached the same authoritative revocation outcome with previously divergent effects. | Direct revocation now performs credential/application state, audit, booking cancellation, and mandatory notification work atomically; lifecycle release emits both required event families. |
| Concurrent initial application | **Not Family A** | Canonical unit locking serializes admission and the live partial unique index is the database backstop; the loser receives 409 and no second application/event/alert is produced. | No race correction required. The permanent mock regression does not itself query the PostgreSQL catalog or execute two real database sessions; those are separate structural/runtime evidence. |
| Concurrent direct revocation | **Family A** | Both requests deterministically pass the outer status check. The application-row lock and in-transaction status re-check permit one 200 and one 409. | Exactly one authoritative revocation audit event is written; notification uniqueness leaves one event-5 email and one event-5 push row. |

## Permanent regressions

### Replacement-payment Family A

- **Journey:** two authenticated replacement-payment POST requests are started and held until both pass route admission.
- **Final assertion:** one provider initiation wins; both responses refer to the same durable charge/payment attempt.
- **Does not cover:** real provider delivery timing, refund processing, or a later replacement revocation.

### Direct-revocation Family B

- **Journey:** direct admin revocation and terminal lifecycle release are run through their respective real service boundaries.
- **Final assertion:** both paths produce the required revoked state, booking cancellation, audit, and mandatory notification semantics; induced failure rolls direct revocation back.
- **Does not cover:** notification provider delivery or end-user device receipt.

### Initial-application disproof

- **Journey:** two application requests contend at the canonical admission boundary.
- **Final assertion:** one succeeds, one receives 409, and exactly one application, applied event, and approval alert remain.
- **Does not cover:** a two-session PostgreSQL runtime test inside this mock file or later application approval/rejection.

### Direct-revocation Family A

- **Journey:** two real HTTP requests are held until both pass the pre-transaction active-application check.
- **Final assertion:** application-row serialization yields one 200, one 409, one revocation audit, one email row, and one push row.
- **Does not cover:** external email/push delivery, credential scanning after revocation, or revocation reversal.

## Release decision

B4 enumeration is complete for the investigated Waha candidates. No schema migration, schema push, forced operation, or immutable-protection bypass was used.