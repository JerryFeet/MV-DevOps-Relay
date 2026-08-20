# Madain Village HOA Portal — Stage 3 evidence manifest (r5)

**Evidence date:** 2026-08-20  
**Stage:** Stage 3  
**Revision:** r5  
**Classification:** Correction status delivery; **not** a Stage 3 acceptance or release package.  
**Release decision:** **DO NOT DEPLOY**

## r5 evidence inventory and SHA-256 hashes

| File | Exact GitHub blob | SHA-256 |
|---|---|---|
| `Stage-3-HOA-Mobile-Contract-Audit-2026-08-20-r5.md` | `acde0a0803c9d843e4094988ff7ee6e02686e372` | `05c521970cf4b4b2de26910b90edb9775cea41cfffe5c995ab00bdf465d675cd` |
| `Stage-3-UAT-Delivery-Status-Report-2026-08-20-r5.md` | `ed9d18994799a89953f24715e78db62b1396b576` | `2748972073910617d37e04510b2d3a27966f635e8a3aea5a84f422d5f33b9e99` |

Each r5 artefact was committed independently. The final evidence-content commit is:

`a6b0378a8485f347c9dc77ae75c6ee3f87f98b98`

This manifest must be published in a separate manifest-only commit after that evidence-content commit. The hashes above were calculated from the exact pushed GitHub blobs, not only from local files.

## Retained baseline evidence

The standard four-file r4 delivery bundle and its ZIP fallback remain available and unchanged. The r4 manifest and evidence-content commit (`5571b7e6167325145d8edf3c6cedb567e765784f`) remain the authoritative hash record for:

- `Stage-3-UAT-Delivery-Status-Report-2026-08-20-r4.md`
- `Stage-3-UAT-Migration-2026-08-20-r4.sql`
- `Stage-3-UAT-Schema-Only-2026-08-20-r4.sql`
- `HOA-Stage-3-Schema-Source-2026-08-20-r4.md`
- the r4 F5 rollback, mobile-contract, and development-database integrity companions.

r5 is a correction companion for mobile document access and guest-history pagination. It does not amend, force-push, rebase, replace, or delete prior evidence.

## Schema and data boundary

- r5 introduces no schema or database migration artefact.
- The retained r4 schema-only export was checked before r4 publication for no `INSERT` and no `COPY ... FROM stdin` sections.
- r5 contains no resident rows, document contents, phone numbers, identity data, private object-storage keys, credentials, secrets, production data, or production output.

## Verify from the repository root

```sh
cat <<'EOF' | sha256sum -c -
05c521970cf4b4b2de26910b90edb9775cea41cfffe5c995ab00bdf465d675cd  evidence/stage-3/Stage-3-HOA-Mobile-Contract-Audit-2026-08-20-r5.md
2748972073910617d37e04510b2d3a27966f635e8a3aea5a84f422d5f33b9e99  evidence/stage-3/Stage-3-UAT-Delivery-Status-Report-2026-08-20-r5.md
EOF
```