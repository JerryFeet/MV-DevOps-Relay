# H5 — post-0048 baseline regeneration and empty-diff proof

**Date:** 2026-09-04  
**Environment:** frozen Development/UAT catalog plus disposable local PostgreSQL database  
**Production:** not accessed, changed, migrated, or deployed

## Migration sequence and relay repair

The source migration directory contains the following post-0045 changes:

- `0046_tenant_identity_fields.sql` adds nullable `date_of_birth` and
  `nationality` identity fields to unit verification, plus resident nationality.
- `0047_resident_guardian_identifier.sql` adds the non-null
  `id_number_is_guardian` marker and `idx_residents_id_number`.
- `0048_booking_allowance_and_unit_master_audit.sql` adds the immutable monthly
  booking allowance ledger, append-only unit correction evidence, and the
  database-time one-active-booking trigger.

The relay migration directory had stopped at `0044`. The exact source bytes for
`0045` through `0048` were therefore published individually before the new
baseline:

| Relay artifact | Commit | Blob | Bytes | SHA-256 |
|---|---|---|---:|---|
| `evidence/pre-go-live/migrations/0045_portal_help.sql` | `bce11a6347eb131933adff145242bc24570fba6f` | `503aee1823fe91f9f3ac36ce0a541f04280e4215` | 3,592 | `949266c835bc21aa37d807744abf487aefe38e44468445222b1260c969006219` |
| `evidence/pre-go-live/migrations/0046_tenant_identity_fields.sql` | `e22396f127f18426e62769b226701c617179a065` | `3fa49e56ca813103d2905d8dbdf3bd7737297a7e` | 329 | `a671ccf5d90e09da679c5aa97b5580ea5c6b4de8255e44fb49b1a92f62314ce2` |
| `evidence/pre-go-live/migrations/0047_resident_guardian_identifier.sql` | `00d0a0c4e8568568267a1cfde816f9411b81c36c` | `9e009e047c1c149a24de894826acd3fe81091fa7` | 260 | `c64eaece7735bfa5000ae133d49a2773fc80419e96f17624211f3daa7d29351c` |
| `evidence/pre-go-live/migrations/0048_booking_allowance_and_unit_master_audit.sql` | `ce9d810f00d413c91d35475c83ba323f117eaa1c` | `4bbf594adb37eded7f293c539790087636f36501` | 3,258 | `db0430a5e861d59cf26e35ec5eb67bb88d44c54d42e3bf04ba327f7b8fde3276` |

Each commit and blob was read back through the GitHub API, decoded, and compared
byte-for-byte with the corresponding source file.

## Regenerated baseline

The canonical baseline was freshly captured from the frozen Development catalog:

```text
pg_dump --schema-only --no-owner --no-privileges --schema=public
```

Only the bootstrap `CREATE SCHEMA public` statement was removed because
`template0` database creation supplies that schema. No application object DDL
was edited.

| Fact | Result |
|---|---|
| Canonical workspace file | `lib/db/migrations/0000_baseline.sql` |
| Relay artifact | `evidence/pre-go-live/migrations/0000_baseline-2026-09-04-r4.sql` |
| Relay commit | `bc2fefcd2c7651f21a21d83c0683b08e52832d1b` |
| Relay blob | `64e08762032792c80c60e2e241e452e94dbe2bfb` |
| Bytes | 124,024 |
| SHA-256 | `d43852a76d49c4a02505641af88826def40ecdf254eaa63b291e305446befaf2` |
| Public tables | 47 |
| Public columns | 634 |
| Public constraints | 138 |
| Public indexes | 155 |
| Non-internal triggers | 6 |
| Enum types | 29 |
| Public functions | 5 |

The migration ledger now records migrations through `0048` as historical
evolution included in the canonical baseline, with no active forward migration.

## Fresh replay and semantic proof

A disposable database was created from `template0`, loaded only from the
regenerated canonical baseline with `psql -X -v ON_ERROR_STOP=1`, compared with
the frozen Development catalog, and removed.

The normalized comparison covered relations, columns and their types,
nullability, defaults, identity/generated state, constraints, indexes,
non-internal triggers, public functions, enum labels, and sequences.

| Result | Frozen Development | Fresh baseline replay |
|---|---:|---:|
| Normalized catalog entries | 1,579 | 1,579 |
| Catalog SHA-256 | `5547643ec341a47ab09f87074ce8ebb0ff2540b1e640cc71c8128dfd38777afc` | `5547643ec341a47ab09f87074ce8ebb0ff2540b1e640cc71c8128dfd38777afc` |
| Public tables | 47 | 47 |
| Public columns | 634 | 634 |
| Public constraints | 138 | 138 |
| Public indexes | 155 | 155 |
| Non-internal triggers | 6 | 6 |
| Enum types | 29 | 29 |
| Public functions | 5 | 5 |
| Normalized semantic diff | empty | empty |

Development retains a dropped-column ordinal gap in `residents`. Physical
`pg_attribute.attnum` values were intentionally excluded because a schema-only
replay cannot preserve dropped-column storage ordinals. Column names and every
schema-semantic attribute listed above remain included.

The fresh replay also passed `scripts/assert-h4-schema-protections.sh`.

## One-shot production verifier

`scripts/verify-production-schema.sh` now asserts the frozen totals
`47 / 634 / 138 / 155 / 6` and thirteen explicit raw protections:

1. `users_staff_unitless_check`
2. `units_system_unit_identity_check`
3. `units_one_system_unit`
4. `protect_hoa_common_system_unit()`
5. `protect_hoa_common_system_unit_trigger`
6. `monthly_booking_allowances`
7. `unit_master_data_audit`
8. `uq_monthly_booking_allowance_unit_period`
9. `reject_immutable_unit_registry_evidence()`
10. `enforce_one_active_unit_facility_booking()`
11. `trg_monthly_booking_allowances_immutable`
12. `trg_unit_master_data_audit_append_only`
13. `trg_enforce_one_active_unit_facility_booking`

The updated script passed against both the frozen Development catalog and the
fresh baseline replay.

| Relay artifact | Commit | Blob | Bytes | SHA-256 |
|---|---|---|---:|---|
| `evidence/pre-go-live/verify-production-schema-post-0048-2026-09-04-r4.sh` | `191c9db17e6348c5075a12ec64a44629064d36e2` | `68da6fe6c1312793a3b60574bedb3bc23653788b` | 6,907 | `d6733cdb78fec3ee4d537f4bdc0f6bf27ea0d89a7df1c087821013ee58f16c90` |
| `evidence/pre-go-live/H5-Post-0048-Catalog-Signature-2026-09-04-r4.sql` | `a937a11bed38c54c7b92da54c0fb02ecafb0a851` | `74964c12157cfab421dbf3c2d969ec87be6e06d7` | 3,073 | `e1c2c13d8b38edc20711c6788eb39ba3d4368a5509609b2833da1d90a03b0b29` |
| `evidence/pre-go-live/H5-Post-0048-Baseline-Semantic-Diff-2026-09-04-r4.txt` | `d445cab9267286dd8593ef0b987928fbf6e671d2` | `2be7c575c68319dd68912ba62812d7490e5a10ce` | 1,101 | `b4e4d9a4c1c4abea952a1f7dcccf555c32c69e9b182868d077c375e1b7c649fb` |

No Production database access, schema mutation, deployment, automatic
migration, `db:push`, or `drizzle-kit migrate` command was used.