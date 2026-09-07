# Waha Fix 01 — day-pass occupancy boundary

**Date:** 2026-09-07  
**Original runtime verdict:** confirmed defect

## Failing-first proof

The permanent runtime test was changed to the required contract before source
edits. It failed because a paid, issued Unit A pass remained `APPROVED` after
its purchaser moved to Unit B.

## Fix

A day pass is now verifiable only while its purchaser:

- remains an active user;
- is still linked to the pass unit; and
- has an active linked resident occupancy in that unit.

The boundary is enforced consistently by:

- purchaser self-read filtering;
- public verification;
- dedicated guard day-pass verification;
- unified token scan;
- unified numeric scan.

Stale-occupancy guard results use
`PURCHASER_NO_LONGER_OCCUPIES_UNIT` and do not expose Unit A as an approved
destination. Valid same-unit passes remain verifiable.

## Validation

The focused runtime suite passed **26/26** and covers both dedicated and unified
guard paths, not only the purchaser self-read.

The full portal suite then exposed a stale positive-control fixture that had a
verified owner and paid day pass but no linked active resident occupancy. The
guard correctly denied it. After the fixture was brought into the canonical
owner-occupied graph, the focused real guard setup and five-decision browser
walkthrough passed **2/2**, including the valid paid day pass.

