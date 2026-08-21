# Stage 3d UAT Delivery Report
**Stage:** 3d — H4 P1 (Bookings & Vehicles Portal Pagination)
**Delivered:** 2026-08-21
**Status:** PASS — all test gates green

---

## Root Cause Fixed

Booking list status/date-mode/facility filters were applied client-side on the current page's 50 records. Records beyond page 50 were invisible when filters were active. The vehicles hook used a locally-managed page state duplicated across components.

---

## Deliverables

### 1. API — upcoming filter on GET /api/bookings
**File:** artifacts/api-server/src/routes/bookings.ts

Added upcoming=true query parameter: when present, appends gt(bookingsTable.startTime, new Date()) to the WHERE clause. Ensures "My Upcoming Bookings" filter is applied server-side so total reflects the true count across all pages.

### 2. usePaginatedApi shared hook
**File:** artifacts/hoa-portal/src/hooks/usePaginatedApi.ts (new)

Shared hook wrapping useQuery for {data, total} response shapes. Manages page state internally; resets to page 1 when baseQueryKey changes (filter change detection via JSON.stringify). Returns {items, total, totalPages, page, setPage, isLoading}.

### 3. Bookings — server-side filter wiring
**File:** artifacts/hoa-portal/src/pages/portal/facilities.tsx

MyBookings component: replaced local useQuery + client-side filtered variable with usePaginatedApi. Filter state (filter, dateMode, facilityFilter) now passed as API query params and included in baseQueryKey. Removed const now and const filtered entirely. Pagination controls now reflect server-reported total.

### 4. Vehicles — hook adoption
**File:** artifacts/hoa-portal/src/pages/portal/vehicles.tsx

Replaced local page, PAGE_LIMIT, useQuery for vehicles, and totalPages with usePaginatedApi. Pagination controls now driven by total from the API.

### 5. Pagination contract test suite
**File:** artifacts/api-server/src/__tests__/bookings-vehicles-pagination-contract.test.ts (new)

8-test contract suite. Seeds 55 bookings and 55 vehicles. Asserts:
- total === 55 on page 1 where data.length === 50
- Page 2 returns the remainder (5 items), total still 55
- status filter scopes total correctly
- upcoming=true filter returns only future bookings with correct total

---

## Test Results

| Suite | Result |
|---|---|
| API (vitest) | 1300 / 1300 passed (up from 1292; 8 new pagination contract tests) |
| Portal (vitest) | 1358 / 1358 passed |
| Mobile (vitest) | 405 / 405 passed |
| Portal type-check | clean |
| Portal translation guard | 1358 / 1358 passed (60 test files) |
| E2E (Playwright, 87 tests) | 81 passed / 6 skipped / 0 failed |

---

## Regression Notes

- No existing tests removed or modified to make new tests pass
- E2E skip count unchanged from prior stages (6 skipped — env-conditional checks)
- Vehicles hook adoption: no behavioural change, only internal state management moved to shared hook
- Mobile pagination screens remain TODO (deferred; noted in mobile test file comment)
