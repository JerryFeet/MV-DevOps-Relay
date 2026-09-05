# Occupancy foundation — lock-order evidence

**Date:** 2026-09-05  
**Scope:** source inspection of the current occupancy change set.
**Architect review:** **PASS**.
**Production:** not accessed or changed.
**Citation basis:** current source and `git diff` reviewed 2026-09-05.

## Canonical order

The canonical occupancy transaction order is:

1. occupancy advisory transaction lock `(OCCUPANCY_LOCK_NAMESPACE, unitId)`;
2. canonical `units` row `FOR UPDATE`;
3. subject, verification, or trigger/request row(s), in deterministic ID order;
4. active household resident rows, ordered by resident ID;
5. invitations and dependent graphs (Waha application/credential, vehicle,
   booking, pass, permit and related records), ordered by ID;
6. operation, event, notification, and audit rows.

`lockOccupancyUnit` is the shared first primitive and emits the advisory lock
then unit-row lock (`artifacts/api-server/src/lib/occupancyLock.ts:4-18`).
The release engine repeats the complete contract in its source comment
(`releaseSubject.ts:324-330`).

## Source-backed path matrix

| Path | Lock/order observed | Source |
| --- | --- | --- |
| Resident create/direct-or-fifth branch | advisory → unit → residents; then insert resident or request/event | `routes/residents.ts:377-403`; `occupancy.ts:14-38` |
| Self registration | advisory → unit → residents; invariant evaluated before insert | `routes/residents.ts` self-registration transaction; `occupancy.ts:41-45` |
| Verification approval | advisory → unit → verification/subject → residents → atomic approval write | `routes/units.ts`; `occupancy.ts:41-45` |
| Secondary removal | read subject identity → advisory → unit → residents → invitation/Waha/booking/vehicle → removal operation | `occupancy.ts:48-80` |
| Extra-resident decision | advisory → unit → request `FOR UPDATE` → residents → resident/request/event write | `routes/residents.ts:471-486` |
| Terminal release | advisory → unit → subject user → trigger → active residents → deterministic dependent reads → graph writes → release operation/audit | `releaseSubject.ts:160-184,274-547,594-814` |
| Scheduled move-out | canonical form discovery/grouping by `unitId`; each release delegates to terminal-release order | `moveOutScheduler.ts:20-120` |

The in-memory route-fixture compatibility branches in `occupancyLock.ts` and
`occupancy.ts` are explicitly non-production mock accommodations. A real
Drizzle transaction (`session` present) executes both canonical locks.