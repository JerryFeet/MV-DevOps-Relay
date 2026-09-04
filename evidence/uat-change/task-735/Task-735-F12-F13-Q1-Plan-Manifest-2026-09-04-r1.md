# Task 735 Plan Publication Manifest

- Repository: JerryFeet/MV-DevOps-Relay
- Branch: main
- Evidence classification: implementation plan for F12, F13, D-6, D-7, Q-1, and decisions 142–145
- Implementation status: plan only; no application implementation authorized by this publication
- Plan path: evidence/uat-change/task-735/Task-735-F12-F13-Q1-Implementation-Plan-2026-09-04-r1.md
- Plan evidence-content commit: cc5e7de2393947d90ea51d22abef0f55fe89fc88
- Plan blob: 604283cf4f743904659fd927f1b6852e16f18dba
- Plan bytes: 8084
- Plan SHA-256: cf363e606ce4ff055182af43994724a1c2d15ea23cf7c778d16695c0eaf31353

## Planning conclusions

- F12 is not expressible as a partial unique index with a moving `end_time > now()` predicate. The plan requires a database trigger with transaction-scoped advisory locking plus the matching application check inside the existing booking-admission transaction.
- Parking entitlement reduction is accepted silently today: normalized lots may be deactivated, deleted, or reclassified without comparing registered vehicles. The plan requires rejecting any change that would leave registered non-inactive underground or surface vehicle usage above the resulting active entitlement.
