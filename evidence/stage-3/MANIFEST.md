# Madain Village HOA Portal — Stage 3 evidence manifest (r4)

**Evidence date:** 2026-08-20  
**Stage:** Stage 3  
**Revision:** r4  
**Classification:** Status delivery; **not** a Stage 3 acceptance or release package.  
**Release decision:** **DO NOT DEPLOY**

## Evidence inventory and SHA-256 hashes

| File | SHA-256 |
|---|---|
| `Stage-3-UAT-Delivery-Status-Report-2026-08-20-r4.md` | `08e755ea504d938788679de78e49a57ebd3925710719624c3310d04d4c21c68a` |
| `Stage-3-UAT-Migration-2026-08-20-r4.sql` | `160d09dd4b0c58dafd49bda239ee4de97caa2ac01def3e460b8e2d96fdea42cb` |
| `Stage-3-UAT-Schema-Only-2026-08-20-r4.sql` | `bfc118a560497097185980ea3f3b857d1ae7d525f7f6014ef7d0e9c5da5d41ec` |
| `HOA-Stage-3-Schema-Source-2026-08-20-r4.md` | `aa7d2e32e2d18aa8f49b718014d1d7140658f21dc1a69da1df5ffba3777b4647` |
| `Stage-3-F5-Rollback-Fixture-Evidence-2026-08-20-r4.txt` | `e273f4cc67d6773da1a5612804887a0ec16771dcba0e5874cd3d91581495c00f` |
| `Stage-3-HOA-Mobile-Contract-Audit-2026-08-20-r4.md` | `62010c9a2a73db8ffbfa5cc050fb19b5278b09b069ace3d900a08cb1efc8dd26` |
| `Stage-3-UAT-Database-Integrity-Evidence-2026-08-20-r4.txt` | `85619c14f175873d06a64e8c1b1ca098a08fc127b4dc326b15b2b4bdb206c4e2` |
| Local ZIP fallback: `Madain-Village-HOA-Portal-Stage-3-Delivery-Status-2026-08-20-r4.zip` | `9cdda2506f597d0b902892f25b606e7a9ec2602536988d8e6d896d8081b2935f` |

The standard delivery bundle is the first four rows. The remaining three publishable companions are included because the report cites them as the basis for F5, mobile-contract, and UAT-database-integrity matrix statements. The ZIP fallback contains the standard four files; its local checksum schedule is retained beside the ZIP.

## Evidence-content commit

Each r4 artefact was committed independently before this manifest update. The final evidence-content commit is:

`5571b7e6167325145d8edf3c6cedb567e765784f`

This manifest is published separately after that commit, so the recorded content commit does not alter the hashes it certifies.

## Schema and data boundary

- The r4 schema export was generated with `pg_dump --schema-only --no-owner --no-privileges`.
- Before publication, it was checked to contain no `INSERT` and no `COPY ... FROM stdin` section.
- This directory contains no resident rows, document contents, phone numbers, identity data, private object-storage keys, credentials, secrets, production data, or production output.

## Historical retention

The prior non-suffixed Stage 3 evidence files and their original blobs remain untouched in `evidence/stage-3/`. This update changes only the detached current manifest and adds r4-suffixed files; it does not amend, force-push, rebase, or rewrite history.

## Verify from the repository root

```sh
cat <<'EOF' | sha256sum -c -
08e755ea504d938788679de78e49a57ebd3925710719624c3310d04d4c21c68a  evidence/stage-3/Stage-3-UAT-Delivery-Status-Report-2026-08-20-r4.md
160d09dd4b0c58dafd49bda239ee4de97caa2ac01def3e460b8e2d96fdea42cb  evidence/stage-3/Stage-3-UAT-Migration-2026-08-20-r4.sql
bfc118a560497097185980ea3f3b857d1ae7d525f7f6014ef7d0e9c5da5d41ec  evidence/stage-3/Stage-3-UAT-Schema-Only-2026-08-20-r4.sql
aa7d2e32e2d18aa8f49b718014d1d7140658f21dc1a69da1df5ffba3777b4647  evidence/stage-3/HOA-Stage-3-Schema-Source-2026-08-20-r4.md
e273f4cc67d6773da1a5612804887a0ec16771dcba0e5874cd3d91581495c00f  evidence/stage-3/Stage-3-F5-Rollback-Fixture-Evidence-2026-08-20-r4.txt
62010c9a2a73db8ffbfa5cc050fb19b5278b09b069ace3d900a08cb1efc8dd26  evidence/stage-3/Stage-3-HOA-Mobile-Contract-Audit-2026-08-20-r4.md
85619c14f175873d06a64e8c1b1ca098a08fc127b4dc326b15b2b4bdb206c4e2  evidence/stage-3/Stage-3-UAT-Database-Integrity-Evidence-2026-08-20-r4.txt
EOF
```