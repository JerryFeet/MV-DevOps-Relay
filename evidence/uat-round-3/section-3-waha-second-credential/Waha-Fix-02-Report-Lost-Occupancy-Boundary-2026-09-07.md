# Waha Fix 02 — report-lost occupancy boundary

**Date:** 2026-09-07  
**Original runtime verdict:** confirmed defect

## Failing-first proof

The permanent runtime assertion was changed before production edits. It failed
because an applicant who had moved from Unit A to Unit B still received `200`
when reporting the historical Unit A credential lost.

## Fix

`report-lost` now applies the same active occupancy/unit/track boundary used by
application and second-credential assignment.

A moved applicant receives `403`. The denied request:

- does not change credential status;
- does not create a replacement request;
- does not create a lost-card event; and
- does not mutate the historical Unit A application.

## Validation

The focused runtime suite passed **26/26**, including explicit no-mutation
assertions.
