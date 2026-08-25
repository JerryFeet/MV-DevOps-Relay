# SG14 / SG15 — Guard Scope and Exact Plate Lookup Plan

**Status:** Plan for approval only. No SG14 or SG15 implementation is included in this delivery.

## Confirmed policy

The gate dashboard is the only guard surface.

- A guard must not access a resident, owner, or admin module by navigation or direct URL.
- A guard may receive only the minimum data needed at the barrier from a purpose-built gate endpoint.
- `GATE_ROLES` is valid for those gate endpoints. `STAFF_ROLES = ["admin", "guard"]` is not a valid shortcut for a general module.
- For SG15, no match will be an explicit bilingual **Not registered** result, not a blank screen, empty ambiguous state, or a 404. This gives the guard a clear decision while disclosing no extra information.

## SG14 audit — every API `STAFF_ROLES` use

The current constant is defined in `artifacts/api-server/src/lib/roles.ts` as `["admin", "guard"]`. Every production use below inherits broad guard access and is a defect under the confirmed rule.

| Module | Current inherited guard capability | Required correction |
| --- | --- | --- |
| Announcements | Reads all announcements before the owner-visibility check, including verified-owner-only content. | Restrict the staff bypass to admin; guards receive no announcement access. |
| Bookings | Lists all bookings; reads arbitrary booking detail; bypasses ownership in PATCH; can cancel another resident’s booking. | Remove guard from every broad booking read/mutation path. Preserve only admin and the resident’s own permitted scope. |
| Vehicles | Lists all vehicles with resident identity data; reads arbitrary vehicle detail; bypasses verified-resident/unit checks while creating a vehicle. | Remove guard access from all vehicle module routes. SG15 becomes the single gate-safe vehicle read path. |
| Residents | Lists all residents, reads arbitrary resident detail, and bypasses ownership/unit checks while patching. | Remove guard access from all resident module routes. Keep the purpose-built resident gate lookup only. |
| Guests | Lists all guests and pass/host data, reads arbitrary guest detail, and bypasses ownership checks while patching. | Remove guard access from all guest module routes. Keep gate-specific guest-pass flows under `GATE_ROLES`. |

The audit also found tests that currently encode the wrong rule:

- `artifacts/api-server/src/__tests__/roles.test.ts` expects guard read-all access to guests, residents, and bookings.
- `artifacts/api-server/src/__tests__/roles-vehicles-announcements.test.ts` expects every `STAFF_ROLES` member to see all vehicles and non-public announcements.

These tests must be replaced with explicit admin-allowed / guard-forbidden assertions. The `STAFF_ROLES` constant should be retired from API authorization decisions after the audit remediation; `GATE_ROLES` remains the sole shared admin-and-guard policy group.

## SG14 implementation plan

### 1. Make module APIs guard-denying by construction

1. Replace each audited general-module `STAFF_ROLES` predicate with an explicit admin predicate where broader staff access was intended.
2. Preserve resident self-scope and existing admin behavior; return a clear `403` before querying or mutating unrelated resident data when the caller is a guard.
3. Cover announcements, bookings, vehicles, residents, and guests together so the same role error cannot migrate to a neighboring module.
4. Review nearby broad predicates during the change, including the existing move-in and renovation gate endpoints that currently use a broad staff helper. Those endpoints must use `GATE_ROLES` explicitly, matching the move-out endpoint and the gate UI.
5. Keep existing purpose-built gate routes—Waha verification, guest-pass checks, resident gate search, and permit status checks—under `GATE_ROLES` with their already-minimal projections.

### 2. Enforce the rule at the portal router and navigation layer

1. Add one central guard policy to `ROUTE_CONFIGS`: every non-gate `/portal/*` module route must deny a guard even on a direct URL.
2. Treat `/portal` as a gate-entry exception: a guard opening it must be redirected to `/portal/security-gate` without rendering the resident dashboard.
3. Denied module URLs should redirect a guard to `/portal/security-gate`; an owner/tenant denial must retain the existing safe fallback behavior.
4. Cover the legacy `/portal/move-forms` redirect so it cannot become a path around the permit restriction.
5. Render only the Security Gate link, language switch, account controls, and sign-out for a guard. No resident-module sidebar link or dashboard shortcut may remain visible.
6. Preserve administrator module access intentionally; this is guard isolation, not a change to admin capabilities.

### 3. Prove the full boundary

1. Add API tests for each audited route proving admin behavior remains allowed and guard behavior is forbidden.
2. Replace the existing broad-guard positive tests with regression tests that fail if `STAFF_ROLES` is used again in a general module.
3. Add a portal route-matrix test that direct-loads every registered non-gate `/portal/*` route as a real guard session and proves the gate redirect/no protected content frame.
4. Add navigation assertions that the guard sidebar contains Security Gate but none of the resident modules.
5. Retain existing gate endpoint tests proving admin and guard remain allowed, and owner/tenant remain denied.

## SG15 — exact registered-plate lookup

### Scope and data boundary

The lookup is a sixth gate purpose alongside the existing guest, resident, move-in, move-out, and renovation gate checks. It is not a vehicle-module search.

On an exact registered active-vehicle match, return only:

- unit number;
- registered resident display name;
- vehicle make;
- vehicle model;
- vehicle colour.

Never return an owner contact detail, National ID/Iqama, email, internal database identifier, vehicle history, other vehicles, raw credential, or payment data.

### 1. Define a canonical plate value

1. Add one shared plate normalizer used on vehicle writes and the gate lookup.
2. Canonicalize Arabic-Indic digits to ASCII digits, remove spaces and hyphens, and normalize letter case where relevant.
3. Do not use contains, prefix, fuzzy, or name-search matching. The normalized submitted value must equal the normalized registered plate value.
4. Add an indexed normalized registered-vehicle plate field through a forward migration or equivalent schema-safe strategy. Do not add a uniqueness constraint without a preflight duplicate report and explicit approval; pre-existing duplicate registration data must not be silently altered.
5. Limit matches to the registered vehicle states approved for gate use. The implementation review will document the chosen active/approved state predicate before code is accepted.

### 2. Add a purpose-built gate endpoint

1. Add an authenticated gate route such as `GET /api/gate/plate-lookup?plate=...`, authorized only for `GATE_ROLES` (`admin` and `guard`).
2. Require a non-empty complete submitted plate and normalize it server-side before lookup.
3. Use a dedicated allowlist projection rather than returning a vehicle row or reusing the resident/vehicle module responses.
4. Return a stable 200 result union:
   - `registered` with the five allowed display fields; or
   - `not_registered` with no vehicle, resident, or unit details.
5. Return bilingual validation, authorization, rate-limit, registered, and not-registered copy. The UI must not infer the not-registered state from an empty array.

### 3. Apply the SG6-style privacy rate limit

1. Use the durable fixed-window limiter already used by the National-ID gate lookup: 5 requests per minute and 100 per day per authenticated gate account, plus the same limits for a normalized plate-value subject.
2. Derive the value subject with a domain-separated HMAC, for example `gate-plate-rate-limit:v1`; never store or log the raw lookup plate as a limiter key.
3. Use separate account and value namespaces from the National-ID lookup so the two gate purposes cannot consume or bypass one another’s quotas.
4. Return the existing bilingual rate-limit response pattern without disclosing whether a rate-limited plate is registered.

### 4. Add the sixth gate-dashboard purpose

1. Add a Plate Lookup purpose to the existing `SecurityGate` modes/purpose selection without adding a resident-module route.
2. Provide one complete-plate input and an explicit submit action; do not search while typing or offer partial suggestions.
3. Render one bilingual result card for Registered and one for Not registered. The registered card must render only the allowlisted fields.
4. Keep the control available only in the gate dashboard for admin and guard; the server remains the enforcement boundary.
5. Preserve the existing guest, resident, and permit gate flows unchanged except for replacing any broad staff predicate with `GATE_ROLES`.

### 5. Contract and regression coverage

1. Extend the API contract/OpenAPI source and regenerate client types if the endpoint is represented there.
2. Unit-test the normalizer with whitespace, hyphens, Arabic-Indic numerals, casing, and non-equivalent plates.
3. Endpoint-test exact match, no match, malformed/missing input, admin/guard allow, owner/tenant deny, active-status behavior, minimal projection, and both rate-limit dimensions.
4. Assert responses never contain prohibited identity/contact/internal fields.
5. Add real-session admin and guard gate walkthroughs for registered and not-registered states, plus Arabic rendering. Do not fabricate a physical gate scan; that remains a manual operational check.

## Delivery and safety gates

1. Implement only after this plan is approved.
2. Read back every changed source and test after implementation, then run type checks, focused API tests, and real authenticated browser walkthroughs.
3. Publish each evidence file individually to the GitHub relay; do not create a ZIP bundle.
4. Do not access production, deploy, migrate production, use live payment credentials, or execute destructive release actions.

## Manual follow-up after implementation

- Verify a real plate at the physical barrier on a gate device in both languages.
- Confirm staff operational instructions treat **Not registered** as an explicit escalation/entry-policy outcome, not a system fault.
- Review any duplicate normalized vehicle plates surfaced by the preflight report before enabling an index or data-integrity constraint.