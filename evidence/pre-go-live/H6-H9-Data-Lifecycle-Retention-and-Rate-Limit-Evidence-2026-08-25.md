# H6–H9 Data Lifecycle, Retention, and Durable Rate-Limit Evidence

**Date:** 2026-08-25  
**Environment:** development/UAT only  
**Production writes:** none  
**Payment credentials:** none introduced

## Scope proved

| Area | Delivered behavior |
|---|---|
| H6 | The obsolete `renovation_scope` enum is removed only after a PostgreSQL-catalog dependency check confirms there are no non-internal dependants. |
| H8 | Terminal resident release clears the resident photo key and writes a durable cleanup outbox job in the same transaction. Object deletion happens after commit; retryable storage errors never roll back the release. |
| H8 | Guest/gate history uses the configurable `guest_history_retention_days` setting (default 90). Waha Guest Day Passes and payment attempts are excluded from purge scope. |
| H9 | PostgreSQL fixed-window counters replace process-local rate-limit state. Public subjects are one-way hashed IP keys; authenticated subjects are user-scoped. |

## Migration and baseline proof

- Canonical bootstrap: `lib/db/migrations/0000_baseline.sql`
- Historical, baseline-incorporated migrations:
  - `0039_h6_drop_renovation_scope.sql`
  - `0040_h8_retention_and_photo_cleanup.sql`
  - `0041_h9_durable_rate_limits.sql`
- A disposable empty PostgreSQL database was created, loaded with **only** `0000_baseline.sql`, schema-dumped, semantically compared to development, and deleted.
- The comparison normalizes only PostgreSQL's per-dump `\restrict` token and bootstrap `public` schema presentation header. Those elements do not represent catalog objects.

**Result:** `PASS` — 43 public tables, 582 public columns, 113 constraints, and 142 indexes; normalized semantic catalog comparison passed.

## Runtime proof

After API-server restart:

- API server listened successfully on port 8080.
- Resident ID-photo deletion scheduler started at a 60-second interval.
- Guest-history purge scheduler started at a 24-hour interval.
- First guest-history purge used `retentionDays: 90` and reported zero expired records in the UAT database.
- The existing scheduler single-instance warning remained visible; distributed locking is required before running more than one API instance.

## Automated verification

| Check | Result |
|---|---|
| API server TypeScript check | PASS |
| H4 catalog/protection assertions | PASS |
| Production-schema verifier against development catalog | PASS — 43/582/113/142/3 |
| H6/H8/H9 focused unit tests | PASS — 4 files, 15 tests |
| H8 outbox behavior | PASS — successful deletion completes once; storage failure remains pending with a retry timestamp |
| H9 durable-counter behavior | PASS — exact boundaries, overflow/restart persistence, database-result use, hashed public IP key, and independent user subjects |
| Payment production guard | PASS — deterministic provider remains unavailable in production |

## Browser regression

- Final configured portal Playwright suite: **79 passed, 4 skipped** in 4.6 minutes.
- During verification, the resident Document Library regression check was corrected to match the secure authenticated **Download/View button** rather than an obsolete direct-object anchor; document cards expose `data-testid="doc-card"` for a stable list-state assertion.
- Focused authenticated rerun: **7 passed** — resident/admin/resident setup plus all four Document Library checks.

## Known separate test-policy follow-up

Task #719 updates legacy Dalil tests that still expect resident verification and booking data in AI prompts. Current Dalil is intentionally knowledge-only and excludes that operational data. This evidence does not weaken the privacy boundary to satisfy superseded test expectations.