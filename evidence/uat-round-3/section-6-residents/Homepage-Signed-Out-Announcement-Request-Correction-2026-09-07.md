# Signed-out homepage announcement request correction

**Date:** 2026-09-07

## What the homepage expected

The public launch page queried `/api/announcements?isPublic=true` and, when rows
were returned, displayed up to three cards under “Latest announcements.”

## Why that expectation was obsolete

H3 removed `is_public` and replaced it with two announcement visibility levels.
Both surviving levels require an authenticated portal session. There is no
signed-out announcement audience for the homepage to request.

## Resolution

The obsolete query and conditional public announcement section were removed.
No unauthenticated announcement endpoint was added, because doing so would
reintroduce an audience H3 deliberately removed.

## Verification

A clean signed-out browser load of the launch page records:

- zero `/api/announcements` requests;
- zero `/api/ai/chat` requests;
- zero `401` responses.

The permanent browser regression is
`artifacts/hoa-portal/e2e/homepage-signed-out.spec.ts`.
