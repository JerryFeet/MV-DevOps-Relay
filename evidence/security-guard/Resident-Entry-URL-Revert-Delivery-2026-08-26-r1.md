# Resident entry URL revert delivery

**Date:** 2026-08-26  
**Repository:** `JerryFeet/MV-DevOps-Relay`  
**Branch:** `main`

## Restored contract

- Public/resident entry:
  `https://community-hub-portal.replit.app/hoa-portal/`
- Clerk sign-in:
  `https://community-hub-portal.replit.app/hoa-portal/sign-in`
- Signed-in resident dashboard:
  `https://community-hub-portal.replit.app/hoa-portal/portal`
- Moyasar webhook, unchanged:
  `https://community-hub-portal.replit.app/api/payments/webhook`

The mistaken alternate prefix and route alias were removed. The artifact is
registered at `/hoa-portal`; Wouter and Clerk recognize that single browser
mount while API calls remain rooted at `/api`.

## Verification

- Entry-contract regression: 2/2 passed.
- Portal TypeScript passed.
- Fresh 390x844 browser:
  - public homepage rendered at `/hoa-portal/`;
  - Resident Login opened `/hoa-portal/sign-in`;
  - Clerk sign-in rendered;
  - no application 404 occurred.
- Real Clerk guard routes continued to pass under the restored prefix.

Replit browser evidence IDs: `qjto51`, `uygzs7`, `fkybvj`, `1mssm3`,
`2hy7jt`, `a5hzzq`.

No production access, deployment, schema migration, or live payment occurred.