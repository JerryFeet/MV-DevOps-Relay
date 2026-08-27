# PH1 Portal Help — implementation plan

**Date:** 2026-08-27  
**Status:** planning only; no implementation authorized  
**Requirements:** PH1 and decisions 124–126  
**Related contracts:** K5, AD1, AD2, AD4a, X3, B4  

## 1. Objective

Add **Portal Help** as a separate resident service-desk workflow for problems with the portal itself.

It must not become Contact HOA under another name:

1. The category allowlist contains exactly the seven approved portal-specific categories and no `Other`.
2. The bilingual scope warning appears above the form, not behind a link.
3. Admins can send the approved bilingual redirect reply for a misfiled request.

Contact HOA remains a separate surface restricted by K5 to verified owners. Portal Help must not weaken, reuse, or bypass that boundary.

## 2. Explicit non-goals

- Do not change Contact HOA eligibility or its K5 server guard.
- Do not create a maintenance workflow or downstream maintenance ticket.
- Do not edit or ingest the attached operations manual; it is reference material pending product-owner approval.
- Do not expose Portal Help publicly or to guards.
- Do not deploy or mutate development/production databases during the schema freeze.
- Do not run `db:push`, `push --force`, `drizzle-kit push`, or `drizzle-kit migrate`.

## 3. Current-state findings

### 3.1 Contact HOA separation

The existing communications endpoint enforces verified-owner submission and retrieval. The existing portal route is shared by owner/tenant UI so that non-owners can receive the K5 explanation. Portal Help should therefore use its own route, API namespace, data model, labels, and admin queue; it should not add a mode or tab to the communications page.

### 3.2 Dalil position

- **Portal source:** the floating Dalil button is explicitly `right` for English and `left` for Arabic. This matches PH1.
- **Mobile source:** Dalil is currently a tab and home quick action, not a floating corner button. A source review cannot honestly certify the PH1 “bottom right / bottom left” mobile wording.
- **Required pre-ship gate:** capture authenticated English and Arabic screenshots on both the portal and a real mobile build. Keep English as **bottom right** and Arabic as **bottom left** wherever a corner icon exists. Never normalize the two strings into a literal translation.
- If the mobile product still has no corner icon, resolve that mismatch during implementation before accepting the wording. The implementation must either provide the mirrored mobile entry point described by PH1 or obtain an explicit product decision changing the mobile wording; it must not silently claim the current tab is in a corner.

### 3.3 Eighth attention queue

AD1 currently has:

- an API response with seven hard-coded queue keys; and
- a portal list with seven hard-coded tile descriptors.

The tile renderer and responsive one/two/three-column grid are generic and can display an eighth tile without a component or layout redesign. PH1 therefore requires a **data-contract extension, not a structural rebuild**:

- add a `portalHelp` queue to the admin pending-items response;
- add one Portal Help descriptor to the existing tile list;
- show count, direct link, and oldest-waiting age/time;
- retain the existing responsive grid.

### 3.4 Storage and deletion capabilities

The API already supports private object namespaces, authenticated callers obtaining short-lived signed read URLs, and strict deletion that surfaces failures for retry handling. PH1 should reuse those primitives in a dedicated Portal Help namespace and never return an object key or direct storage URL to a resident.

### 3.5 Schema impact

The current communications record cannot represent all PH1 requirements cleanly: it has Contact HOA types, no PH1 category contract, no screenshot key, no closure timestamp, and no screenshot-retention state.

The preferred design is a dedicated Portal Help ticket model rather than overloading Contact HOA. This preserves the K5 boundary in both code and data.

## 4. Proposed data model

Add a dedicated `portal_help_tickets` table with:

- ticket id;
- submitter user id;
- immutable submitter role and unit-reference snapshots captured by the server;
- category constrained to the seven approved values;
- mandatory details;
- nullable private screenshot object key;
- status with explicit open and closed states;
- nullable admin reply;
- reply timestamp and replying admin id;
- closed timestamp;
- screenshot deletion due timestamp fixed at 30 days after closure;
- screenshot deletion completion timestamp;
- created and updated timestamps.

Add a durable screenshot-deletion retry table or use the established B4-compatible deletion-job abstraction, provided it records:

- ticket/object identity;
- attempt count;
- next attempt time;
- last error;
- completion time.

Do not store signed URLs. They are generated on demand and expire.

## 5. Migration and freeze plan

The migration ledger states that a fresh database is:

```text
0000_baseline.sql → active forward migrations → semantic catalog diff
```

When the product owner releases the freeze and authorizes implementation:

1. Add the next forward-only numbered migration after the baseline/history sequence, expected to be `0045_portal_help.sql`.
2. Record it under **Active forward migrations** in the migration ledger.
3. Review the SQL independently before any application.
4. Apply it only through the approved development process; never through push or automatic migration hooks.
5. Regenerate `0000_baseline.sql` from the approved resulting schema.
6. Prove an empty database can be built from the regenerated baseline plus any still-active forward migrations.
7. Run the semantic catalog diff, including constraints, indexes, foreign keys, triggers/functions, and enum/check behavior.
8. Re-freeze development before Publish.

No migration command or database mutation is part of this planning deliverable.

## 6. API plan

Create a separate `/portal-help` API surface.

### Resident endpoints

- Create a ticket with category, details, and optional image.
- List the caller’s own tickets.
- Open one of the caller’s own tickets and see its status/reply.

Authorization:

- allow signed-in owners, main tenants, and household accounts that currently have portal access;
- deny public callers;
- deny guards at the module boundary;
- never permit one resident to read another resident’s ticket or screenshot;
- derive submitter identity, role, and unit on the server.

Validation:

- accept exactly the seven PH1 categories;
- require non-empty details;
- accept at most one image;
- use an explicit image MIME allowlist and a documented upload-size limit aligned with existing secure upload policy;
- reject unknown fields/categories rather than coercing them.

### Admin endpoints

- Paginated/filterable ticket list.
- Ticket detail containing category, details, submitter name, unit and role.
- Reply and close action.
- One-click approved bilingual misfiled-request redirect reply.
- Authenticated admin-only screenshot retrieval endpoint returning a short-lived signed URL.

The screenshot endpoint must:

- require an admin role on every request;
- look up the private object key server-side;
- issue a read-only URL with a short lifetime;
- return no URL when the screenshot is absent or deletion has completed;
- deny resident and guard requests even when they know a ticket id.

## 7. Notification plan

- A new Portal Help submission notifies the account flagged under AD4a, not a generic chairman/admin account.
- An admin reply notifies the submitter and is visible in the portal ticket.
- Delivery follows the existing post-commit notification pattern so a notification failure cannot erase or roll back a submitted ticket or reply.
- Use stable idempotency keys for submission and reply events.
- Preserve the approved bilingual redirect text exactly in the ticket history.

## 8. Portal and mobile UI plan

### Navigation

- Add **Portal Help** as its own menu item/screen.
- Do not place it inside Contact HOA and do not label it as complaints, suggestions, community contact, or maintenance.
- Show it only to signed-in resident accounts with portal access.
- Keep it unavailable to guards and public users through navigation, direct URL/deep link, and API.

### Form

Above the fields, render the full approved bilingual PH1 scope text, including:

- what Portal Help is for;
- what it is not for;
- landlord/Contact HOA redirection;
- User Manual and Dalil pointer;
- response-time statement.

Fields:

- mandatory single-select category;
- mandatory details;
- optional single screenshot;
- read-only submitting identity/unit/role display sourced from the signed-in account.

The category UI and server validation must contain exactly:

1. sign-in/account creation;
2. unit/household registration;
3. booking/Waha Pass/guest pass;
4. payment;
5. document opening;
6. vehicle/permit registration;
7. on-screen problem.

There is no `Other`.

### Admin

- Add the eighth Portal Help attention tile.
- Link it to a dedicated Portal Help inbox/detail surface.
- Show count and oldest-waiting information.
- Show all AD2 details when opened.
- Provide normal reply/close and the standard redirect action.

## 9. Screenshot lifecycle

1. Upload into a dedicated private namespace.
2. Store only the canonical private object key on the ticket.
3. Never return the key or a direct object URL to browser/mobile clients.
4. Permit retrieval only through the admin role-guarded signed-URL endpoint.
5. When a ticket closes, atomically set `closed_at` and deletion due time to `closed_at + 30 days`.
6. A scheduler selects due, undeleted screenshots with bounded batches and concurrency safety.
7. Successful deletion records completion and clears or tombstones the object reference.
8. Failed deletion records a retry job and does not roll back or block ticket closure.
9. Reopening before deletion cancels/reschedules the due deletion; reopening after deletion never recreates the image.

## 10. Test and UAT plan

### Scope guards

- Owner, main tenant, and portal-enabled household account can open and submit.
- Public, signed-out, guard, suspended/no-portal-access, and unrelated resident requests are refused.
- Contact HOA remains verified-owner-only at UI and API.
- Portal Help is not reachable as a Contact HOA tab or communications type.

### Category and wording guards

- Exactly seven bilingual options; no `Other`.
- Unknown/tampered categories fail server-side.
- Approved scope text is visible above the form in both languages.
- The standard redirect reply is exact, bilingual, stored, shown to the submitter, and notified.

### Dalil directionality

- Authenticated portal English screenshot: icon bottom right.
- Authenticated portal Arabic screenshot: icon bottom left.
- Real mobile English and Arabic screenshots: verify the actual entry point and wording against the rendered build.
- Deliberate refusals ensure English never says left and Arabic never says right.

### Eighth queue

- Seed eight queue families concurrently.
- Verify the panel displays all eight without overflow at desktop, tablet, and mobile widths.
- Verify Portal Help count, direct link, and oldest-waiting item.
- Verify AD4a notification recipient is the flagged account.

### Screenshot security and retention

- Valid image upload and no-screenshot submission.
- Non-image, second image, oversized payload, and forged object key refused.
- Admin receives a short-lived signed URL.
- Owner, tenant, household member, guard, and unauthenticated retrieval are refused.
- List/detail responses never leak object keys or persistent URLs.
- Manipulated clock proves no deletion before 30 days after closure and deletion at/after the boundary.
- Reopen-before-expiry reschedules deletion.
- Deletion failure persists a retry and does not reopen or fail the closed ticket.
- Retry is idempotent when the object is already absent.

### Migration proof

- Baseline plus the active PH1 forward migration builds an empty database.
- Semantic catalog comparison passes.
- The numbered migration and regenerated baseline agree on the PH1 objects.
- Startup, deployment, and post-merge hooks contain no schema mutation.

## 11. Delivery sequence

1. **Freeze gate and migration review** — authorize the forward migration before code or database work.
2. **Schema and storage contract** — ticket records, private object namespace, deletion retry state.
3. **API and authorization** — resident/admin endpoints, exact category validation, signed retrieval.
4. **Notifications** — AD4a submission routing and submitter reply notification.
5. **Portal UI** — separate navigation/form/history and admin inbox/eighth queue.
6. **Mobile UI** — separate Portal Help entry/form/history and resolved Dalil-position behavior.
7. **Retention scheduler** — 30-day closure rule with retry semantics.
8. **Automated tests** — authorization, semantics, storage privacy, lifecycle, migration.
9. **Clerk-backed browser and real-mobile UAT** — bilingual wording, Dalil directionality, responsive eighth queue.
10. **Evidence publication** — publish source-backed results and screenshots individually with Git blob read-back and SHA-256 verification.

## 12. Implementation blockers to resolve before coding

These are technical parameters, not reopenings of decisions 124–126:

- approved screenshot MIME allowlist and maximum file size;
- exact open/closed status vocabulary and whether replies can occur without closing;
- scheduler cadence/batch size for deletion retries;
- whether mobile will add a mirrored corner Dalil control or receive separately approved wording matching its tab-based entry point.

Until those are resolved and the schema freeze is explicitly released, PH1 remains planning-only.