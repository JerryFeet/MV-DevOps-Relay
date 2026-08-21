# Madain Village HOA — Stage 3d r2 evidence manifest

**Evidence date:** 2026-08-21  
**Stage:** Stage 3d r2  
**Classification:** Individual-file UAT evidence delivery; not a deployment approval.

## SHA-256 hashes

| File | SHA-256 |
|---|---|
| `Stage-3d-UAT-Delivery-Report-2026-08-21-r2.md` | `8ea3bf47f5b6b4033f4cef381e2904867797aae01c839520843e47cece673bcc` |

The report contains the detached SHA-256 table for every changed implementation and test artefact. This manifest records the report hash because a document cannot embed its own final SHA-256 without changing that value.

## Evidence-content commit

The report is published first as an immutable individual GitHub file. Its GitHub commit ID is recorded here after publication. This manifest is then published as a second individual file and does not alter the report hash.

**Evidence-content commit:** `cd4df4e692d39b83a11071fa6d42b019eb5e3215`

## Verification

Run from the repository root:

```sh
EXPECTED='8ea3bf47f5b6b4033f4cef381e2904867797aae01c839520843e47cece673bcc'
printf '%s  %s\n' "$EXPECTED" evidence/stage-3d/Stage-3d-UAT-Delivery-Report-2026-08-21-r2.md | sha256sum -c -
```

The evidence report and this manifest are additionally published as individual files in the user-authorized public GitHub repository. No ZIP bundle is created.