# Round 2 Foundation and Lifecycle — Current-Behaviour Report

**Prepared:** 2026-09-05  
**Environment inspected:** Development, read-only  
**Authority:** `UAT-Round-2-Findings` and `System-Lifecycle-Review` supplied by the product owner  
**Purpose:** establish what the system does now before deciding or implementing fixes  

## 1. Executive conclusion

The product owner's instinct is correct: **OC1, resident lifecycle, and resident dependencies should be delivered as one coherent foundation change.**

They are one business transaction:

1. determine which occupancy track may exist on a unit;
2. control who may add, remove, or leave that occupancy;
3. end occupancy only through an accepted terminal event;
4. resolve every dependent credential, booking, vehicle, portal link, and historical record;
5. commit the unit's new occupancy state only after those effects succeed.

Splitting the work into separate releases would create exactly the two unsafe intermediate states identified by the product owner:

- occupancy could be blocked correctly while ad-hoc removal still leaves orphaned credentials and records; or
- dependency cleanup could improve while owner and tenant households can still coexist.

This should be **one acceptance delivery with several internal implementation workstreams**, not several independently shipped fixes. The shared release engine already provides much of the atomic terminal machinery. The missing foundation is a shared occupancy invariant and consistent routing of every resident/occupancy mutation through that invariant and the terminal lifecycle.

No fixes were made while producing this report.

## 2. Scope and exclusions

### Included

- OC1 occupancy and resident lifecycle.
- Move-out completion timing and terminal effects.
- Resident dependency handling: Waha, vehicles, bookings, portal access, and history.
- Lifecycle review items 1–10.
- A read-only Development snapshot of current unit, resident, claim, permit, announcement, facility, and retention state.
- Identification of rules enforced in one place but not generalized.
- Identification of behavior already implemented.

### Excluded by instruction

- Security-guard UI and workflows.
- Mobile.
- Part 7.
- Smaller Round 2 defects beyond recording their requested later sequence.
- Any fix, migration, schema push, data repair, task proposal, or E2E run.

## 3. Current Development snapshot

This snapshot is evidence of current data, not a proposed repair.

### 3.1 Units

There are **three non-system units**:

| Unit | Stored occupancy | Verified owner | Verified tenant | Active resident rows | Provenance visible in current records |
|---|---|---:|---:|---|---|
| CE34 | vacant | none | none | none | No linked verification record; the system does not record a definitive unit-creation source |
| G3 | owner occupied | present | none | none | Approved owner-manual verification created at the same timestamp as the unit |
| W14 | tenant occupied | present | present | 1 owner, 2 family; tenant row is inactive | Approved owner-manual and approved tenant-request records |

### 3.2 W14 is currently inconsistent

W14 has:

- `occupant_type = tenant_occupied`;
- both `verified_owner_id` and `verified_tenant_id`;
- an active owner resident;
- two active family residents registered by the owner;
- an inactive tenant resident linked to the verified tenant.

This is the exact partial-removal failure described in UAT. The tenant's authoritative unit linkage remains, but the tenant resident record is inactive. The unit simultaneously retains the owner's active household. It is therefore inconsistent in both directions:

- the authoritative unit state says tenant occupied; and
- the active resident set represents an owner household.

No data was corrected.

### 3.3 Current instances of the other lifecycle risks

- Pending unit-verification claims: **0**.
- Approved/in-progress permits whose end date is already past: **0**.
- Published announcements: **0**.
- Inactive facilities: **0**.
- Future non-cancelled bookings: **1**, against an active facility.
- `notification_events`: **46** rows.
- `api_rate_limit_counters`: **16** rows.
- User status counts: **8 active**, **3 pending**, **0 suspended**.

The absence of a current expired permit or stale pending claim does not close the code-level lifecycle gap. It only means Development does not contain a live example at the time of this report.

## 4. The recurring failure pattern

T12 is the clearest example of a broader pattern: **a rule is checked at creation or one transition, then not enforced by later transitions or readers.**

### 4.1 T12

Tenant approval checks for:

- another active verified tenant; and
- remaining active members of the owner's household.

It returns the specified T12 message when that household remains. This is implemented directly inside the tenant-approval route (`artifacts/api-server/src/routes/units.ts:1049-1084`).

There is no shared occupancy-invariant service called by:

- resident creation;
- owner or tenant self-registration;
- resident status changes;
- portal-access grant or removal;
- owner verification approval;
- administrator deletion of an unlinked resident;
- Waha eligibility after issue;
- vehicle registration or reassignment;
- booking eligibility after the resident changes;
- owner move-out; or
- direct unit occupancy edits.

That is why T12 works at tenant approval but did not prevent W14's later broken state. It was implemented as a route-local precondition, not as a unit invariant.

### 4.2 Other examples of the same pattern

| Rule | Where it is enforced | Where it runs out |
|---|---|---|
| Waha holder is adult and has portal access | Credential eligibility/issue | Existing credential is not rechecked when portal access or resident eligibility changes |
| Verification claim has an expiry | Timestamp assigned at submission | No general process transitions an expired pending claim |
| Permit has a date range | Submission validation and storage | Status remains approved; readers do not consistently derive current validity |
| Facility must be active | New booking creation and normal list | Existing bookings and direct detail/availability readers are not transitioned |
| Announcement expires | Resident collection list | Direct detail remains retrievable; no archive transition |
| New user starts pending | Profile provisioning | General API authorization blocks suspended users but permits pending users |

## 5. OC1 — occupancy and resident lifecycle

### 5.1 What is already implemented

- Units store `occupantType`, `verifiedOwnerId`, and `verifiedTenantId`.
- Owner approval sets `owner_occupied`.
- Tenant approval sets `tenant_occupied`.
- Tenant approval applies the T12 owner-household gate.
- Tenant approval refuses a different active verified tenant.
- The terminal release engine can calculate the unit's post-release state.
- Tenant terminal release can leave a unit vacant or owner occupied, depending on retained ownership.
- Owner terminal release can leave a unit vacant or tenant occupied, depending on retained tenancy.
- Linked resident records cannot be physically deleted through the administrator resident-delete endpoint; the API requires a terminal release instead.
- A resident has no public self-delete endpoint.

Primary source:

- `artifacts/api-server/src/routes/units.ts:1006-1169`
- `artifacts/api-server/src/routes/residents.ts:678-779`
- `artifacts/api-server/src/lib/releaseSubject.ts:288-443`

### 5.2 What is partial or missing

#### No shared occupancy invariant

General resident creation accepts `owner`, `tenant`, or `family` and inserts the row after field/unit validation. It does not check the unit's occupancy track (`artifacts/api-server/src/routes/residents.ts:291-387`).

Owner/tenant self-registration checks verification, mobile number, and duplication for that same user/type. It does not check for the opposing occupancy track (`artifacts/api-server/src/routes/residents.ts:696-779`).

Owner verification approval sets `owner_occupied` without the symmetric check that would prevent an existing tenant household from remaining (`artifacts/api-server/src/routes/units.ts:1148-1169`).

#### Resident limits are not implemented

The API has no four-resident direct-registration limit and no fifth-resident HOA approval queue. The current general resident route inserts after validating identity, mobile, unit linkage, and optional portal access.

The open product question remains whether the limit is four total residents including the primary occupant. The supplied finding reads naturally that way, but implementation should not begin until the product owner confirms it.

#### Removal rules are not expressed consistently

- Linked residents are protected from administrator hard deletion.
- Unlinked residents can be hard-deleted immediately.
- There is no explicit domain rule distinguishing primary occupant, second portal-access resident, and ordinary household resident at removal time.
- Portal-access removal is treated as an invitation/account unlink, not as an occupancy or dependency event.
- Historical retention applies during terminal release, but not during ordinary unlinked-resident deletion.

### 5.3 Why resident management became unusable

The system treats these as separate facts:

- a verified user linked to a unit;
- a resident row;
- unit occupancy state;
- portal invitation/access;
- Waha application and credential.

The tenant's resident row could become inactive without ending the verified tenancy or occupancy. Self-registration then failed on the current mobile requirement, while Waha state continued to exist independently. There is no single lifecycle operation reconciling all five facts.

## 6. Move-out completion

### 6.1 What already exists

An automatic move-out scheduler exists and starts with the API. It:

- selects approved, unprocessed move-out forms due on or before the current date;
- selects a canonical form for the unit's active verified tenant;
- invokes the shared terminal release engine;
- marks duplicate sibling forms completed after the canonical release;
- relies on an idempotency marker so a completed form is not released twice.

Primary source: `artifacts/api-server/src/lib/moveOutScheduler.ts:12-143`.

The release engine:

- locks the unit, subject, and trigger;
- validates that the subject is the unit's current verified tenant or owner;
- computes one deterministic dependency graph;
- records an append-only release operation;
- marks the move-out form completed;
- queues external identity deletion after the database transaction.

Primary source: `artifacts/api-server/src/lib/releaseSubject.ts`.

### 6.2 What does not match the confirmed rule

#### Wrong timezone boundary

The scheduler runs at **UTC midnight** and compares UTC calendar dates. The confirmed rule is completion at end of day in **Asia/Riyadh**.

UTC midnight is 03:00 in Riyadh, so a scheduled move-out completes approximately three hours after the confirmed Riyadh end-of-day boundary.

Source: `artifacts/api-server/src/lib/moveOutScheduler.ts:7-10,114-143`.

#### Tenant-only scheduled subject

The scheduler requires `verifiedTenantId` and invokes `releaseSubject({ kind: "tenant" })`. It skips a unit without an active verified tenant. It therefore does not implement the confirmed owner-occupied move-out path.

Source: `artifacts/api-server/src/lib/moveOutScheduler.ts:45-81`.

#### Ambiguous unit lookup

The scheduler groups and looks up move-out forms using `unitNumber`, then queries `units.unitNumber` without the building component. This repeats the bare-unit-number ambiguity found elsewhere.

Source: `artifacts/api-server/src/lib/moveOutScheduler.ts:30-48`.

#### Manual completion remains another trigger

The permit status route invokes terminal release immediately if an administrator changes an approved move-out permit to `completed`. That means a manual status action can execute release independently of the scheduled date.

Source:

- `artifacts/api-server/src/routes/permits.ts:428-441`
- `artifacts/api-server/src/lib/tenancyLifecycle.ts:609-638`

#### Approved-final behavior is not encoded as a complete permit rule

The supplied requirement says an approved move-out cannot be cancelled. The generic permit transition map permits `approved -> in_progress` or `approved -> completed`; it has no cancellation transition, which is compatible with finality. However, the complete product rule—automatic completion at the Riyadh date boundary, no manual confirmation, and an irreversible warning—is not represented as one coherent move-out lifecycle.

## 7. Resident dependency handling — lifecycle items 4 and 6

### 7.1 The terminal release path is strong

`releaseSubject` is already the closest thing to the required lifecycle boundary. It resolves and locks:

- active Waha applications and credentials;
- active residents;
- all subject bookings and future non-cancelled bookings;
- permits;
- vehicles;
- residents registered by the departing subject;
- guests and guest passes;
- future paid Guest Day Passes;
- payment attempts;
- verification records; and
- owner-ID attempts.

It then:

- revokes active Waha credentials and applications;
- appends Waha revocation events;
- marks resident records `moved_out`;
- cancels future bookings;
- preserves past bookings and unit attribution while removing personal linkage;
- keeps vehicles but clears their user link and sensitive registration value;
- clears portal/user relationships;
- deletes push tokens and notification preferences;
- records the release operation and postconditions;
- deletes the departing local user;
- queues Clerk identity deletion.

Source: `artifacts/api-server/src/lib/releaseSubject.ts:301-718`.

### 7.2 Dependency matrix

| Event/path | Waha | Bookings | Vehicles | Portal/user linkage | Resident history |
|---|---|---|---|---|---|
| Shared terminal release | Revoked with events | Future cancelled; past retained/anonymized | Retained, user link cleared, sensitive value cleared | Cleared; local user deleted; external deletion queued | Marked `moved_out` |
| Disable portal access | Not revoked | Unchanged | Unchanged | Invitation revoked and account unlinked | Resident remains |
| Direct Waha revocation | Credential/application revoked | Future booking cancellation attempted separately | Unchanged | Unchanged | Resident remains |
| Admin delete unlinked resident | No dependency preflight | No dependency preflight | No dependency preflight | Only allowed when no linked user | Resident row physically deleted |
| Make tenant resident row inactive | No universal cascade | No universal cascade | No universal cascade | Verified tenancy may remain | Produces the W14 class of inconsistency |

### 7.3 Vehicles

The code currently answers the review's question implicitly:

- during terminal release, vehicles are treated as operational records that survive;
- the departing user's link is cleared;
- the registration identifier is anonymized.

That is closer to “vehicle belongs to the unit” than “vehicle is deleted with the person,” but no explicit transfer or reassignment state is created. The retained vehicle can therefore become ownerless rather than deliberately transferred.

The product owner still needs to confirm the intended rule:

- vehicle belongs to the unit and is transferred to the continuing/new primary occupant; or
- vehicle belongs to the person and is deactivated at departure.

### 7.4 Waha eligibility

Adult status and portal access are checked when a Waha holder is selected or issued. Existing Waha validity checks rely on active credential/application status and unit/holder linkage. They do not re-evaluate current resident status or portal eligibility.

Therefore:

- terminal release revokes Waha correctly;
- portal-access removal alone does not;
- resident status change/removal outside terminal release does not reliably do so.

This is the same creation-only rule as OC1.

### 7.5 Bookings

Terminal release cancels future bookings and preserves past bookings with unit attribution. That is coherent and auditable.

Direct Waha revocation invokes a separate future-booking cancellation helper outside the credential transaction. The source explicitly treats full atomicity as deferred. It is acceptable for pass-only revocation only if callers never mistake it for resident departure.

### 7.6 Second portal-access resident

For tenant terminal release, the release engine selects all active residents on the unit and marks them moved out. That means the second portal-access resident ends with the household, which matches the likely product rule.

This behavior exists, but is not expressed as a user-facing rule and is not consistently reached by portal-access or resident-level removal actions.

## 8. Unit integrity

### 8.1 Lifecycle item 1 — phantom units

#### Implemented

- Unit references are normalized.
- Concurrent duplicate creation is protected by the normalized-unit uniqueness constraint.
- Administrators can correct building and unit number.
- Corrections are serialized and append audit records.
- System units cannot be edited.

Source: `artifacts/api-server/src/routes/units.ts:296-326,402-477`.

#### Gap

An owner claim calls `getOrCreateUnitInTransaction`. If the normalized reference does not exist, the claim creates the unit before approval. An administrator can also create a unit directly. Neither path checks a master list of the 452 built units.

There is no product delete-unit route. A false but well-formed unit therefore becomes a persistent unit that can be corrected but not removed.

The database also cannot reliably answer “how was this unit created?”:

- W14 and G3 have owner-verification records created at the same instant as their units, which strongly indicates claim creation.
- CE34 has no verification record.
- The unit table has no authoritative creation-source field or creation audit that distinguishes claim, administrator, seed, or migration.

Seeding the real 452-unit master remains a product decision, not a defect fix.

### 8.2 Lifecycle item 3 — permit expiry

#### Implemented

- Renovation dates are required.
- End date cannot precede start date.
- Status transitions are explicit and guarded.
- Terminal permit states cannot transition further.
- Current Development data has no approved/in-progress permit already past its end date.

Source: `artifacts/api-server/src/routes/permits.ts:113-255,294-389`.

#### Gap

There is no expired permit state or general current-validity rule.

- List/detail reads return records by status without applying their date range.
- An approved permit can remain `approved` after its end date.
- Availability/current authorization is not represented as a shared derived value.
- Move-in, move-out, and renovation permits share this gap.

The correct future design requires a product decision between:

- retaining approval as historical status and deriving `current/expired` from the date range; or
- performing an explicit automatic transition to an expired state.

No choice was implemented.

### 8.3 Lifecycle item 5 — stale verification claims

#### Implemented

- Owner-manual claims receive a 14-day `expiresAt`.
- Tenant requests receive a 5-day `expiresAt`.
- Submission and approval include duplicate/current-link checks.
- Approval rechecks pending status and applicant existence.
- Owner-manual pending claims appear in administrator attention.
- Tenant requests are routed to the verified owner rather than administrator approval.
- Approved tenancy has a separate lease lifecycle with suspension/release machinery.

Source: `artifacts/api-server/src/routes/units.ts:620-671,724-869,1006-1130`.

#### Gap

No general process was found that reads `unit_verifications.expiresAt` and transitions an expired pending claim. The timestamps are written but are not an operational lifecycle.

Consequences:

- an abandoned pending claim can remain pending;
- uniqueness checks can continue treating it as active;
- stale tenant requests have no administrator fallback because tenant approval correctly belongs to the owner;
- ageing/attention is not the same as expiry or cancellation.

Current Development has no pending claim, so this is a latent code-path gap rather than a current blocked unit.

## 9. Lower-priority lifecycle review

### 9.1 Item 7 — `users.status`

**Partially meaningful.**

- `suspended` is meaningful: protected API middleware rejects it.
- `active` is used by selected business queries and invitation flows.
- `pending` is a provisioning default, but general API authorization permits pending users just like active users.

This explains why a pending administrator account can operate normally. The effective global rule is “block suspended,” not “require active.”

Primary source:

- `lib/db/src/schema/users.ts`
- `artifacts/api-server/src/middlewares/requireApiAuth.ts`
- `artifacts/api-server/src/routes/users.ts`

### 9.2 Item 8 — announcements

**Expiry is partly implemented.**

- Announcements have optional `expiresAt`.
- Expired announcements are excluded from the resident collection list.
- Administrators can still see them.
- Responses expose a derived `isExpired`.
- Manual soft deletion exists.

Gap:

- direct resident detail lookup does not consistently reject an expired announcement;
- expiry does not archive or transition the record.

There are currently no published announcements in Development.

Primary source: `artifacts/api-server/src/routes/announcements.ts`.

### 9.3 Item 9 — facilities

**Deactivation is implemented; booking consequences are not.**

- Facilities have `isActive`.
- Normal resident lists hide inactive facilities.
- New booking creation rejects inactive facilities.
- Delete is a soft deactivation, not physical deletion.

Gap:

- direct facility detail and availability can still read an inactive facility;
- deactivation does not decide existing paid/unpaid booking outcomes;
- no cancellation, refund, hold release, or resident-notification policy is invoked.

All Development facilities are currently active.

Primary source:

- `artifacts/api-server/src/routes/facilities.ts`
- `artifacts/api-server/src/routes/bookings.ts`

### 9.4 Item 10 — unbounded tables

**The two named retention policies are missing.**

- `notification_events` delivery state changes, but delivered/suppressed/failed rows are not operationally purged.
- `api_rate_limit_counters` reuses a row for the same scope/subject, but unique subjects accumulate and there is no age-based purge.

Already implemented elsewhere:

- guest history has configurable retention and a purge;
- portal-help screenshots have deletion deadlines and durable deletion jobs;
- payment records intentionally preserve audit data.

Current Development contains 46 notification events and 16 rate-limit counter rows. This is not currently a capacity incident; it confirms the tables are active and have no lifecycle cap.

Primary source:

- `lib/db/src/schema/notificationEvents.ts`
- `lib/db/src/schema/apiRateLimitCounters.ts`
- `artifacts/api-server/src/lib/notificationService.ts`
- `artifacts/api-server/src/lib/durableRateLimit.ts`

## 10. What is already implemented and should be reused

The report should not lead to rebuilding machinery that already exists.

1. **Shared terminal release engine**
   - advisory locking;
   - deterministic dry-run and execution graph;
   - idempotent release operation;
   - Waha revocation and events;
   - resident archival by status;
   - future-booking cancellation;
   - unit attribution retention;
   - PII anonymization;
   - local/external identity separation;
   - postcondition recording.

2. **Automatic tenant move-out scheduler**
   - due-form selection;
   - canonical active-tenant check;
   - idempotency marker;
   - shared release invocation.

3. **T12 tenant-approval gate**
   - correct business rule at one transition;
   - suitable rule to generalize, not duplicate.

4. **Portal invitation revocation**
   - transaction and row locks prevent invitation-consumption races;
   - correctly frees the unit's invitation slot.

5. **Unit correction audit**
   - serialized reference changes;
   - append-only old/new values.

6. **Tenancy lifecycle after approval**
   - lease dates;
   - renewal/suspension/release handling;
   - shared terminal engine integration.

7. **Announcement list expiry, facility soft deactivation, guest-history purge, and portal-help deletion**
   - partial lifecycle patterns already exist and should be completed rather than replaced.

## 11. Recommended delivery boundary

### Recommendation: one coherent foundation delivery

Deliver together:

- canonical unit occupancy state and invariant;
- symmetric owner/tenant exclusivity;
- resident roles and permissions for add/remove/self-removal;
- four-resident policy and fifth-resident review, once the count is confirmed;
- automatic owner and tenant move-out at Riyadh end-of-day;
- approved move-out finality and user warning;
- one dependency preflight and one terminal execution path;
- Waha, booking, vehicle, portal, invitation, resident-history, and identity effects;
- correction/reporting of existing inconsistent units only after product-owner review.

### Keep the implementation internally reviewable

One delivery does not mean one undifferentiated code change. It should have internal workstreams:

1. invariant and current-state audit;
2. resident mutation policy;
3. terminal dependency graph;
4. Riyadh scheduler and owner/tenant trigger coverage;
5. historical/read-model behavior;
6. controlled data correction;
7. one end-to-end acceptance matrix.

These workstreams should merge and be accepted together because none is safe as an independently shipped product state.

### Unit integrity can follow as the next foundation delivery

After OC1/dependencies:

1. master-unit decision and phantom-unit handling;
2. permit current/expired semantics;
3. stale claim transition and attention policy.

These relate to the same lifecycle principle but do not need to block the atomic occupancy/dependency delivery.

### Smaller Round 2 findings remain later

Per product-owner sequence:

1. view-only PDFs;
2. full unit-reference display;
3. verification/account name mismatch;
4. parking rework;
5. communication reply confirmation;
6. administrator dashboard restructure.

No guard-surface, mobile, or Part 7 work belongs in the present sequence.

## 12. Decisions required before implementation

1. **Four-resident limit:** four total including the primary occupant, or primary plus four?
2. **Vehicle lifecycle:** transfer with the unit, or deactivate with the departing registrant?
3. **Owner move-out:** which form/permit identifies the owner as the terminal subject?
4. **Permit expiry:** derived current validity while retaining historical approval, or explicit expired status?
5. **Stale claims:** automatic expiry/cancellation, administrator decision queue, or a staged combination?
6. **Unit master:** seed the 452 real units from Mullak, or continue claim-created units with a different existence check?
7. **Existing inconsistent data:** after the report is accepted, which occupancy track should W14 retain during controlled correction?

## 13. Plain answer

**I do not disagree with the product owner's instinct.**

OC1 and dependency handling are not adjacent fixes. They are two halves of one lifecycle invariant:

> What may exist on a unit, who may change it, and what must happen atomically when it stops existing?

The existing release engine means the system is not starting from zero. The safest path is to generalize T12 into a shared occupancy invariant and make the accepted release engine the only terminal boundary. Shipping either half without the other would preserve the class of failure that produced W14.