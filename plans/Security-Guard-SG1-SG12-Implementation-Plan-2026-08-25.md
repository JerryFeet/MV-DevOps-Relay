# Security Guard SG1–SG12

## What & Why

Implement decisions 97–105 as one coordinated security-guard release: a read-only guard dashboard with a unified credential scanner and complete permit lookups; removal of all personal photograph collection and display; recorded claim-assurance bases; mandatory record-only gender fields; and optional Guest Day Pass vehicle plates.

The work closes the unreviewed guard role, enforces that gate devices never expose National ID/Iqama data, and preserves the development-schema freeze through one numbered forward migration, a regenerated baseline, and a disposable empty-database proof. SG10 is a cultural and legal Saudi-Arabia constraint, not a cosmetic preference. Decision 105 supersedes decision 16; gender is stored for records and gate judgement only and must never become an operative eligibility, booking, facility, scheduling, or reporting rule.

## Current audit

### Gate response inventory

| Endpoint | Current response | Audit result |
|---|---|---|
| `GET /gate/residents?name=` | Up to 20 `{ id, firstName, lastName, email, unitNumber, role }` entries; short/missing name returns `[]`. | No National ID is returned, but the endpoint cannot search National ID/Iqama, has no required rate limit or failure logging, and returns email unnecessarily. |
| `GET /gate/move-out-status?unitNumber=` | `{ allowed, status, unitNumber, requestedStartDate, requestedEndDate, coveredPerson }`. | No National ID is returned. Only move-out exists; move-in is absent. |
| `GET /verify/waha?token\|passNumber=` | Missing pass: `{ valid, status, message }`. Found pass: `{ valid, status, passNumber, credentialIndex, holderName, occupancyTrack, unitNumber, sameDayGuestCount, revocationReason, message }`. | No National ID is returned. `sameDayGuestCount` conflicts with SG2 because the system must not imply it measures or enforces the complimentary guest allowance. |
| `GET /security/gate/passes` | Raw `guest_passes` rows. That schema includes `nationalId`, `verificationToken`, `guestId`, `residentId`, names, dates, vehicle plate, reason, status, and timestamps. | **SG6 violation:** National ID is present in the raw response. It is also not limited to today despite the endpoint comment. |
| `POST /security/gate/entry-exit` | Raw `{ id, passId, eventType, eventTime, securityGuardId, notes }` log row. | No National ID, but guard access is a write capability and conflicts with SG1’s read-only dashboard. |
| `GET /security/gate/entry-exit/:passId` | Raw entry/exit log rows: `{ id, passId, eventType, eventTime, securityGuardId, notes }`. | No National ID, but it is outside SG1’s five lookup purposes. |

Related scanner route: the current public guest-pass `GET /verify?token=` returns guest and sponsor detail, `residentId`, and a Clerk `sponsorImageUrl`. It has a process-local IP limiter. It must not remain the authenticated SG scanner contract because SG10 removes photo display and SG9 requires one guard-facing answer.

### `residents.id_photo_key` inventory

The gate dashboard is not the principal consumer. The resident API reads, requires, validates, writes, updates, lists, and streams it; the portal Resident Management page uploads it, blocks submission without it, displays it, and exposes photo-present controls. The release engine clears it and creates H8 photo-deletion jobs; the H8 worker, its 60-second scheduler, schema, migration, and tests exist solely to delete those objects. The mobile app has no resident ID-photo field, but it does contain separate Clerk-profile avatar upload/display controls that must be included in SG10’s “no personal photograph collected, stored or displayed” review.

## Done looks like

- A guard signs in through `/hoa-portal/`, is sent only to a bilingual gate dashboard, sees the signed-in name, and cannot reach resident or admin pages by navigation or direct URL.
- The dashboard performs only read-only checks and clearly says when the network prevents a check; it never substitutes stale, blank, or ambiguous data for a verdict.
- One scanner recognizes Waha Passes, guest passes, and Code 128 Guest Day Passes, produces a large valid/not-valid verdict with a specific reason, and returns only the SG9b fields in the selected language.
- No gate endpoint, response branch, error, scanner result, or raw-list endpoint exposes National ID/Iqama. National-ID resident lookup is rate-limited per guard and searched identifier with indistinguishable failed-search responses and review logging.
- Guards can check move-in, move-out, and renovation permits by unit, receiving only status, dates, contractor details where applicable, and the minimum decision data.
- No personal photograph is requested, uploaded, stored, streamed, rendered, or returned anywhere in portal, mobile, scanner, resident API, or AI knowledge. The guard help text instructs staff to request a physical ID card if identity is in doubt.
- Owner and tenant verification records require gender for new submissions; resident and guest registration require it on portal and mobile. Values are limited to male/female and change no facility, booking, eligibility, availability, scheduling, filtering, or reporting behavior.
- Owner and tenancy approvals require a persisted assurance basis; “Other” requires explanatory text, and the recorded basis remains visible in historical records after title-deed/Ejar deletion.
- Guest Day Pass creation accepts an optional vehicle plate and a plate-free pass remains valid; the plate appears only when supplied in the admin list and scanner result.
- One new forward migration follows `0000_baseline`; `0000_baseline.sql` is regenerated and proven against a disposable empty database. Historical migrations remain preserved, and no `db:push`, `drizzle-kit migrate`, production access, deployment, or live payment credential is used.

## Out of scope

- Offline gate access, cached credential lists, local verification, or stale-result fallback.
- Guard approvals, pass issuance/revocation, incident recording, entry/exit logging, or any other guard write capability.
- Mullak, Ejar, government identity, biometric, or document-authenticity integrations.
- Gender-based facility, booking, schedule, eligibility, filtering, reporting, or enforcement behavior.
- Live payment configuration, deployment, production schema/data access, and the deferred PDPL/compliance program.

## Steps

1. **Freeze-safe preflight and migration contract** — Inventory the development-only photo column, resident-photo object prefix, null gender counts, and existing migration ledger. Create one forward SG migration that safely handles the obsolete renovation enum, removes the resident photo column and H8a outbox table, adds nullable constrained gender fields, adds the optional day-pass plate, and persists SG11’s structured approval basis in the same migration; do not alter historical migration files or apply the migration to development automatically.

2. **Canonical baseline and proof** — Fold the approved SG schema shape into the canonical baseline, record the forward migration as baseline-incorporated, and run the disposable empty-database bootstrap plus normalized semantic catalog comparison. Preserve the guest/gate 90-day retention setting and purge behavior while removing only the obsolete H8a photo-cleanup portion.

3. **Remove photographs comprehensively** — Remove resident-photo fields, upload validation, storage reads, stream endpoints, UI displays, scanner image output, help text, AI knowledge references, H8a worker/scheduler wiring, and tests. Audit the separate Clerk profile-avatar feature and remove or disable any app-controlled collection/display so SG10’s no-photo rule is honored across portal and mobile; add the bilingual physical-ID fallback guidance to the gate experience.

4. **Create least-privilege guard API contracts** — Replace raw gate list responses with explicit SG projections, add National ID/Iqama lookup without ever serializing the searched value or stored identifier, rate-limit by authenticated guard and one-way identifier subject, log repeated failures, and use one indistinguishable failure result. Restrict or retire guard access to entry/exit write/history APIs so the guard dashboard remains read-only, while preserving retained operational logs for authorized historical use.

5. **Complete permit and credential lookups** — Add read-only move-in and renovation unit lookups with the minimum SG3 fields. Replace separate public/auth scanner semantics with one authenticated resolver that recognizes Waha, guest-pass, and Guest Day Pass identifiers; use specific invalidity reasons, omit National ID and photographs, and avoid any guest-limit claim or same-day guest count.

6. **Build the guard-only portal experience** — Route guard sessions from the existing sign-in URL to the new gate dashboard, deny all other portal routes, surface the signed-in name, and implement a shorter proposed eight-hour guard session enforced on every request. Ensure suspended or removed guards are refused on their next request, and show an explicit unavailable/network-error state rather than a stale or empty result.

7. **Add identity-assurance approval records** — Require at least one approved basis for owner verification and for an owner’s tenancy approval, require detail for “Other,” retain those structured records after document cleanup, and show them in admin historical records. Provide bilingual selectors in every portal or mobile approval surface that exists; do not create external verification integrations.

8. **Add gender and vehicle-plate form coverage** — Require the two allowed gender values client- and server-side for owner verification, tenant verification, resident registration, and guest registration. Add optional Guest Day Pass vehicle plate collection and display in portal and mobile, preserving valid behavior when omitted.

9. **Close the Dalil privacy test policy** — Replace the cancelled legacy follow-up’s unsafe prompt expectations with explicit privacy-contract tests proving that resident, unit, booking, payment, National ID, gender, and photo data never enter Dalil prompts. Preserve the knowledge-only scope without weakening it to satisfy legacy fixtures.

10. **Prove the release** — Add unit/API coverage for every gate projection and negative branch, scanner credential/type outcomes, immediate guard removal, National ID redaction/rate limiting, permit lookups, photo absence, SG11 basis validation, gender and optional plate submissions, migration shape, and H8b retention preservation. Run portal and mobile bilingual flows plus a human guard walkthrough of all five purposes; publish individual evidence files after development-only proof.

## Relevant files

- `attached_assets/UAT-Change-Requirements-2026-08-18-4_1787652456275.md`
- `attached_assets/Security-Guard-Requirements-SG1-SG8_1787652456313.md`
- `attached_assets/Security-Guard-SG9-SG10_1787652456308.md`
- `attached_assets/Security-Guard-SG11_1787652456298.md`
- `attached_assets/Security-Guard-SG12_1787652456293.md`
- `artifacts/api-server/src/routes/users.ts:351-418`
- `artifacts/api-server/src/routes/verify.ts:19-278`
- `artifacts/api-server/src/routes/guestPasses.ts:83-144`
- `artifacts/api-server/src/routes/wahaGuestDayPasses.ts:49-210`
- `artifacts/api-server/src/routes/residents.ts:280-609,834`
- `artifacts/api-server/src/routes/units.ts:461-615,619-978`
- `artifacts/api-server/src/routes/permits.ts`
- `artifacts/api-server/src/lib/releaseSubject.ts:582-586,700-718`
- `artifacts/api-server/src/lib/residentPhotoDeletionJobs.ts`
- `artifacts/api-server/src/index.ts`
- `artifacts/hoa-portal/src/App.tsx:192-242,321-428`
- `artifacts/hoa-portal/src/pages/portal/SecurityGate.tsx`
- `artifacts/hoa-portal/src/pages/portal/residents.tsx`
- `artifacts/hoa-portal/src/pages/portal/unit-verification.tsx`
- `artifacts/hoa-portal/src/pages/portal/guests.tsx`
- `artifacts/hoa-mobile/app/(home)/unit-verification.tsx`
- `artifacts/hoa-mobile/app/(home)/(tabs)/guests.tsx`
- `artifacts/hoa-mobile/app/(home)/(tabs)/index.tsx`
- `artifacts/hoa-mobile/app/(home)/(tabs)/profile.tsx`
- `lib/db/src/schema/residents.ts`
- `lib/db/src/schema/unitVerifications.ts`
- `lib/db/src/schema/guestPasses.ts`
- `lib/db/src/schema/wahaGuestDayPasses.ts`
- `lib/db/migrations/0000_baseline.sql`
- `lib/db/migrations/0039_h6_drop_renovation_scope.sql`
- `lib/db/migrations/0040_h8_retention_and_photo_cleanup.sql`
- `lib/db/migrations/0041_h9_durable_rate_limits.sql`
- `lib/db/migrations/MIGRATION_LEDGER.md`