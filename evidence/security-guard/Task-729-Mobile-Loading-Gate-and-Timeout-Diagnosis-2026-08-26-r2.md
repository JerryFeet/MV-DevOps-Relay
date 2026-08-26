# Task 729 — Mobile loading gate and timeout diagnosis

**Revision:** r2  
**Date:** 2026-08-26  
**Launch scope:** browser portal only; native mobile deferred

## Loading-gate fix

The shared Expo root no longer returns a blank render while fonts or Clerk are
resolving.

- Font loading renders a bilingual visible loading state.
- Clerk initialization renders a bilingual visible loading state.
- Both gates time out after 10 seconds.
- Timeout or font failure renders a bilingual error state with a retry action.
- Retry reloads the application, with a browser reload fallback.
- The app route tree does not mount until Clerk reports loaded.
- The existing guard refusal still occurs after authentication/profile
  resolution and before the resident route tree mounts.

## Verification

- Bootstrap and guard focused suite: 2 files, 9 tests passed.
- Mobile TypeScript: passed.
- Full suite with one worker: 18 files, 402 tests passed in 24.48 seconds.
- Exact seven files implicated by the earlier run: 7 files, 226 tests passed at
  the original 5-second timeout in 13.36 seconds.

## Timeout diagnosis

The earlier run used parallel fork workers and produced:

- 380 passing tests;
- five individual 5-second timeouts;
- one test-file worker that failed to start;
- 92.15 seconds of transform time and 104.22 seconds of import time.

The same affected files pass at the original timeout when isolated to one
worker, and the complete suite passes with one worker. The failures are
therefore classified as **environmental parallel-worker starvation**, not
reproducible application or assertion defects.

## Deferred native scope

Native mobile is not part of the browser-portal launch. Physical-device or
simulator sign-in and all further native mobile UAT are deferred until the
mobile app is prepared for release.

Native sign-in remains unresolved and must be verified before any resident
mobile release. An Expo web pass does not close that requirement.