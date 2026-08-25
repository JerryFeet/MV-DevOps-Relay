# AD1–AD5 Admin Console — Implementation Plan

**Date:** 2026-08-26  
**Status:** Proposed for approval — **no implementation has been performed**  
**Inputs:** `Admin-Console-AD1-AD5`, updated requirements decisions 110–116, and current repository review.  
**Delivery rule:** Implement before the consolidated manual UAT round, so the product owner tests the console that will be used operationally.

## 1. Decision record and current-state findings

### 1.1 Announcements are not publicly reachable

Announcement reads are authenticated today:

- `GET /api/announcements` requires API authentication.
- `GET /api/announcements/:id` requires API authentication.
- `/portal/announcements` is a signed-in portal route.
- The announcement visibility helper denies a missing caller.

Therefore, H3 is **not incomplete** on announcement authentication. The 2026-08-25 blueprint wording, “Public/resident reads,” is inaccurate and will be corrected to **“authenticated portal reads.”** Facilities remain public by deliberate decision 116.

### 1.2 Concurrent administrator decisions are not consistently safe today

Several decision handlers check a record’s state before acting, but then update by ID without requiring that the state is still unchanged. Two administrators can therefore both pass the initial check.

The risk is concrete:

- a second communication decision can overwrite the first and repeat a direct email;
- two Waha approvals can begin credential creation after both read `pending_review`;
- owner verification, permit, and ownership-change decisions have the same read-then-act gap;
- an approved ownership change currently does not persist the ownership-change event as `approved`, leaving its review state ambiguous after the release step.

The proposed response is deliberately small: **an atomic expected-state decision transition**. The server changes an item only when it is still in its expected undecided state. A zero-row transition returns a stable `409` telling the second administrator to refresh. Downstream effects run only for the winning transition.

This is not a claim, assignment, live-presence indicator, or locking UI. It is a decided-state guard proportionate to two administrator accounts.

## 2. Scope, invariants, and exclusions

### In scope

1. AD1 attention panel with all seven queues, counts, oldest waiting item, and direct links.
2. AD2 decision-ready details for every queue.
3. AD3 bilingual email and push notifications through the existing X3 notification service.
4. AD4 second existing-`admin` account, Operations Manager label, per-account routing flag, and safe concurrent decisions.
5. AD5 authenticated-only announcements and removal of the unimplemented maintenance page from the resident surface.
6. Decision 116 regression coverage: facility catalogue stays public.

### Non-negotiable invariants

- `admin` remains the only administrator/approval role. No `approver` or `supervisor` role is introduced.
- Tenant approvals and tenancy renewals remain owner-only and do not appear in any administrator attention queue.
- The attention panel is shared: both administrator accounts see the same work and counts.
- The notification routing flag is per account, may be enabled for multiple accounts, and does not change authorization.
- A title deed remains available to an administrator while the verification is pending; B4 deletion happens only after the decision.
- The notification service is extended; no parallel alert/email subsystem is introduced.
- No resident photo is collected, stored, requested, or displayed.

### Explicit exclusions

- No claiming, “currently reviewing,” assignment, or locking system.
- No new role, role-enum migration, or permission-matrix expansion.
- No tenancy approval or renewal action for administrators.
- No maintenance-request feature; the existing unimplemented resident page is removed.
- No production access, live payment configuration, deployment, schema push, automatic migration, or database reset.

## 3. Delivery sequence

### Phase A — Freeze-safe schema and account foundations

#### A1. Add per-account approval-notification routing

Add `receivesApprovalNotifications` to notification preferences, not to roles and not as a hard-coded email address.

**Data design**

- Boolean, `NOT NULL`, default `false`.
- Belongs to the account’s notification-preference record.
- Existing accounts remain unflagged by default; ordinary resident notification preferences are unchanged.
- The flag can be enabled for one or more existing administrators.

This placement keeps routing per-account, supports future handovers, and avoids a user-role change.

#### A2. Add the durable Waha replacement-request lifecycle

The current Waha flow records a loss/damage/stolen credential and can create a payment attempt, but it has no durable replacement request, queue endpoint, or administrator approve/reject transition. Payment attempts and append-only Waha events are not a valid substitute for an approval queue.

Add a dedicated `waha_replacement_requests` lifecycle, linked to:

- original credential;
- Waha application and unit;
- requesting user;
- reason (`lost`, `stolen`, or `damaged`);
- decision/status;
- reviewer and decision note;
- payment attempt and issued replacement credential, when present; and
- created, reviewed, paid, issued, cancelled, and updated timestamps as appropriate.

Recommended states:

```text
pending_review → approved → payment_pending → paid → issued
pending_review → rejected
```

Only one open replacement request may exist for an original credential. The provider callback remains the only authority that issues a replacement credential; it marks the approved request paid/issued exactly once and retains the existing credential-level idempotency backstop.

#### A3. Migration discipline

Both schema changes are forward changes during the freeze:

1. Create one numbered forward migration after `0000_baseline`, following the repository’s current migration numbering convention.
2. Update the Drizzle schema and generated snapshots/ledger as required by the project migration process.
3. Regenerate the frozen baseline artefact after the migration is defined.
4. Replay the complete migration set against an empty database.
5. Compare the replayed catalog with the intended UAT schema and run the schema-integrity verifier.
6. Seed representative routing and replacement-request rows in the migration rehearsal.

Do **not** use `db:push`, apply a migration automatically, or change the development database while preparing this plan. The approved build executes the numbered migration through the accepted migration/replay process only.

#### A4. Provision the Operations Manager account safely

Create `approver@madainvillagehoa.com` as a second Clerk identity and local user with the existing `admin` role. Give the account the visible profile label **Operations Manager** using normal account profile fields; do not add a new role or hard-code an email in application logic.

Because the ordinary admin user-management endpoint correctly prevents self-service assignment of the admin role, provisioning is an operator-controlled step:

1. Create/verify the Clerk identity using the managed identity workflow.
2. Idempotently link/upsert the local user by Clerk ID and verified email.
3. Set the existing `admin` role through the controlled provisioning path.
4. Enable `receivesApprovalNotifications` for Operations Manager.
5. Leave the chairman’s routing flag disabled while retaining all administrative rights.

No password, Clerk secret, token, or personal credential is committed to source, evidence, seed data, or the migration.

### Phase B — Contracts and server-side attention model

#### B1. Add one authoritative attention endpoint

Implement `GET /api/admin/pending-items`, restricted to `admin`, returning **all seven fixed queues even when empty**. The endpoint—not the browser—computes:

- stable queue key;
- bilingual label key;
- count;
- oldest-waiting timestamp and a minimal safe summary;
- direct portal deep link; and
- a version/status value suitable for a stale-detail refresh.

The seven queues are:

| Queue key | Inclusion rule | Explicit exclusion |
| --- | --- | --- |
| `owner_verifications` | Pending manual owner verifications | `tenant_request` records |
| `permits` | Renovation, move-in, and move-out permits awaiting a decision (`submitted` or `under_review`) | Additional-vehicle history |
| `waha_applications` | Waha applications in `pending_review` | Active, revoked, and rejected applications |
| `waha_replacements` | New replacement requests in `pending_review` | Paid/issued, rejected, and cancelled requests |
| `ownership_changes` | Ownership-change events in `pending` | Terminal review events |
| `tenancy_release_cases` | Administrator release cases requiring a release decision/execution | Tenant approvals and every tenancy renewal |
| `communications` | Communications in `pending` | Already responded/deferred/rejected records |

Counts and oldest items are computed with scoped server queries. The portal must never infer them from a paginated page or hide a zero-count queue.

#### B2. Deliver decision-ready detail views

Retain domain ownership of the existing record APIs, but make each target view complete enough to decide without navigating through a resident screen.

| Queue | Required detail delivery |
| --- | --- |
| Owner verification | Every submitted field, applicant profile, unit, building-qualified parking entitlement, National ID only in admin scope, title-deed viewing link while pending, and SG11 approval-basis selector |
| Permit | All submitted fields: renovation categories, contractor name/mobile, dates, requested working hours, common-area impact, move details, and any attachment |
| Waha application | Applicant, unit, both proposed credential holders, eligibility result, and ineligibility reason |
| Waha replacement | Original credential/pass, holder, unit, submitted reason, prior replacement link/status, reviewer notes, and payment/issuance status |
| Ownership change | Full O2 impact review, including release consequences and future paid bookings with values before an approval is submitted |
| Tenancy release | Release impact review, requestor, stated reason, affected records, and release outcome/audit link |
| Communications | Sender full name, unit, email, mobile, subject, full message/reply thread, and response action |

For ownership and tenancy release views, reuse the shared release-engine planning data; do not duplicate release impact calculations in the portal. The plan request remains read-only until the approved decision/execute action.

#### B3. Document API and generated client changes

Update the OpenAPI contract before portal callers:

- `GET /admin/pending-items` request/response and seven fixed queue schemas;
- any missing detail-response fields needed for the table above;
- Waha replacement request list/detail/approve/reject/payment routes;
- `receivesApprovalNotifications` on the admin user-management read/update contract; and
- one standard stale-decision `409` response shape.

Regenerate the API React client and Zod validators from the revised contract. Preserve the current portal API pattern consistently rather than introducing an isolated hand-written response shape.

### Phase C — Notification routing through X3

#### C1. Add approval-queue notification semantics

Extend the existing notification catalog/service with an approval-queue event contract. A single parameterized event type is preferred over seven nearly identical infrastructure paths; its payload identifies the queue, unit, concise urgency summary, and deep link.

When an item enters any of the seven queues:

1. Select every active administrator whose per-account routing flag is enabled.
2. Enqueue one email event and one push event per selected recipient, using stable idempotency keys containing queue key and source record ID.
3. Render Arabic or English based on the recipient’s language.
4. Include queue name, unit when present, urgency detail, and the target console deep link.
5. Dispatch only after the domain transaction has committed.
6. Treat email/push provider failure as non-fatal to the underlying submission; retain normal retry/outbox behavior.

The routing flag makes these operational alerts intentional. A flagged account receives all approval queue notices through available email/push channels; an unflagged administrator receives none but can still view and decide every item.

#### C2. Remove duplicated approval-alert paths

Where submission code currently sends an administrator alert directly, route the approval alert through the X3 service instead. Keep resident-facing decision/reply notifications and normal operational contact emails only where they serve a separate recipient purpose. The result is one durable, auditable approval-notification pathway.

### Phase D — Concurrency-safe decisions

Apply the same server-side rule to every admin decision:

```text
change only if record ID matches AND current state equals the expected undecided state
```

The endpoint returns:

- success only to the transition winner; or
- `409 Conflict` with a stable message:  
  **“This item was already decided or changed by another administrator. Refresh the queue and try again.”**

The client disables duplicate local submits while pending, then refreshes both the detail and attention panel after success or `409`. Client disablement is convenience only; the database transition remains authoritative.

| Decision area | Required guarded transition |
| --- | --- |
| Manual owner verification | Atomically transition only `pending` verification; run unit/user/document/notification effects only after winning |
| Permit | Transition only from the server-validated current status; the first valid target wins |
| Waha application | Win `pending_review` before creating credentials; reject and approve are mutually exclusive |
| Waha replacement | Win new request’s `pending_review` before payment eligibility or rejection effects |
| Ownership change | Win `pending`, persist `approved` or `rejected`, then run the shared release engine only for the winner |
| Tenancy release case | Keep the shared release engine’s serialization/idempotency; add a clear expected-state guard around the queue-facing decision/execute transition |
| Communication | Transition only `pending`; send direct reply email and resident notification only after winning |

For multi-write domain actions, perform the winning state transition and related database changes as one transaction where needed. This is transaction integrity, not user claiming or a new lock/assignment feature.

### Phase E — Portal console and small resident-surface correction

#### E1. Make “Needs your attention” the administrator landing panel

Place the attention panel at the top of the existing administrator landing view.

Each of the seven rows displays:

- bilingual queue label;
- count, including `0`;
- oldest waiting timestamp plus a short safe identifier/unit;
- an accessible direct link to the appropriate admin detail/section; and
- a clear empty state rather than an omitted row.

The panel must work at narrow phone widths without horizontal clipping or action-label overflow. It is shared, not filtered by administrator identity.

#### E2. Improve existing queue sections instead of splitting the console

Keep the current admin console as the operational home. Add/extend domain detail drawers or pages from the panel links, preserving the section’s existing action controls but making every AD2 field visible before decision.

Decision controls remain absent for:

- tenant approval requests shown only as owner-owned context; and
- tenancy renewals.

They must not contribute to any admin queue count.

#### E3. User-management routing control

In administrator user management:

- display Operations Manager using the normal resolved account name;
- display the approval-notification routing flag for administrator accounts;
- allow an administrator to toggle the flag for one or more administrators;
- provide an explicit confirmation that routing changes notifications, not permissions; and
- prevent the interface from adding or assigning any new role.

#### E4. Announcements, maintenance, and facilities

- Correct the blueprint wording to “authenticated portal reads.”
- Add a direct unauthenticated regression test for announcement list and detail APIs.
- Retain the two current signed-in visibility levels: `all_portal_users` and `verified_owners`.
- Remove the unimplemented maintenance page from resident navigation and route configuration so it is not discoverable as a resident feature.
- Preserve the public facility catalogue and its homepage visibility.

## 4. Test and evidence plan

### Server and contract tests

1. Seven queue rows always returned; zero queues included; counts and oldest timestamps correct.
2. Owner verification queue excludes every `tenant_request`.
3. Tenancy renewals and tenant approvals never appear in the administrator attention response.
4. Every queue detail response includes the AD2-required data, including pending title-deed viewing before B4 deletion.
5. All attention/detail/decision endpoints reject non-admin callers.
6. Operations Manager provisioning is idempotent and does not create a new role.
7. Default routing is false; a flagged admin receives notices; chairman/unflagged admins do not; two flagged accounts both receive them.
8. Every approval-queue entry produces recipient-language email and push outbox rows with stable idempotency and deep-link payloads.
9. Provider failure/retry does not roll back a submission or decision.
10. Announcement list/detail reads return an authentication failure when signed out; facility catalogue remains publicly reachable.
11. No maintenance route remains in resident navigation.

### Concurrency regressions

For every administrator queue, submit concurrent same-action and conflicting-action requests from two administrator identities. Assert:

- exactly one successful transition;
- exactly one clear `409`;
- final state equals the winner;
- no duplicate credential, replacement request, release, title-deed cleanup, decision notification, or direct communication email;
- no partial user/unit/credential linkage; and
- a stale detail page recovers by refreshing the queue.

The existing release engine’s idempotency tests remain in place; the new test confirms the console decision boundary does not invoke it twice.

### Portal and mobile-width evidence

Capture both English and Arabic evidence for:

- the seven-row attention panel, including zero counts and oldest items;
- each full decision view;
- title deed visible immediately before a verification decision;
- Operations Manager label and routing toggle;
- notification routing results for one and two flagged accounts;
- clear stale-decision `409` behavior;
- absence of maintenance in resident navigation; and
- a phone-width administrator console with no clipped labels.

Run the affected API test suite, API type check, OpenAPI generation, portal type check, schema integrity check, empty-database migration replay/catalog comparison, and focused browser/device flows before manual UAT.

## 5. Acceptance checklist

- [ ] Admin landing view shows all seven queues, each with count, oldest waiting item, and direct link.
- [ ] Every queue appears at zero; tenant approvals and renewals appear nowhere in admin attention.
- [ ] Each detail view contains the complete submission/impact information required to decide.
- [ ] Title deeds remain viewable to the reviewer until the final decision.
- [ ] Operations Manager exists as a second `admin` account and is visibly labelled.
- [ ] One or more admin accounts can receive approval notifications through the per-account flag.
- [ ] Chairman receives no approval alerts when unflagged, while keeping all admin rights.
- [ ] Queue-entry notifications use X3 email and push, bilingual and deep-linked.
- [ ] A second concurrent administrator gets a clear `409`; no decision side effect duplicates.
- [ ] Announcement reads cannot be reached signed out.
- [ ] The maintenance page is absent from the resident surface.
- [ ] Facilities remain public.
- [ ] All schema changes are a numbered forward migration with baseline regeneration and empty-database replay evidence.

## 6. Approval boundary

This document is intentionally a plan only. Approval authorizes implementation of the phases above; it does not authorize production access, deployment, live Moyasar activity, automatic migrations, or schema changes outside the documented forward-migration process.