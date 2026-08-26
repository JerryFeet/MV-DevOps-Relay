# Task 729 — Mobile guard-access restriction delivery

**Date:** 2026-08-26  
**Repository:** `JerryFeet/MV-DevOps-Relay`  
**Branch:** `main`

## Delivered behavior

- The signed-in mobile home layout resolves the application profile before
  mounting the resident route tree.
- Resident mobile roles are explicitly `admin`, `owner`, and `tenant`.
- A guard receives a bilingual refusal directing them to the browser Security
  Gate dashboard, with a sign-out action.
- Unsupported roles receive a separate access-unavailable state.
- Announcements, Vehicles, and every other resident tab are registered through
  one shared resident-route registry in both native and classic tab layouts.
- Direct mobile routes and deep links cannot bypass the parent role boundary.
- No native Security Gate surface was added.

## Verification

- Focused role-boundary regression: 6/6 passed.
- Prior accepted mobile suite: 17 files, 399 tests passed.
- Prior mobile TypeScript check passed.
- Current broad rerun on 2026-08-26 was **not classified as passed**:
  380 tests passed, five tests timed out across six failed files, and one worker
  startup timed out. These were runner/test timeout failures outside the focused
  guard-boundary test.

## Blank entry classification

The blank previously observed was in the Expo web test build. A fresh direct
Expo web capture on 2026-08-26 now renders the signed-out mobile sign-in screen.

It is **not proven to be web-only**:

- `app/_layout.tsx` is shared by Expo web, iOS, and Android.
- All platforms pass through the same font gate and
  `ClerkProvider` → `ClerkLoaded` root gate.
- That gate has no visible loading fallback.
- There is no recorded evidence that a real resident has signed into the mobile
  app on a physical iOS or Android device.

Therefore native sign-in remains unverified and is a **go-live blocker**, not an
environment-only Section D limitation. A physical-device real-user sign-in must
show the sign-in screen and complete authentication before this blocker can be
closed.

## Companion evidence

- `evidence/security-guard/task-729-mobile-entry-2026-08-26.jpg`
  — direct Expo web signed-out screen at 390x844.

No production access, deployment, schema migration, or live payment occurred.