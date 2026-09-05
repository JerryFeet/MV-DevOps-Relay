# Foundation Work — Implementation Plan

**Prepared:** 2026-09-05  
**Status:** Plan only — no implementation authorized  
**Inputs:** accepted current-behaviour report, Foundation Implementation Instruction, and confirmed decisions 149–152  
**Delivery boundary:** one coherent occupancy-and-lifecycle delivery, followed by unit integrity and lower-priority lifecycle work  

## 1. Plain assessment: reuse versus rebuild

This is **not a rebuild**.

Most of the difficult terminal infrastructure already exists in `releaseSubject`:

- serializable database transaction;
- unit advisory lock and row locking;
- retry handling for serialization/deadlock failures;
- deterministic dependency discovery;
- dry-run/execute parity;
- idempotent release-operation records;
- Waha credential and application revocation;
- future-booking cancellation;
- resident archival;
- historical booking and unit-attribution retention;
- PII unlinking/anonymisation;
- release audit and postcondition checks;
- notification outbox integration; and
- external-identity deletion jobs.

That machinery should be retained and extended.

What does **not** exist is the shared policy layer around it:

- one occupancy invariant called by every occupancy-affecting route;
- explicit primary-resident identity;
- a four-resident direct limit;
- fifth-and-subsequent resident requests with a mandatory reason and HOA decision;
- a non-terminal secondary-resident removal resolver;
- whole-household owner move-out;
- Riyadh end-of-day scheduling;
- canonical move-out identity by `unitId`; and
- consistent routing of portal/Waha/resident downgrade paths through a dependency resolver.

### Bottom line

The hardest transactional foundation is reusable. The project needs **targeted engine extensions plus new policy/orchestration**, not a second release system.

The terminal engine should not be copied. The non-terminal resolver should reuse its locking, dependency-query, audit, notification, and postcondition patterns while applying different business effects.

## 2. Confirmed product rules

The implementation will encode decisions 149–152 as follows.

### Decision 149 — occupancy is a unit invariant

- A unit has one occupying household: owner household or tenant household, never both.
- Property ownership is not occupancy.
- A verified owner may own a tenant-occupied or vacant unit without being an active resident.
- Tenant submission remains allowed while the owner household occupies the unit.
- Tenant approval is blocked until the owner household has moved out.
- Owner-resident activation is symmetrically blocked while a tenant household remains.
- Every occupancy-affecting path calls the shared invariant.

### Decision 150 — four residents total

- The primary occupant counts as resident one.
- The primary occupant may directly register up to three additional active residents.
- The fifth and every subsequent proposed resident becomes an HOA request.
- The primary occupant must provide mandatory free text explaining why the proposed resident lives in the unit.
- The request tells the primary occupant that the HOA may contact them for proof.
- The administrator may approve or refuse.
- Approval activates the proposed resident only after the invariant and count are rechecked under lock.

### Decision 151 — move-out is a household event

- Move-out is available only to the primary occupant.
- It ends every active resident record in that occupying household.
- It ends all household portal access.
- It revokes all household Waha credentials.
- It resolves household vehicles, future bookings, open permits/communications, invitations, guests, and future-valid passes under the accepted dependency rules.
- It sets occupancy to `vacant`.
- An owner's ownership claim is preserved; move-out is not ownership transfer.
- A tenant move-out ends the tenancy and releases the tenant slot while preserving the owner's ownership claim.

### Decision 152 — removing one resident is separate

- The primary occupant may remove any non-primary household resident.
- An administrator may perform the same operation with an audit reason.
- Removing a secondary resident does not change `occupantType`, `verifiedOwnerId`, or `verifiedTenantId`.
- The row is retained as history; it is not physically deleted.
- The removed person's dependencies are resolved atomically.
- A primary occupant cannot remove themselves through resident removal, portal downgrade, or account deletion.
- Any attempt to remove the primary occupant returns a clear “move-out required” result.

## 3. Delivery structure

Sections 3.1–3.5 form **one acceptance delivery**. They may be implemented as separate internal branches or review units, but must not be shipped as independent product states.

### 3.1 Shared occupancy and eligibility service — new

Create a transaction-bound domain service responsible for loading and validating one unit's complete occupancy state.

It will:

1. take `tx`, `unitId`, actor, intended transition, and subject;
2. acquire the same unit advisory lock used by release operations;
3. lock the unit, relevant verification, resident, invitation, and primary-resident rows;
4. derive:
   - legal owner;
   - approved tenant;
   - stored occupancy;
   - active owner household;
   - active tenant household;
   - primary occupant;
   - active resident count;
   - pending extra-resident requests;
   - conflicting or legacy state;
5. validate the requested transition;
6. return a structured result that states:
   - allowed/refused;
   - invariant violation;
   - next required action;
   - dependency preflight requirement; and
   - count/request outcome.

#### Required callers

The service must be called from:

- resident creation;
- owner self-registration;
- tenant self-registration;
- resident status changes;
- resident removal;
- portal-access grant;
- portal-access removal;
- invitation acceptance;
- owner verification approval;
- tenant verification approval;
- administrator handling of unlinked residents;
- Waha issue and post-issue eligibility changes;
- vehicle registration and reassignment;
- booking creation and resident-eligibility changes;
- owner move-out;
- tenant move-out;
- tenancy expiry/admin release;
- direct administrator unit occupancy edits; and
- fifth-resident approval.

No route may reproduce a local version of T12 after this service exists.

#### Symmetric approval gate

- Tenant approval continues to block while any active owner-household resident exists.
- Owner-resident activation/owner-occupancy approval blocks while an active tenant household exists.
- Tenant submission remains allowed.
- Owner rejection remains allowed while approval is blocked.
- Checks run in the same transaction as the approval update.

#### Database enforcement

Add database protections for rules that can be represented safely:

- at most one active primary resident per unit;
- primary resident must belong to the same unit;
- primary resident must be active;
- resident-request decision/status consistency;
- mandatory reason for submitted fifth-or-later requests;
- immutable decision/audit fields after final status;
- no duplicate active/pending request for the same proposed person and unit.

Cross-table owner/tenant household exclusivity cannot be expressed as a simple `CHECK`. Use a database trigger/constraint trigger only if it can acquire the same unit lock and share the service's definitions without producing a second contradictory rule. Otherwise, enforce through the mandatory transaction service and a schema integrity verifier.

## 4. Primary resident and resident-count model — new

### 4.1 Explicit primary designation

Add explicit primary-resident state rather than inferring it forever from `type`.

Recommended model:

- `residents.is_primary boolean not null default false`;
- a partial unique index allowing one active primary resident per unit;
- the primary row must be linked to the verified owner or verified tenant who occupies the unit;
- owner property records remain independent of owner resident records.

Why this is necessary:

- an owner may own but not occupy;
- `type = owner` does not alone prove current primary occupancy;
- removal authorization must identify the protected primary unambiguously;
- the four-person count must include one defined primary;
- W14 demonstrates that verification, resident status, and occupancy can diverge.

### 4.2 Backfill

Before enforcing the new constraint:

1. derive candidate primaries from `unit.occupantType`, verified owner/tenant, active linked resident, and resident type;
2. classify every unit as:
   - unambiguous;
   - no primary;
   - multiple candidate primaries;
   - opposing households;
3. backfill only unambiguous units;
4. produce a review list for all ambiguous units;
5. apply no silent choice to conflicting units;
6. correct W14 only in the controlled remediation phase.

### 4.3 Counting

The count is the number of active resident rows on the unit, including the primary.

- Counts 1–4: the primary occupant may add directly.
- Count 4 and another person is proposed: create an HOA request, not an active resident.
- Count above 4 after approvals: each subsequent person also requires a request and separate decision.
- Concurrent fourth/fifth additions are serialized by the unit lock; one may become direct while the other becomes a request.
- Removing a secondary resident immediately frees a direct-registration slot.

## 5. Fifth-and-subsequent resident request — new

### 5.1 Data

Create a durable request entity containing:

- unit;
- proposed resident identity fields needed for review;
- requester/primary resident;
- mandatory reason;
- acknowledgement that HOA may request proof;
- status: `pending`, `approved`, `refused`, `cancelled`;
- reviewer;
- decision reason;
- submitted, decided, and cancelled timestamps;
- resulting resident ID after approval;
- append-only lifecycle/audit events.

Do not create an active resident before approval.

### 5.2 Submission

The household UI first asks the occupancy service for the current count.

- Below four active residents: use direct registration.
- At four or more: show the request flow.
- Reason is mandatory and validated server-side.
- The confirmation states that the HOA may contact the requester for proof.
- Submission creates an administrator-attention item and notification.

### 5.3 Administrator decision

The administrator sees:

- canonical unit reference;
- primary occupant;
- current resident count and household list;
- proposed resident;
- mandatory reason;
- prior requests for that unit/person;
- relevant occupancy conflicts.

Approval:

1. locks the unit and request;
2. re-runs the invariant and current count;
3. creates the resident as non-primary;
4. optionally starts the existing portal invitation flow if requested and eligible;
5. records the decision and resulting resident;
6. notifies the primary occupant.

Refusal:

- requires a recorded decision reason;
- activates no resident;
- preserves the request permanently;
- notifies the primary occupant.

## 6. Non-terminal resident-removal resolver — new, using existing patterns

Do **not** overload `releaseSubject` to remove one secondary resident. Its contract is terminal and includes unit/tenancy/account effects that must not occur for a family member leaving.

Create a separate resident-removal operation that reuses the release engine's implementation patterns and shared primitives.

### 6.1 Reused from the release engine

- serializable transaction wrapper;
- unit advisory lock;
- deterministic dependency preflight;
- row-lock order;
- idempotency-key pattern;
- append-only operation record;
- Waha revocation/event helpers;
- booking cancellation helper;
- notification outbox;
- PII retention/anonymisation conventions;
- postcondition verification;
- dry-run/result shape.

### 6.2 New non-terminal semantics

For the selected non-primary resident:

- retain the resident row and set it inactive;
- append a resident lifecycle event with actor, reason, and previous state;
- revoke portal invitation and accepted portal linkage;
- revoke active Waha application/credential and append existing Waha events;
- cancel the resident's future bookings and preserve past bookings;
- deactivate the resident's vehicles and release parking slots while preserving history;
- revoke future-valid guest/day passes attributable to that person where applicable;
- close or reassign open person-specific objects according to existing domain rules;
- remove push tokens/preferences for a deleted portal identity;
- anonymise the removed portal account only when no other valid application relationship requires it;
- leave unit occupancy and verified owner/tenant links unchanged.

### 6.3 Authorization

- Primary occupant: may remove a non-primary resident from their own unit.
- Administrator: may remove a non-primary resident with a mandatory audit reason.
- Other household resident: cannot remove anyone.
- Subject equals primary resident: refuse with `MOVE_OUT_REQUIRED`.
- Subject tries to remove themselves and is primary: refuse with `MOVE_OUT_REQUIRED`.
- Portal-access downgrade that would effectively remove/downgrade a primary: refuse and direct to move-out.

### 6.4 Existing paths to replace

- Administrator hard delete of an unlinked resident becomes historical removal.
- Portal-access disable runs dependency preflight and resolution instead of unlinking only the invitation/account.
- Accepted-invitation revocation runs inside the same resolver transaction.
- Direct Waha revocation remains available as a pass-only action, but losing resident/portal eligibility routes through the resolver.
- Resident status changes cannot directly set a primary inactive.

## 7. Whole-household move-out — extend, do not rebuild

### 7.1 Reuse unchanged

Keep the current release engine's:

- serializable transaction and retry boundary;
- unit and trigger locking;
- dependency-query structure;
- dry-run;
- idempotent release operation;
- Waha revocation and event history;
- future-booking cancellation;
- resident archival mechanism;
- historical booking/permit/unit attribution;
- audit/postcondition framework;
- notification enqueueing; and
- external-identity deletion queue.

### 7.2 Required release-engine extensions

#### Select the entire household for both owner and tenant move-out

Current tenant release already selects all active residents on the unit. Current owner release is narrower and can leave household members behind.

For a primary move-out:

- select every active resident on that unit;
- archive every resident as `moved_out`;
- resolve dependencies for every household member;
- revoke every household portal identity/invitation;
- queue identity cleanup for every household portal account that no longer has another valid relationship;
- assert zero active residents after completion.

#### Separate occupancy release from ownership transfer

Owner move-out must:

- set `occupantType = vacant`;
- archive the owner household residents;
- preserve the owner's verified property-ownership claim;
- preserve ownership parking entitlement where T13 requires it;
- release only resident/occupancy entitlements.

Do not use a terminal mode that clears `verifiedOwnerId`. Ownership change remains a separate lifecycle.

Tenant move-out must:

- set `occupantType = vacant`;
- clear/revoke the verified tenancy and release the tenant slot;
- preserve `verifiedOwnerId`;
- preserve owner parking entitlements;
- leave any pending next-tenant request intact so owner approval becomes available after move-out.

#### Align vehicle and open-object effects

The current engine retains/unlinks/anonymises vehicles. T13 requires tenant vehicles to be deactivated and parking slots released. Whole-household move-out must apply that accepted rule consistently.

Open permits and communications associated with the departing household must be closed with a lifecycle reason where required by T13, while preserving records.

#### Multiple account subjects

The current engine's primary deletion subject is one user. Whole-household move-out may include a second portal-access resident. Extend the identity-cleanup plan to a deterministic set of household users and retain an audit result for each.

### 7.3 Move-out trigger and scheduler corrections

#### Asia/Riyadh end-of-day

- Store/interpret the stated move-out date in `Asia/Riyadh`.
- The due instant is the start of the following Riyadh day.
- Centralize the conversion in the existing Riyadh date/time utility pattern.
- Do not compare UTC calendar dates.
- Include tests around 21:00 UTC / 00:00 Riyadh and month/year boundaries.

#### Owner and tenant support

- Resolve the current primary resident and occupancy track from the unit.
- Support owner-household and tenant-household move-out.
- Reject no-primary/conflicting states for administrator review rather than guessing.

#### Resolve by `unitId`

- Add `unitId` to move-out forms/permits if not already canonical.
- Backfill only records with an unambiguous building-and-unit match.
- Report ambiguous historical forms.
- Group scheduler work by `unitId`.
- Pass `unitId` through trigger validation and release.
- Never select a unit using apartment number alone.

#### One completion path

Manual status completion must not create a second release path.

Preferred plan:

- the canonical move-out service owns business completion;
- scheduler and authorised manual/admin actions call that service;
- the service checks the effective Riyadh due time and the permitted override policy;
- direct generic status mutation cannot mark a move-out completed without a successful household release;
- duplicate/manual/scheduled attempts return the existing idempotent completed result.

### 7.4 `users.unitNumber` retirement

`users.unitNumber` cannot be removed in this foundation migration.

Most authorization is already `unitId`-based. Remaining uses fall into two groups:

1. **Unsafe authoritative use to remove now**
   - move-out scheduler grouping and unit lookup.

2. **Compatibility/display snapshots to migrate gradually**
   - resident invitation/create payloads;
   - permit, Waha, guest pass, verification, payment, booking projections;
   - notifications;
   - portal display.

Foundation scope:

- eliminate bare-number authority from move-out and occupancy;
- use canonical `unitId` for all new APIs and records;
- retain `users.unitNumber` as read-only compatibility/display data;
- stop adding new authoritative dependencies on it.

Later retirement requires:

- all users backfilled with `unitId`;
- all move-out forms migrated;
- remaining clients migrated to canonical unit identity;
- notifications/display switched to a canonical unit-label join or deliberate snapshot;
- a final usage audit before dropping the field.

## 8. W14 controlled remediation — after rules exist

The current Development review found W14 to be the only unit with an opposing/incomplete household state.

### 8.1 Intended corrected state

The broken UAT action was the primary tenant removing themselves. Therefore the correction plan is:

- preserve the verified owner's property-ownership claim;
- preserve the approved tenant link;
- restore the verified tenant's resident row as the active primary resident;
- set occupancy to `tenant_occupied`;
- archive the active owner resident and owner-family resident rows from the occupying household;
- resolve the archived owner household's resident dependencies;
- restore tenant portal eligibility only through the new invariant;
- do not resurrect a revoked Waha credential—reissue/revalidate through the normal eligible flow;
- retain every prior row and append correction audit evidence.

### 8.2 Execution safeguards

Before mutation:

1. run the new occupancy audit in dry-run mode;
2. list every resident, portal identity, Waha credential, vehicle, future booking, permit, invitation, and pass that would change;
3. verify W14 is still the only conflicting unit;
4. publish the exact before/after correction manifest;
5. obtain product-owner approval for that manifest;
6. execute in one locked transaction;
7. verify all postconditions and exact row effects.

No W14 correction belongs in the schema migration itself.

## 9. Unit integrity — next delivery after occupancy foundation

This work uses the same shared invariant where relevant but should not delay the occupancy acceptance delivery.

### 9.1 Phantom-unit removal

Add administrator removal only when the unit has:

- no active or historical residents;
- no verification records;
- no bookings;
- no permits;
- no vehicles;
- no payments;
- no invitations;
- no audit/history dependencies.

If any history exists, refuse deletion and direct the administrator to correction/deactivation. Physical removal must itself be audited.

The larger 452-unit master/Mullak seeding decision remains a separate product-data exercise.

### 9.2 Permit current validity

- Preserve approval as historical decision.
- Derive `current`, `not_yet_current`, and `expired` from the Riyadh date range.
- Use the derived value in every reader and authorization decision.
- Approved-but-expired is never treated as current.
- Do not add a second mutable status merely to mirror the clock unless reporting requires it.
- Guard-facing behavior is explicitly outside this delivery, but the shared API read model must become correct for later consumers.

### 9.3 Stale verification claims

- Add an expiry transition for pending claims using existing `expiresAt`.
- Transition under unit lock.
- Release the pending claim slot.
- Preserve the record and add an expiry event.
- Surface expired claims to administrator attention.
- Preserve T10: administrators do not approve/reject tenant requests.
- For a stale tenant request, administrator action is cancellation with mandatory reason where T11 applies; automatic expiry remains distinct from rejection.
- Notify the applicant and relevant owner.

## 10. Lifecycle items 7–10 — lower priority

These follow unit integrity and must not delay the foundation.

### 10.1 User status

Choose and implement one explicit contract:

- `pending` is a real restricted provisioning state; or
- remove/document it as vestigial.

Do not retain a state that appears restrictive while general authorization treats it as active.

### 10.2 Announcement archival

- apply expiry consistently to list and detail readers;
- retain historical/admin visibility;
- add explicit archive behavior only if needed for operations;
- avoid physical deletion.

### 10.3 Facility deactivation

Add impact review before deactivation:

- paid future bookings;
- unpaid holds;
- confirmed/not-required bookings;
- notification recipients.

Define and execute the accepted cancellation/refund/hold-release policy atomically with deactivation, or refuse deactivation until consequences are resolved.

### 10.4 Retention

- add scheduled retention for terminal `notification_events`;
- add age-based purge for stale `api_rate_limit_counters`;
- preserve active/retrying operational rows;
- record exact purge counts and failures;
- use existing scheduler/retention patterns rather than ad-hoc deletes.

## 11. Schema and migration plan

No schema change will be applied until this plan is approved.

Expected forward migration:

1. add explicit primary-resident state and indexes;
2. create extra-resident request and request-event/audit tables;
3. create resident lifecycle/removal-operation audit as needed;
4. add canonical `unitId` to move-out forms/permits where missing;
5. add idempotency/operation support for non-terminal resident removal;
6. add indexes needed for active household, pending request, expiry, and scheduler queries;
7. add safe database constraints/triggers approved in section 3.1;
8. backfill unambiguous primary residents and move-out unit IDs;
9. emit conflict reports rather than silently correcting ambiguous rows;
10. run the existing relay schema-promotion gate and schema integrity checks.

Migration continuity rules:

- forward-only migration;
- preserve applied migration history;
- no Drizzle baseline replacement;
- no Development schema mutation until the implementation and migration are reviewed;
- no W14 data correction inside schema migration;
- no Production access or deployment without separate authorization.

## 12. API and portal plan

### API

Add or refactor:

- occupancy-state/preflight service methods;
- fifth-resident request submit/list/detail/cancel;
- administrator approve/refuse;
- secondary resident removal preflight/execute;
- canonical household move-out preflight/execute;
- canonical move-out scheduler by unit ID;
- structured errors:
  - `OCCUPANCY_CONFLICT`;
  - `MOVE_OUT_REQUIRED`;
  - `RESIDENT_LIMIT_REVIEW_REQUIRED`;
  - `PRIMARY_RESIDENT_MISSING`;
  - `DEPENDENCY_RESOLUTION_REQUIRED`;
  - `AMBIGUOUS_UNIT_REFERENCE`.

All authorization remains server-side.

### Portal

Update the existing resident and administrator surfaces:

- primary badge;
- “4 residents including primary” count;
- direct-add versus HOA-request branching;
- mandatory reason field and proof warning;
- request status and decision reason;
- non-primary remove action with dependency summary;
- no remove action for the primary;
- move-out-only guidance for the primary;
- administrator attention panel for fifth-resident requests;
- impact review before administrator removal;
- bilingual English/Arabic strings and RTL-safe layouts.

No mobile implementation is included.

## 13. Verification plan

### 13.1 Occupancy invariant

- owner household and tenant household cannot be active together;
- symmetric owner approval gate;
- tenant submission remains allowed while owner occupied;
- rejection remains allowed;
- approval becomes available after move-out without resubmission;
- every listed route calls the shared service;
- direct database/app bypass attempts fail or are detected by schema integrity checks;
- concurrent owner/tenant activation produces one valid result and one clean refusal.

### 13.2 Four-resident limit

- primary plus three can be registered directly;
- fifth creates a pending HOA request;
- missing/blank reason is rejected;
- proof-warning acknowledgement is recorded;
- approval creates exactly one non-primary resident;
- refusal creates none;
- concurrent additions cannot exceed the direct limit;
- removal frees a direct slot;
- sixth and later also require review.

### 13.3 Secondary resident removal

- primary can remove a non-primary resident;
- administrator can remove with reason;
- non-primary cannot remove another resident;
- primary cannot remove themselves;
- occupancy and verified links remain unchanged;
- resident history remains;
- portal/Waha/vehicle/future-booking effects are atomic;
- failure rolls back all effects;
- repeated execution is idempotent.

### 13.4 Household move-out

- owner and tenant primary can move out;
- all household residents become `moved_out`;
- all household portal access ends;
- all Waha credentials fail immediately;
- vehicles deactivate and parking slots release;
- future bookings cancel; past history remains;
- open objects close according to T13;
- unit becomes vacant;
- owner property claim remains;
- tenant slot releases;
- pending next-tenant request survives and becomes approvable;
- scheduler fires at Riyadh end-of-day;
- apartment-number collisions cannot select another building;
- manual and scheduled attempts produce one completion;
- second attempt exits cleanly.

### 13.5 W14

- dry-run manifest approved before mutation;
- only intended rows change;
- owner ownership remains;
- tenant becomes active primary;
- owner household resident rows archive;
- occupancy becomes tenant occupied;
- no revoked credential is silently resurrected;
- exact before/after evidence is published.

### 13.6 Whole-delivery validation

After implementation:

- focused API and database tests first;
- portal type check and translation guard;
- API and portal suites;
- schema integrity and relay promotion gate;
- one critical end-to-end pass covering direct resident add, fifth request, secondary removal, tenant approval gate, owner move-out, tenant approval, tenant move-out, and W14;
- exact Development cleanup and fresh-clone evidence verification.

No test or E2E run is part of this planning step.

## 14. Implementation order

1. Freeze and inventory current occupancy conflicts.
2. Add schema primitives and forward migration.
3. Build shared occupancy/eligibility service.
4. Route owner/tenant approvals, resident creation/self-registration, and direct edits through it.
5. Build primary-resident/count behavior and fifth-resident request flow.
6. Build non-terminal resident-removal resolver.
7. Extend household release semantics without replacing its transaction core.
8. Correct Riyadh scheduling, owner support, unit-ID identity, and manual completion.
9. Route portal/Waha/status downgrade paths through the appropriate resolver.
10. Complete portal/admin surfaces and translations.
11. Verify the complete foundation as one acceptance unit.
12. Publish W14 dry-run correction manifest.
13. After explicit approval, execute and verify W14 correction.
14. Proceed to unit integrity.
15. Proceed to lifecycle items 7–10.

## 15. Scope and size statement

The accepted report was right that most hard work exists but is not called from enough places.

### Reused substantially

- transaction/retry boundary;
- lock strategy;
- terminal dependency graph;
- idempotency and durable audit;
- Waha event model;
- booking cancellation;
- historical retention/anonymisation patterns;
- notification outbox;
- tenancy expiry/admin-release adapters;
- portal invitation locking;
- unit correction audit;
- admin attention and bilingual UI patterns.

### Extended

- terminal graph from one subject to the entire household;
- owner move-out while preserving property ownership;
- tenant move-out always producing vacant occupancy;
- multi-account cleanup;
- vehicle deactivation and open-object closure;
- canonical trigger identity;
- Riyadh scheduling.

### Genuinely new

- shared occupancy/eligibility service;
- explicit primary resident;
- four-person count policy;
- fifth-and-later resident request;
- non-terminal secondary-resident resolver;
- resident-removal audit;
- fifth-request portal/admin UI;
- move-out form `unitId` migration/backfill.

Therefore this is **smaller and safer than a rebuild**, but it is not only route rewiring. The existing engine covers the risky terminal transaction. The new code establishes the policy boundary that prevents routes from drifting apart again.

## 16. Stop point

This document is the requested implementation plan.

No code, schema, data, W14 correction, workflow, E2E, deployment, task, guard, mobile, or Part 7 work is authorised or performed at this stage.