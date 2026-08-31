# Task 734 — AD6 Admin Dashboard Implementation Evidence (r1)

Date: 2026-08-31
Classification: Implementation complete; development/UAT evidence only
Workspace context commit: 3f69d4f45bef84e8fc8766437b0511d5971802aa (not a relay evidence object)
Workspace commit date: 2026-08-31T09:08:45Z
Workspace commit subject: Restructure admin dashboard for action-first operations

## Delivered behavior

- Moved the admin attention panel to the first dashboard position so it answers what requires action before health reporting.
- Added a summary sentence with total attention items and oldest waiting age, plus an explicit nothing-waiting state.
- Kept all eight queues visible, sorted non-empty queues before empty queues, and sorted non-empty queues by oldest item first.
- Classified queue urgency from the oldest item age, never queue count, with Normal, Attention, and Overdue text/icon alongside colour.
- Applied default thresholds of 2 days and 7 days, with a one-day minimum and overdue clamped so it cannot precede attention.
- Stored threshold overrides in the existing hoa_settings key/value model; no schema migration was introduced.
- Collapsed empty record sections by default and linked attention queues to their corresponding action surfaces.
- Replaced duplicating pending-count tiles with eight community-health metrics at the bottom of the dashboard.
- Replaced the misleading resident/account adjacency with Residents with portal access, counted from active resident records whose portal-access flag is enabled.
- Used a rolling 30-day tenancy-expiry window and calendar-month windows for bookings and Portal Help tickets, with visible period descriptions.
- Added complete English and Arabic strings and responsive single-column queue layout at 390px.

## Eight health metrics

1. Units registered (excluding the internal system unit).
2. Verified owners (active owner accounts with verified-owner status).
3. Active tenancies.
4. Residents with portal access (active resident records with portal access).
5. Active tenancies expiring in the rolling next 30 days.
6. Active Waha Pass credentials issued.
7. Non-cancelled bookings scheduled in the current calendar month.
8. Portal Help tickets opened in the current calendar month.

## Explicit boundaries

- No approval authority, queue eligibility, authentication, authorization, or mobile surface was changed.
- No deployment or production database action was performed.
- No db:push, push --force, drizzle-kit migrate, or other schema mutation command was run.
- Legacy summary response fields remain available for compatibility, but the AD6 dashboard no longer displays the duplicating pending tiles.
