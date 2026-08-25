# SG10 — application photo-removal slice

Evidence revision: r1
Relay: JerryFeet/MV-DevOps-Relay, branch main
Classification: SG implementation evidence; migration intentionally deferred

## Deliberate scope

This slice deliberately removes all app-controlled personal-photo collection and display paths, not only the resident ID-photo form. SG10 says no personal photograph may be requested, uploaded, stored by an application flow, streamed, rendered, or returned. The broader Clerk-avatar removal is intentional: an app-controlled profile avatar is also a personal photograph path.

## Exactly removed

- Resident API ID-photo upload, validation, write, stream, and response-field behavior.
- Portal resident photo requirement, upload control, validation, admin display, and obsolete translations.
- Mobile Clerk profile-avatar upload/display hooks, image-picker permission/configuration, upload UI, preview component, and upload tests.
- Mobile guest-pass sponsor-photo rendering; the guest card now renders initials.
- H8a resident-photo deletion job creation, worker, scheduler wiring, and dedicated worker test.
- Resident photo fields/endpoints from OpenAPI and generated client/Zod contracts.

## Two distinct photo paths

1. Mobile rendering: sponsor/host photo display in the mobile guest-pass UI was replaced with initials. This is a presentation-path correction.
2. Public verifier: Defect 2 separately removed the Clerk sponsor-image lookup and image URL from unauthenticated /api/verify. That public verifier privacy correction still holds independently of the mobile initials fallback.

Neither path exposes a photo after correction.

## Sequencing boundary

The legacy residents.id_photo_key column and H8a outbox schema remain until the one approved forward migration. Application code no longer reads, writes, or returns those fields. No migration, baseline regeneration, development-schema change, or production access was performed in this slice.

Guest movement retention, Waha Guest Day Passes, payment attempts, and the H8b 90-day guest/gate purge remain preserved.

## Verification

API, portal, and mobile typechecks passed. API resident privacy/self-registration focused tests passed. Mobile initials/avatar focused tests: 7/7 passed. API contract code generation passed. All affected workflows restarted cleanly.
