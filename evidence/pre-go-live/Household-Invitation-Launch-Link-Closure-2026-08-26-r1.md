# Household invitation launch-link closure

**Revision:** r1  
**Date:** 2026-08-26  
**Launch product:** browser portal  
**Production deployment:** not performed

## Closed blocker

Household invitation links now use the canonical mounted browser-portal URL:

`https://community-hub-portal.replit.app/hoa-portal/sign-up?token=<invitation-token>`

The invitation route no longer derives a public link from the incoming request
host. `PORTAL_BASE_URL` is required, and validation occurs before an existing
invitation can be revoked or a replacement invitation can be inserted.

The mounted `/hoa-portal` base and route-joining behavior are shared by the
portal and API server, preventing frontend and backend path construction from
drifting independently.

## Source revisions

- `e5594a5656d779d7c4f67d7432bb08b5de8ff51b` — shared portal-path package,
  canonical invitation link, fail-closed configuration validation, and focused
  regression coverage.
- `a0d3849e1d81c08ee89264212a2c281cba07dd2c` — narrowed the facility E2E
  locator to actual facility cards so the clean full run is not contaminated by
  a shared-layout strict-mode collision.

## Focused verification

- Invitation API suite: **54 passed**.
- Exact generated invitation URL and Clerk redirect URL: passed.
- Missing `PORTAL_BASE_URL`: rejected before invitation writes.
- Portal translation/unit suite: **1,359 passed**.
- API typecheck and build: passed.
- Portal typecheck and build: passed.
- Mounted `/hoa-portal/sign-up` route: visibly served after workflow restart.

## Clean full E2E verification

The configured `e2e` workflow completed from fresh Clerk sessions with one
worker:

- **91 passed**
- **7 documented skips**
- **0 failed**
- **0 retries**
- **Duration:** 5.6 minutes

The final workflow log contained no `retry #`, `flaky`, or `failed` markers.

An earlier post-fix run completed with one retry because a broad facility-card
test locator matched both the shared sidebar verification banner and the valid
Facilities empty state. That run is excluded from clean evidence. The locator
was narrowed to facility buttons containing an `h3`, and the complete suite was
rerun successfully as reported above.

## Change-control assurances

- No production deployment was attempted.
- No production database operation was attempted.
- No development schema mutation was performed.
- No Drizzle push or migration command was run.
- The approved development schema freeze remains intact.
