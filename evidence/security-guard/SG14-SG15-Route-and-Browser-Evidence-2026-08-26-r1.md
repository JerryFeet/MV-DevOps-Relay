# SG14/SG15 — Restored route and browser evidence

**Revision:** r1  
**Date:** 2026-08-26  
**Environment:** development/UAT only  
**Release decision:** evidence publication only; no deployment or production access

## Restored launch contract

The mistaken alternate portal prefix was removed. The confirmed paths are:

- resident/public homepage: `https://community-hub-portal.replit.app/hoa-portal/`
- Clerk sign-in: `https://community-hub-portal.replit.app/hoa-portal/sign-in`
- signed-in resident dashboard: `https://community-hub-portal.replit.app/hoa-portal/portal`

The HOA Portal artifact is registered at `/hoa-portal`. Wouter and Clerk
recognize only that public mount while Vite assets and `/api` remain rooted at
the host root.

There is no alternate homepage route or alternate preview-prefix designation
in the active portal routing/configuration surface.

## Signed-out browser verification

Fresh 390x844 browser context:

1. `/hoa-portal/` rendered the public Madain Village homepage.
2. The visible Resident Login action opened `/hoa-portal/sign-in`.
3. Clerk rendered the sign-in UI.
4. No application 404 occurred.

Replit browser evidence IDs:

- `qjto51` — signed-out public homepage
- `uygzs7` — Clerk sign-in at the confirmed path

## Signed-in guard browser verification

A real development Clerk guard session, not mocked authentication, verified:

- Security Gate at `/hoa-portal/portal/security-gate`;
- direct Vehicles and Announcements route refusal;
- explicit Not registered plate result;
- Arabic 390 px rendering without horizontal overflow.

Replit browser evidence IDs:

- `fkybvj` — active guard Security Gate
- `1mssm3` — direct route refusal
- `2hy7jt` — neutral plate result
- `a5hzzq` — Arabic responsive result

## Automated verification

| Check | Result |
| --- | --- |
| Portal full suite | 67 files passed; 1,359 tests passed |
| Final entry-contract rerun | 1 file passed; 2 tests passed |
| Portal TypeScript | Passed |
| Focused SG14/SG15 API run | 4 files passed; 163 tests passed |
| Source whitespace check | Passed |

## Moyasar webhook invariant

The payment callback remains unchanged:

`https://community-hub-portal.replit.app/api/payments/webhook`

The active API route remains `POST /payments/webhook` under the API service
prefix, and the operator runbook records the same full published URL. The
portal mount does not prefix API or webhook paths.

## Boundary

No production access, deployment, schema migration, live payment credential,
payment, or destructive release action was used.