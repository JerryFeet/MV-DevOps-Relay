# Stage 3d Evidence Manifest

| File | Description |
|---|---|
| Stage-3d-UAT-Delivery-Report-2026-08-21.md | Full status report: root cause, deliverables, test results |
| MANIFEST.md | This file |

## Stage summary

Stage 3d — H4 P1: Bookings and Vehicles Portal Pagination

Root cause: booking filters (status, date-mode, facility) were applied client-side on the 50-record page window. Records beyond page 50 were invisible when filters were active.

Fix: usePaginatedApi hook centralises pagination + filter-as-query-param wiring. GET /api/bookings gains upcoming=true server-side filter. Both MyBookings and Vehicles components adopt the hook. 8-test pagination contract suite added.

All test gates green: API 1300/1300 · Portal 1358/1358 · Mobile 405/405 · E2E 81 passed / 6 skipped / 0 failed.
