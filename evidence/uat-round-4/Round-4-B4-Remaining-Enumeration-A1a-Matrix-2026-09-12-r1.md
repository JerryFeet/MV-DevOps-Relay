# Round 4 B4 remaining enumeration and A1a matrix

Date: 2026-09-12  
Canonical gate: `pnpm run round3:regression:e2e`  
Result: PASS

## Investigation rule

Every Family A candidate was checked first for:

1. transaction/advisory or row locks;
2. conditional updates;
3. live or source-declared unique indexes.

`Promise.all` alone was not accepted as concurrency proof. Race regressions use
an explicit admission/write barrier. Mock evidence is limited to the semantics
the mock actually executes.

## Confirmed and corrected findings

| Domain | Finding | Classification | Deterministic pre-fix result | Corrected final assertion |
|---|---|---|---|---|
| Vehicles | Two same-user first-vehicle requests could both classify themselves from the stale pre-transaction active-vehicle read. | Family A | Both requests crossed the preflight boundary and produced the wrong first/additional classification. | Per-user database advisory admission serializes classification; one active and one pending-approval vehicle remain. |
| Portal access | A stale `hasPortalAccess=true` PATCH could restore access after invitation revocation. | Family A | Revoke committed, then stale PATCH restored the flag without a valid invitation. | Locked revalidation rejects stale state; revoked access remains terminal. |
| Permits | Identical permit submissions could pass duplicate checks and both insert. | Family A | Two synchronized requests both returned success and inserted duplicate submitted permits. | Database advisory admission plus in-transaction recheck elects one 201 winner and one 409 loser. |
| Guest passes | Concurrent approval could issue two ordinary passes for one guest. | Family A | Both requests observed no pass and inserted. | Shared guest admission serializes/rechecks; one pass is issued. |
| Guest passes | Concurrent revoke calls could both report an authoritative success. | Family A | Both synchronized callers returned 200. | Conditional authority elects one 200 winner and one 409 loser. |
| Gate use | Guest denial and gate entry could both commit after stale admission. | Family A | The pass ended revoked while an entry log still committed. | Shared transaction/guest lock makes revocation win and rejects stale gate use. |
| Gate use | Guest deletion and gate entry could both commit after stale admission. | Family A | The guest was deleted while an entry log still committed. | Shared transaction/guest lock makes deletion win and rejects stale gate use. |
| Waha day passes | Identical purchaser/unit/date purchases could create two pending payment records. | Family A | Two synchronized requests created two pending records/charge attempts. | Purchaser-unit-date advisory admission and recheck elect one pending purchase and one 409 loser. |
| Bookings | Cancellation and confirmation could both act on stale status. | Family A concurrency defect; POST/PATCH cancellation duplication is Family B | Confirmation could commit and then be overwritten by cancellation, with both callers reporting success. | All booking status writers use the booking settlement lock, re-read, and conditional transition. One legal transition wins. |
| Bookings | POST/PATCH cancellation could overwrite a committed paid callback. | Family B | Payment attempt became confirmed while cancellation overwrote booking payment state. | Shared cancellation authority uses the settlement lock; committed paid settlement wins and cancellation returns conflict. |
| Bookings | PATCH could confirm a booking after its end time. | Neither family | A single expired confirmation returned 200. | Both confirmation paths reject expired bookings. |
| Portal Help | Reply remained a second mutation path after terminal closure. | Family B | Closed-state exclusion was not enforced by the reply update predicate. | Reply excludes closed rows and returns 409; history remains Closed. |
| Waha revocation | Secondary-resident removal revoked credentials without holder notifications. | Family B | Lifecycle revocation wrote credential/audit state but no durable email/push intents. | Every actually revoked credential enqueues one email and one push intent in the same transaction. |

## B7-protected or disproved candidates

| Domain | Candidate | Existing protection | Outcome |
|---|---|---|---|
| Waha applications | Duplicate live application per unit | Unit transaction locking plus partial live-application unique index | Protected; earlier flattened-mock Family A claim remains retracted. |
| Waha decisions | Approve/revoke overlap | Application row `FOR UPDATE` plus in-transaction status recheck | Protected. |
| Waha replacement payment | Duplicate replacement charge | Credential/advisory serialization and winner detail reuse | Protected. |
| Booking admission | Same/buffered facility slot | Facility and unit advisory locks plus overlap recheck and DB constraints | Protected. |
| Monthly allowance | Duplicate same-unit/month claim | Atomic conflict handling, unique unit-period index, immutable claim protection | Protected. |
| Parking identity | Duplicate normalized unit/building/lot identity | Unit advisory lock plus composite unique index | Protected. |
| Household invitations | Consume versus revoke | Unit/invitation locking, conditional pending transition, token and pending-slot indexes | Protected in both arrival orders. |
| First sign-in | Concurrent provisioning of one Clerk identity | Atomic upsert plus unique Clerk identity | Protected in a 50-caller real PostgreSQL integration regression. |
| Users/access | Consume versus removal | Canonical unit/invitation locks and shared unlink/suspension lifecycle | Protected after stale PATCH correction. |

## Explicit retraction

The initial parking mock attempted to prove advisory-lock and unique-index
behavior. That evidence was invalid because the in-memory database does not
execute PostgreSQL advisory locks or catalog constraints. Those assertions were
removed. Parking protection is retained only as a structural source/schema
boundary here; no mock concurrency claim is made.

The earlier duplicate Waha application claim also remains retracted: stronger
construction and index evidence disproved the proposed production race.

## Permanent regressions

The sole canonical gate now includes:

- booking/allowance synchronized A1a regressions;
- vehicle and parking-boundary regressions;
- permit, guest, guest-pass, gate-use, and Waha day-pass synchronized regressions;
- invitation consume/revoke and stale portal-access regressions;
- C-4 terminal Portal Help API contracts;
- C-5 two-holder Waha notification regressions;
- portal and mobile C-item contracts.

Each regression documents its exact journey, final assertion, and exclusions.

## Canonical result

- API: 305/305
- Portal contracts: 22/22
- Mobile contracts: 4/4
- Browser: 39/39
- Total: 370/370

No separate gate database was introduced. No schema operation or immutable
protection bypass was used.