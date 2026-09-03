# Round 1 — Clean E2E Baseline

Date: 2026-09-03  
Environment: Development  
Production/Publish: Not performed

## Result

The complete portal Playwright suite reached:

- 99 passed
- 7 intentional skips
- 0 failures

Stale selectors in the administrator walkthrough and Portal Help flow were updated to match the running portal. This baseline was completed after the mandatory-field work and before the later D-2b and C-1 edits. Those later edits received focused tests and type checks; this report does not misstate the earlier full run as a post-D-2b/C-1 full regression.

The later workflow failure on 2026-09-03 was a pre-flight readiness failure (`/api/healthz` returned 502 while services were restarting), not a browser test failure. The API and portal workflows subsequently started successfully.

This is a development baseline, not production approval.