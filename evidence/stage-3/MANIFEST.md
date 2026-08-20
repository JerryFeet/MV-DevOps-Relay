# Madain Village HOA Portal — Stage 3 evidence manifest (r6)

**Evidence date:** 2026-08-20  
**Stage:** Stage 3  
**Revision:** r6  
**Classification:** Correction status delivery; **not** a Stage 3 acceptance or release package.  
**Release decision:** **DO NOT DEPLOY**

## r6 evidence inventory and SHA-256 hashes

| File | Exact GitHub blob | SHA-256 |
|---|---|---|
| `Stage-3-HOA-Mobile-Contract-Audit-2026-08-20-r6.md` | `15f5f8648710d722de226e4c7222e51eb59a8e64` | `c3da6d1a903e59a3fbf5efde03b3435ca453c5d55ae3c303cef293199a144e71` |
| `Stage-3-UAT-Delivery-Status-Report-2026-08-20-r6.md` | `735ae227291c94cd31829a726d79058945bdc204` | `31e6899a841327ed8528b1dc1d58db5bf30a58163562ee830c6d2be9f64431c6` |

Each r6 artefact was committed independently. The final r6 evidence-content commit is:

`9ca3e8e1db54e08b95279e35ea41b97c8d01a502`

This manifest is published separately after that evidence-content commit. The listed SHA-256 values were calculated from the exact pushed GitHub blobs.

## Historical retention

- r4 remains the standard four-file Stage 3 delivery bundle and ZIP fallback.
- r5 remains an immutable correction record.
- r6 corrects the r5 web popup-policy gap by opening the web target synchronously before token/fetch work.
- No prior evidence artefact was amended, force-pushed, rebased, deleted, or replaced.

## Schema and data boundary

- r6 introduces no schema or database migration artefact.
- No r6 artefact includes resident rows, document contents, phone numbers, identity data, private object-storage keys, credentials, secrets, production data, or production output.
- r6 remains a status-only package and does not authorize acceptance or deployment.

## Verify from the repository root

```sh
cat <<'EOF' | sha256sum -c -
c3da6d1a903e59a3fbf5efde03b3435ca453c5d55ae3c303cef293199a144e71  evidence/stage-3/Stage-3-HOA-Mobile-Contract-Audit-2026-08-20-r6.md
31e6899a841327ed8528b1dc1d58db5bf30a58163562ee830c6d2be9f64431c6  evidence/stage-3/Stage-3-UAT-Delivery-Status-Report-2026-08-20-r6.md
EOF
```