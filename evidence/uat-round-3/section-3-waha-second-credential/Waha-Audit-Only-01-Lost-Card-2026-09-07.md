# Waha audit-only finding 1 — lost card

**Status:** code-audit candidate only; not runtime-confirmed; not remediated.

`report-lost` uses route-local applicant/application checks but does not
re-establish canonical current occupancy under the shared unit lock. This is
asymmetric with revoke/release, so a stale application relationship may be
mutable.

**Required proof before any remedy:** authenticated current-unit rotation,
concurrent loss reporting, credential/gate readback, and database state
comparison under the same fixture.
