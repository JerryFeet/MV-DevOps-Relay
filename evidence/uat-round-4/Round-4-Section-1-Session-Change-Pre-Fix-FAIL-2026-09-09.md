# Round 4 Section 1 — Session Change Regression, Pre-Fix FAIL

**Date:** 2026-09-09  
**Environment:** Development  
**Result:** FAIL

## Exact journey

1. Signed in as the existing admin in tab 1 and opened the populated Admin Dashboard.
2. Left tab 1 open without refresh or navigation.
3. In tab 2 in the same browser context, signed out and selected the existing owner identity.
4. Opened the owner portal and confirmed the owner dashboard.
5. Waited eight seconds.
6. Re-examined tab 1 without refreshing it.

## Final assertion

Expected: tab 1 must stop showing admin content or leave the admin route after the active identity changes.

Actual: tab 1 remained on /portal/admin; the Admin Dashboard heading remained visible and the body retained admin navigation and dashboard content.

## What this test does not cover

- Production Clerk behavior.
- Separate browser profiles or contexts.
- Tenant switching in this focused failure capture.
- API read authorization, already captured separately.
- Admin mutation authorization, covered by the companion owner-approval test.
- Other routes or OAuth/social sign-in.

## Screenshots

- 5zfif7 — stale populated Admin Dashboard still visible after the owner switch and eight-second wait.
- w4yy7p — tab 2 showing the owner dashboard, proving the second identity was active.
