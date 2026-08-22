# Stage 5 — Phase 0 Contracts

**Revision:** r1  
**Status:** Review draft — blocks Phase 1 implementation  
**Source:** UAT Change Requirements, revision 4, X3, X7, F10, H1 and H2  
**Boundary:** UAT only. No live payment provider, production deployment, VAT, tax invoices, or Phase 1 code is authorized by this document.

## 1. Corrected Stage 5 scope

Stage 5 delivers:

1. **X3:** one notification service for all 16 required events.
2. **H1:** ordinary guest registration is independent of a Waha Pass. A portal user with verified unit linkage may register a guest; the Guest Day Pass remains Waha-gated.
3. **H2:** Guest Day Pass payment, confirmation, issuance, gate verification, and revocation.
4. **X7 / F10:** payment architecture used by Guest Day Passes, Waha replacement fees, and every facility booking.

The existing “free four guests” language is a disclaimer only. Stage 5 must remove quota counting, quota blocking, and any `GUEST_DAY_PASS_REQUIRED` enforcement. It must not build an allowance counter.

## 2. Provider decision

| Item | Contract |
|---|---|
| Chosen provider | **Moyasar** is the only live-provider adapter supported by the Stage 5 acceptance path. |
| Tap adapter | **Removed, not dormant.** Phase 1 removes Tap from the provider registry, configuration selection, tests, and documentation. Keeping an unexercised provider branch would preserve an alternate payment path that cannot meet the new callback contract. |
| Test provider | A deterministic test provider implements the same provider interface and can return success, pending, failed, cancelled, expired, and duplicate-callback outcomes. |
| Missing configuration | Fails closed. An unconfigured or unsupported provider rejects initiation; it never returns an apparent successful payment or issues an entitlement. |
| VAT and invoices | No VAT is added and no tax invoice is created. Stored prices are the amount charged. |
| Provider callback | Moyasar webhook signature verification is mandatory. Unsigned, malformed, replayed, or invalid callbacks are rejected and logged. |

## 3. Payment core contract

### 3.1 Purpose registry

Every payment attempt carries a controlled purpose. Adding a future payable product is a purpose registration plus one handler; it must not change the payment core, provider adapter, callback route, or payment state machine.

| Code | Price source | Confirmed-payment handler | Refundability |
|---|---|---|---|
| `guest_day_pass` | Configured Guest Day Pass per-guest price in the pricing registry; migrate the existing SAR 30 constant | Marks the requested Day Pass paid and issues exactly one pass/barcode | Non-refundable |
| `waha_replacement` | Configured Waha replacement fee in the pricing registry; migrate the existing SAR 100 constant | Issues exactly one replacement credential and transitions the original credential according to the replacement lifecycle | Non-refundable |
| `facility_booking` | Facility record: `pricing_model`, `price_per_hour`, and `flat_fee_amount` | Confirms exactly one pending booking or records no-payment-required for a zero-price booking | Non-refundable after confirmation |

The test suite must register a dummy purpose with a no-op handler and prove:

- it cannot issue anything before a verified callback;
- the payment core invokes its handler exactly once after one verified callback;
- a duplicate callback invokes it zero additional times;
- registering it requires no payment-core code change.

### 3.2 Attempt lifecycle

Each attempt has a persisted purpose, amount, currency, provider, provider charge identifier, business-subject reference, state, creation timestamp, terminal timestamp where applicable, and idempotency identity.

| State | Meaning | May issue entitlement? |
|---|---|---|
| `created` / `pending` | Server created the attempt and provider initiation is underway or awaiting result | No |
| `confirmed` | Server verified the Moyasar callback and committed the handler outcome | Yes, exactly once |
| `failed` / `cancelled` / `expired` | Provider or hold reached a terminal non-payment outcome | No |
| `rejected` | Callback failed validation, ownership, amount, unit, purpose, or signature checks | No |

The browser’s payment-result page is a state display only. Browser query values, provider redirect parameters, or a client-side success message never invoke a purpose handler.

### 3.3 Confirmation transaction

On a verified callback, the server must, in one transaction:

1. lock and read the payment attempt by provider charge identity;
2. verify purpose, amount, currency, provider, status, authorized business subject, and callback signature;
3. return the already-recorded outcome if the attempt is already confirmed;
4. mark the attempt confirmed;
5. invoke the registered purpose handler exactly once;
6. commit the resulting entitlement and audit event together.

The database must enforce uniqueness of provider charge identity. Concurrent callbacks for one charge must produce one confirmed attempt and one handler result.

Pending, failed, cancelled, expired, wrong-user, wrong-unit, wrong-purpose, wrong-amount, unsigned, or invalid-signature callbacks issue nothing.

## 4. H1 and H2 guest contracts

### H1 — ordinary guest registration

- Any portal user with verified unit linkage—owner, main tenant, or household member with portal access—may register an ordinary guest for their unit.
- An active Waha Pass is **not** a precondition for ordinary guest registration.
- Existing owner/staff/gate authorization boundaries remain in force.
- This change does not make Guest Day Passes free or Waha-independent.

### H2 — Guest Day Pass

- The unit must hold an active Waha Pass and the requesting user must have portal access plus a completed resident record for that unit.
- Request fields are one visit date (today or later) and 1–10 guests. Eleven is refused by both UI and API.
- The stored price is calculated from the purpose registry, displayed before payment, and captured on the payment attempt.
- Lifecycle is `pending_payment` → `paid` → `issued`.
- Before confirmed payment, the request has no scannable barcode and fails gate verification.
- The confirmed `guest_day_pass` handler issues one bilingual Code 128 pass that covers the requested guest count and includes the specified host, unit, date, and payment information.
- The pass is non-refundable and non-transferable. Revocation carries a reason and no refund.

## 5. F10 — payable facility booking contract

### 5.1 Slot-hold invariant

Facilities are exclusive use. A priced resident booking must be inserted as `pending_payment` **before** provider initiation and must hold the requested slot.

- The existing per-facility advisory-lock transaction remains the admission path.
- The existing `bookings_active_facility_start_unique` guarantee remains in place and must include `pending_payment` as an active, slot-holding state.
- Buffered-overlap admission continues to apply; payment work must not weaken the accepted Stage 3a overlap or unique-index guarantees.
- A second concurrent resident attempt for the same slot receives a clean refusal before provider initiation. It must never reach a point where two residents pay for one exclusive slot.

### 5.2 Hold lifecycle

| Event | Booking result | Slot result |
|---|---|---|
| Resident begins paid booking | `pending_payment` | Held |
| Verified payment callback | `confirmed` | Remains held as the booking |
| Payment failure, cancellation, or rejection | Terminal non-confirmed state | Released immediately |
| Hold reaches expiry | Terminal non-confirmed state | Released immediately |
| Admin creates booking | `confirmed` directly | Held immediately |

- The hold period is a `hoa_settings` value, default **15 minutes**.
- The resident sees pending state and remaining time.
- A pending booking is not a valid gate reservation.
- Expiry/release is safe to rerun and does not release a booking that was confirmed concurrently.

### 5.3 Pricing and no-payment cases

| Case | Payment behavior | Booking audit state |
|---|---|---|
| Priced facility, resident/tenant/household booking | Payment attempt required | `pending_payment` until confirmed |
| Zero-priced facility | No provider call | Direct `confirmed`, with zero-price reason distinct from exemption |
| Admin booking | No provider call or hold | Direct `confirmed`, with `payment_exemption_reason = admin_booking` |

The separate `payment_exemption_reason` audit field is required so an admin exemption is never ambiguous with a zero-priced facility. It is not a substitute for facility pricing.

Resident cancellation and terminal-event cancellation remain non-refundable under F8. The resident cancellation confirmation must state this in English and Arabic before the destructive action.

## 6. Notification delivery boundary

Purpose handlers may request a notification event but must not send email or push inline before the business transaction commits. Notifications are delivered after commit through the X3 service and use the Phase 0 event matrix.

An SMTP or push failure:

- never rolls back payment confirmation, booking confirmation, or pass issuance;
- is recorded for retry;
- cannot create a second entitlement when retried.

## 7. Phase 1 exit criteria

Phase 1 may begin only after this contract and the 16-row event matrix are reviewed. Its payment-core acceptance gates are:

1. the null-provider fallback is absent from every acceptance path;
2. Moyasar is the sole live adapter and Tap is removed;
3. each attempt has a registered purpose and configured price source;
4. all three Stage 5 payable purposes issue only through a verified callback;
5. a duplicate or concurrent callback issues exactly once;
6. unconfigured provider, invalid callback, and failed payment all fail closed;
7. the dummy-purpose test demonstrates core extensibility without unauthorized issuance.