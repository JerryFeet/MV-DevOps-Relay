# SG15 — Exact plate lookup evidence

**Revision:** r1  
**Date:** 2026-08-26  
**Environment:** development/UAT only  
**Release decision:** evidence publication only; no deployment or production access

## Requirement

A guard can enter a complete vehicle plate at the barrier and receive an exact,
minimum-data registration result. Partial or fuzzy lookup is prohibited.

## Source read-back

The active checked-out source was read back after implementation.

### Contract and authorization

- OpenAPI declares `GET /gate/plate-lookup`.
- The endpoint requires an authenticated `admin` or `guard`.
- The contract documents a minimum registered-vehicle response or a neutral
  not-registered state, plus `403` and `429` outcomes.
- The generated React client and schema types contain the same response shape.

### Exact normalization

Plate normalization:

- trims surrounding whitespace;
- converts Arabic-Indic and Persian digits to Latin digits;
- normalizes letter casing;
- removes equivalent spaces, underscores, hyphens, and dash variants.

The lookup compares the complete normalized input to the complete normalized
stored plate. A prefix such as `ABC12` does not match `ABC123`.

### Minimum projection

For registered active vehicles, the database query selects only:

- resident first and last name;
- unit number;
- vehicle make;
- vehicle model;
- vehicle colour;
- plate value needed for comparison.

The response contains only resident name, unit number, and make/model/colour.
It does not load or return contact details, national ID/Iqama, registration
documents, vehicle history, other vehicles, or internal identifiers.

### Neutral result and rate limits

- Missing or unmatched input returns `{ status: "not_registered" }`.
- The portal renders an explicit bilingual Not registered result.
- Durable limits apply independently to the guard account and normalized plate.
- The plate counter/audit subject is a domain-separated HMAC-SHA-256 digest.
  Raw plate text is not persisted in the rate-limit subject.

## Automated verification

The focused API run passed 4 files and 163 tests.

The plate-specific regression proves:

- Arabic-Indic digit and punctuation normalization;
- exact normalized matching;
- rejection of a partial plate;
- the minimum registered response;
- the explicit not-registered response;
- a 64-hex-character HMAC subject;
- equivalent formatted plates produce the same subject;
- raw plate text does not appear in the subject.

Portal TypeScript and the 67-file/1,359-test portal suite passed. The API and
portal workflows restarted cleanly.

## Real Clerk browser verification

Using a real development Clerk guard session at 390 px:

- Plate Lookup was available only inside Security Gate.
- Submitting complete plate `ZZZ-390-844` returned the explicit neutral
  `NOT REGISTERED` result.
- Switching to Arabic localized the Security Gate and plate result.
- The Arabic mobile view had no horizontal overflow.

Replit browser evidence IDs:

- `2hy7jt` — complete plate submitted with neutral Not registered result
- `a5hzzq` — Arabic 390 px result with no horizontal overflow

## Boundary

No production access, deployment, schema migration, live payment credential,
payment, or destructive release action was used.