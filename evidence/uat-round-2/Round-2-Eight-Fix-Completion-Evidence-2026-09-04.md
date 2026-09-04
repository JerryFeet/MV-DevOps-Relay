# Round 2 Eight-Fix Completion Evidence

**Date:** 2026-09-04  
**Environment:** Development only  
**Production:** Not accessed, changed, migrated, or deployed  
**Scope:** F-1 through F-8; Decisions 146–148; deterministic paid-booking proof; O2–O6 surface-parking approval proof; exact cleanup

## Result

The authorized Round 2 fixes are implemented and verified. The clean full portal E2E run passed with **86 passed, 7 intentionally skipped, and 0 failed** in 4.9 minutes. The stateful follow-up proved an authenticated deterministic payment from charge creation through provider-hosted test checkout and verified callback settlement, and proved that a valid surface-parking additional vehicle reaches the administrator approval state.

All disposable Development rows were removed. Exact `COUNT(*)` values for all 47 public tables match the accepted baseline, and the protected W14 snapshot is byte-identical before and after this verification.

## Authorized fixes

| Fix | Result | Evidence |
|---|---|---|
| F-1 | PASS | Unit Registry hides only legacy auto-created owner stubs; deliberate self-registration remains visible. Covered by `adminUnitRegistryTenantPath.test.ts`. |
| F-2 | PASS | The undocumented same-day/eight-hour household booking restriction and its copy were removed. Different facilities on the same day are allowed; F12 remains scoped to the same unit and facility. |
| F-3 | PASS | Parking-capacity checks use the requested parking type and authoritative unit entitlement. |
| F-4 | PASS | Gate lookup resolves canonical references through `units` and authoritative `unitId`; ambiguous legacy apartment-only values are not accepted as canonical matches. |
| F-5 | PASS | A free monthly-allowance booking presents the localized **Confirm Booking** action while preserving SAR 0 review. |
| F-6 | PASS | Unit-correction failures return safe client-facing errors and the correction history refreshes immediately after mutation. |
| F-7 | PASS | Guest Day Pass scan results display the validity date. |
| F-8 | PASS | Development supports deterministic paid/failed/pending outcomes; Production ignores deterministic mode and fails closed without real Moyasar configuration. |

## Decisions 146–148

1. **Decision 146:** The undocumented same-day household booking rule is removed completely.
2. **Decision 147:** No total concurrent-booking cap was added. F12 applies only to the same `(unitId, facilityId)`.
3. **Decision 148:** Gate unit lookup resolves canonical unit references through `units` and authoritative `unitId`, never ambiguous legacy `users.unitNumber`.

F12 continues to treat an unexpired pending-payment hold as active.

## Production deterministic-provider guard

`.replit` is committed and contains the Development-only settings:

- `PAYMENT_TEST_PROVIDER = "deterministic"`
- `PAYMENT_TEST_OUTCOME = "paid"`

The application does not trust `.replit` scoping alone. Provider selection also checks `NODE_ENV !== "production"`. A fresh focused run explicitly retained `PAYMENT_TEST_PROVIDER=deterministic`, set `NODE_ENV=production`, removed the Moyasar secret, and proved:

- `activeProvider` becomes `unconfigured`, not deterministic;
- Moyasar charge creation rejects with “not configured”;
- no simulated charge can be created.

Exact regression:

```text
src/__tests__/paymentProductionGuard.test.ts
deterministic payment production guard > never enables the deterministic provider in production
```

Fresh result:

```text
Test Files  1 passed (1)
Tests       1 passed (1)
```

The test emitted the expected fail-closed warning: `PAYMENT_PROVIDER=moyasar but MOYASAR_SECRET_KEY is not set — payments fail closed`.

## Deterministic paid-booking proof

A disposable Development unit and the existing authenticated verified-resident test identity were used. W14 was not used.

1. A payable Majli booking was prepared in `pending_payment` / `unpaid`.
2. Authenticated `POST /api/payments/create` returned HTTP 200 with payment attempt **3** and a `det_test_…` charge.
3. The browser opened **Deterministic Test Checkout** and visibly rendered **NON-PRODUCTION TEST CHECKOUT**.
4. The browser selected **Complete test payment**.
5. The checkout route invoked verified callback settlement and returned to the portal.
6. Authenticated `GET /api/bookings/51` returned:
   - booking status: `confirmed`;
   - payment status: `paid`;
   - non-null `paidAt`;
   - payment provider: `moyasar`.

This exercised the real authenticated payment-create route, deterministic provider checkout, provider-side recorded outcome verification, purpose handler, and booking settlement. No live payment processor or Production credential was contacted.

## O2–O6 surface-parking approval walkthrough

The disposable unit had two eligible surface spaces and no underground entitlement. One active surface vehicle was seeded so the next submission was an additional vehicle.

### O2 — create valid approval item

Authenticated `POST /api/vehicles` returned HTTP 201 for vehicle **5**:

- `isAdditional=true`;
- `isBasementParking=false`;
- `status=pending_approval`;
- the existing Development registration document was verified;
- `verifiedResidentName=R2FIX Resident`.

This closes the Round 2 fixture defect: the request used an eligible surface space rather than an already-occupied underground space.

### O3/O4 — administrator read model

An authenticated administrator fetched the exact tagged vehicle through the administrator-authorized vehicle read model:

- HTTP 200;
- vehicle id 5;
- `status=pending_approval`;
- `isAdditional=true`;
- `isBasementParking=false`.

The user-role catalog has no separate Operations Manager authorization value; it contains owner, tenant, admin, and guard. “Operations Manager” and “ordinary administrator” are administrator personas, not distinct authorization classes. The admin dashboard did not render the tagged plate in this saved-session walkthrough, so no UI screenshot or external email/push-delivery claim is made for O3/O4.

### O5 — decide the approval

Authenticated administrator `PATCH /api/vehicles/5` returned HTTP 200:

- `status=active`;
- `approvedById` populated;
- `reviewedById` populated;
- approval note persisted.

### O6 — reopen after decision

After reopening the administrator read model:

- vehicle 5 remained `active`;
- the exact vehicle appeared zero times in the pending-approval set.

No second pending approval action remained.

## Verification matrix

| Check | Result |
|---|---|
| Focused API regressions for booking ownership/F12, canonical gate search, Unit Registry filtering, parking corrections | PASS |
| Focused portal regressions for scanner generation, Day Pass date, free-booking action, correction history | PASS |
| API typecheck | PASS |
| Portal typecheck | PASS |
| Portal unit suite | PASS — 77 files, 1,419 tests |
| Production deterministic-provider guard | PASS — 1 file, 1 test |
| Clean full E2E | PASS — 86 passed, 7 skipped, 0 failed |
| API and portal startup | PASS |

An automatic later E2E workflow invocation started before the API and portal workflows were ready and failed its pre-flight with HTTP 502. It executed no tests and does not replace the completed clean 86/7/0 run.

## `users.unitNumber` audit

Canonical gate lookup no longer relies on `users.unitNumber`; it resolves `units.normalisedUnitNumber` and queries residents through authoritative `unitId`.

`users.unitNumber` remains intentionally present for historical/display projections. Ambiguous bare-unit logic also remains in resident invitations and the move-out scheduler, outside the authorized eight-fix scope. No global column retirement or unrelated refactor was performed.

## Exact cleanup

The verification created only tagged disposable Development data. Cleanup removed:

- one deterministic payment attempt;
- one paid/confirmed disposable booking;
- one base surface vehicle and one approved additional surface vehicle;
- one self-resident stub;
- one disposable unit;
- two vehicle-approval notification rows;
- the new `payment_create` and `deterministic_checkout` durable rate-limit rows.

The authenticated test identity was restored to its original owner role and original shared E2E unit. No temporary Clerk identity was created.

### All 47 exact public-table counts

These are exact `COUNT(*)` values, not PostgreSQL planner/statistics estimates.

| Table | Final |
|---|---:|
| ai_knowledge_chunks | 0 |
| ai_knowledge_documents | 0 |
| announcement_edit_history | 0 |
| announcements | 0 |
| api_rate_limit_counters | 12 |
| bookings | 4 |
| communications | 3 |
| data_migration_corrections | 1 |
| document_folders | 3 |
| documents | 6 |
| external_identity_deletion_jobs | 0 |
| facilities | 2 |
| facility_booking_config_normalization_audit | 0 |
| facility_operating_hours_conflicts | 0 |
| guest_entry_exit_logs | 0 |
| guest_pass_verification_logs | 0 |
| guest_passes | 2 |
| guests | 2 |
| hoa_settings | 21 |
| household_invitations | 1 |
| monthly_booking_allowances | 1 |
| move_forms | 0 |
| notification_events | 36 |
| notification_preferences | 0 |
| ownership_change_events | 0 |
| parking_lots | 0 |
| payment_attempts | 0 |
| permits | 3 |
| portal_help_screenshot_deletion_jobs | 0 |
| portal_help_tickets | 1 |
| push_tokens | 0 |
| release_operations | 0 |
| residents | 4 |
| tenancy_lifecycles | 1 |
| tenancy_renewals | 0 |
| unit_master_data_audit | 0 |
| unit_verification_document_cleanup_retries | 0 |
| unit_verification_owner_id_attempts | 1 |
| unit_verifications | 2 |
| units | 3 |
| users | 9 |
| vehicles | 0 |
| waha_guest_day_passes | 1 |
| waha_pass_applications | 3 |
| waha_pass_credentials | 4 |
| waha_pass_events | 2 |
| waha_replacement_requests | 0 |

Every table matches the accepted pre-verification baseline.

### W14 protected-state proof

The private canonical snapshot covers the W14 unit, linked verified users, residents, Waha applications/credentials/events, bookings, monthly allowance, vehicles, permits, and unit-audit history.

- Current verification before SHA-256: `1f6c7c54bd901e7d6a0bf9aad1a69de310ca33c9ba8408c6c2e6061e7463f500`
- Current verification after SHA-256: `1f6c7c54bd901e7d6a0bf9aad1a69de310ca33c9ba8408c6c2e6061e7463f500`
- Byte comparison: exact match
- Previously accepted Round 2 canonical fingerprint: `a7950fc373dbaa30a19f5697984350e04253dcc4dcb829271a0015fcf9024398`

The current hash uses a fresh canonical wrapper for this fix proof, so its value differs from the previously accepted wrapper while its before/after bytes are identical. No private canonical JSON or resident personal data is published.

## Change-control statement

- No deployment occurred.
- Production was not accessed.
- No migration, `db:push`, or schema mutation occurred.
- `.replit` changes are limited to the intentional Development deterministic-payment flags.
- The relay-aware promotion gate must compare and accept the synchronized canonical `.replit` before Publish.
