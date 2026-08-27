# PH1 Portal Help — Admin Live UAT Evidence

Date: 2026-08-28  
Environment: Replit development only  
Production/deployment changes: none

## Scope

This record covers the remaining PH1 admin live-verification item:

1. The administrator dashboard exposes Portal Help as the eighth queue in **Needs your attention**.
2. The queue displays its pending count and oldest-waiting indicator.
3. The queue opens the dedicated Portal Help inbox.
4. A pending ticket opens its management dialog.
5. The dialog exposes the ordinary reply, standard redirect, send-reply, and close-ticket controls.

## Method

The focused walkthrough ran in the repository's existing Playwright `admin` project.
That project uses the established Clerk email-code test setup and saves the authenticated
admin session before running the browser assertion.

The walkthrough inserted one development-only pending Portal Help ticket directly into
the development database. This avoided sending a real notification or relying on
pre-existing resident data. The fixture was deleted in `afterAll`, including after a
failed or retried browser assertion.

No authentication behavior was weakened. No reusable password was created. No
production database, deployment, or production identity was accessed.

## Command and result

```text
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$(which chromium) \
pnpm exec playwright test --config playwright.config.ts \
  --project=admin --grep 'PH1'

Running 2 tests using 1 worker
✓ authenticate as admin
✓ PH1 — admin sees the eighth Portal Help queue and can manage a ticket

2 passed (20.6s)
```

## Assertions

### Dashboard

- `Admin Dashboard` rendered for the authenticated administrator.
- `Portal Help` rendered inside `Needs your attention`.
- The `oldest:` indicator rendered for the seeded pending ticket.
- The accessible `Manage portal help` link was visible.
- Activating the link navigated to `/portal/admin/portal-help`.

### Inbox and controls

- `Portal Help Tickets` rendered.
- The development-only ticket details rendered.
- The exact ticket `Manage` action opened the management dialog.
- `Reply` was visible.
- `Redirect` was visible.
- `Send Reply` was visible.
- `Close Ticket` was visible.

No reply, redirect, closure, upload, or screenshot signed-URL action was executed.

## Screenshots

| File | SHA-256 |
|---|---|
| `evidence/uat-change/ph1-live/PH1-Admin-Eighth-Queue-2026-08-28.png` | `88edbebc694c437ab0e026bb2da34e84e1d751f08299441cd2f9acd1ab29c9e9` |
| `evidence/uat-change/ph1-live/PH1-Admin-Inbox-Controls-2026-08-28.png` | `80539755a781365f8da2f7eefe1660e2e6b1b96f187b2e19036556eca8f723a0` |

## Verdict

**PASS — PH1 admin eighth queue and inbox controls are live-verified.**

The remaining PH1 live-verification scope is limited to:

- Authenticated Expo Portal Help in English and Arabic.
- Mobile Dalil tab placement during that authenticated real-device run.

Those two mobile checks are intentionally assigned to the product owner's manual
real-device UAT. They were not live-verified by this browser harness, and no weaker
authentication path was introduced to manufacture that evidence.