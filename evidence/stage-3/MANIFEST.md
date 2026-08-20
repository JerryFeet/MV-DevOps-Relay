# Madain Village HOA Portal — Stage 3 evidence manifest

**Evidence date:** 2026-08-20  
**Stage:** Stage 3  
**Classification:** One-off individual-file **status** delivery test; not an acceptance or release package.  
**Data boundary:** The schema export is schema-only. This directory contains no resident records, identity documents, phone numbers, object-storage keys, credentials, secrets, production data, or production output.

## SHA-256 hashes

| File | SHA-256 |
|---|---|
| `Stage-3-UAT-Delivery-Report-2026-08-20.md` | `9d587100d962f0bb92217d401f2eb99ba2f6006cca01adcec83ccb3eb5045c2b` |
| `Stage-3-UAT-Migration-2026-08-20.sql` | `dbfc59caf2f8ad17f05fe34a3a9da88d9474da0e3ce073220d8d928049210d0a` |
| `Stage-3-UAT-Schema-Only-2026-08-20.sql` | `29bb42081c2a856f18ff8f01f72baa377f8538a50ba1e7700450793ded78e578` |
| `HOA-Stage-3-Schema-Source-2026-08-20.md` | `f50736875bbea7895279f9f25c980590df44ca625b7127f895c164350fd6cef1` |

The report repeats the three non-self hashes. A document cannot embed its own final SHA-256 value without changing that value, so this detached manifest is the canonical record of the report hash.

## Evidence-content commit

The four evidence artefacts and this manifest are committed first. The immutable commit ID for that content is added in the immediately following manifest-only commit, so the commit ID does not alter the evidence hashes it certifies.

**Evidence-content commit:** `f2250c984b7b51f0271c142943476e1af17ecb2f`

## Verification

Run from the repository root:

```sh
cat <<'EOF' | sha256sum -c -
9d587100d962f0bb92217d401f2eb99ba2f6006cca01adcec83ccb3eb5045c2b  evidence/stage-3/Stage-3-UAT-Delivery-Report-2026-08-20.md
dbfc59caf2f8ad17f05fe34a3a9da88d9474da0e3ce073220d8d928049210d0a  evidence/stage-3/Stage-3-UAT-Migration-2026-08-20.sql
29bb42081c2a856f18ff8f01f72baa377f8538a50ba1e7700450793ded78e578  evidence/stage-3/Stage-3-UAT-Schema-Only-2026-08-20.sql
f50736875bbea7895279f9f25c980590df44ca625b7127f895c164350fd6cef1  evidence/stage-3/HOA-Stage-3-Schema-Source-2026-08-20.md
EOF
```

Use the filename/hash table above as the authoritative verification schedule. The files are additionally published in the user-authorized public GitHub repository for this one-off Stage 3 status-delivery test.