# Task 1 H1–H3 relay evidence manifest (revision 1)

**Repository:** `JerryFeet/MV-DevOps-Relay`  
**Branch:** `main`  
**Scope:** development-only Task 1 evidence; no production access, deployment, or live payment credentials.

## Individually published artefacts

| Path | SHA-256 from GitHub blob | Relay commit | Relay blob |
| --- | --- | --- | --- |
| `evidence/pre-go-live/Task-1-H1-H3-Implementation-Evidence-2026-08-25-r1.md` | `cddf8a0170421d39aec516fa7a52737f9e31b13a67b45ca6f0a4d0c53b365943` | `bf0a89783c57876771310d6f33bc9845a7bd6bcd` | `44d7516560c0844b1d6442a25777ed2c40f43a3b` |
| `evidence/go-live/Consolidated-UAT-Checklist-2026-08-24-r1.md` | `225f1b9c27852ea514ed4c20e1df8ff148425dc0c41cf07651f16f6f795071e5` | `d8b154eb66f809a59eedcb9d94491f8726accecf` | `f91ee18691d377c3ba4243fbb412cde6365ab678` |

## Publication assertion

Each listed artefact was re-read through the GitHub API. `assertRelayPublication` passed only after the exact 40-character relay commit and blob IDs resolved in `JerryFeet/MV-DevOps-Relay` and each path was confirmed inside `evidence/`.

## Important boundaries

- H1 has one application settlement route: `POST /api/payments/webhook`. The browser return page is read-only; the retired browser verification endpoint is removed.
- Before production promotion, Moyasar dashboard webhook configuration must target the signed endpoint. This could not be validated without live provider credentials and remains a production-promotion prerequisite.
- The Dalil daily in-memory limiter is interim only; process restarts reset it. H9 must supply durable enforcement.
- The revised manual checklist contains explicit protected Dalil visual checks for portal/mobile and English/Arabic/RTL.
