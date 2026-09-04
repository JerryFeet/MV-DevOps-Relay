# H5 post-0048 publication manifest

**Repository:** `JerryFeet/MV-DevOps-Relay`  
**Branch:** `main`  
**Date:** 2026-09-04  
**Revision:** r4

Every file below was published in a separate commit, read back through the
GitHub Git Data API, decoded from its immutable blob, compared byte-for-byte
with the local source, and hashed from the exact remote bytes.

| Artifact | Commit | Blob | Bytes | SHA-256 |
|---|---|---|---:|---|
| `evidence/pre-go-live/migrations/0045_portal_help.sql` | `bce11a6347eb131933adff145242bc24570fba6f` | `503aee1823fe91f9f3ac36ce0a541f04280e4215` | 3,592 | `949266c835bc21aa37d807744abf487aefe38e44468445222b1260c969006219` |
| `evidence/pre-go-live/migrations/0046_tenant_identity_fields.sql` | `e22396f127f18426e62769b226701c617179a065` | `3fa49e56ca813103d2905d8dbdf3bd7737297a7e` | 329 | `a671ccf5d90e09da679c5aa97b5580ea5c6b4de8255e44fb49b1a92f62314ce2` |
| `evidence/pre-go-live/migrations/0047_resident_guardian_identifier.sql` | `00d0a0c4e8568568267a1cfde816f9411b81c36c` | `9e009e047c1c149a24de894826acd3fe81091fa7` | 260 | `c64eaece7735bfa5000ae133d49a2773fc80419e96f17624211f3daa7d29351c` |
| `evidence/pre-go-live/migrations/0048_booking_allowance_and_unit_master_audit.sql` | `ce9d810f00d413c91d35475c83ba323f117eaa1c` | `4bbf594adb37eded7f293c539790087636f36501` | 3,258 | `db0430a5e861d59cf26e35ec5eb67bb88d44c54d42e3bf04ba327f7b8fde3276` |
| `evidence/pre-go-live/migrations/0000_baseline-2026-09-04-r4.sql` | `bc2fefcd2c7651f21a21d83c0683b08e52832d1b` | `64e08762032792c80c60e2e241e452e94dbe2bfb` | 124,024 | `d43852a76d49c4a02505641af88826def40ecdf254eaa63b291e305446befaf2` |
| `evidence/pre-go-live/verify-production-schema-post-0048-2026-09-04-r4.sh` | `191c9db17e6348c5075a12ec64a44629064d36e2` | `68da6fe6c1312793a3b60574bedb3bc23653788b` | 6,907 | `d6733cdb78fec3ee4d537f4bdc0f6bf27ea0d89a7df1c087821013ee58f16c90` |
| `evidence/pre-go-live/H5-Post-0048-Catalog-Signature-2026-09-04-r4.sql` | `a937a11bed38c54c7b92da54c0fb02ecafb0a851` | `74964c12157cfab421dbf3c2d969ec87be6e06d7` | 3,073 | `e1c2c13d8b38edc20711c6788eb39ba3d4368a5509609b2833da1d90a03b0b29` |
| `evidence/pre-go-live/H5-Post-0048-Baseline-Semantic-Diff-2026-09-04-r4.txt` | `d445cab9267286dd8593ef0b987928fbf6e671d2` | `2be7c575c68319dd68912ba62812d7490e5a10ce` | 1,101 | `b4e4d9a4c1c4abea952a1f7dcccf555c32c69e9b182868d077c375e1b7c649fb` |
| `evidence/pre-go-live/H5-Post-0048-Baseline-Empty-Diff-Evidence-2026-09-04-r4.md` | `d84191f505dc31dd5187dd3a6a76f1e20cac5058` | `516195d06f7348b11321d5a8f1566059468db59f` | 6,333 | `7f0b0e892083e74ac6bace4d1d546a35dbb68e16a220af23fbd6213b35d77bd9` |

## Current relay migration inventory

The relay migration directory now contains:

- preserved baseline `0000_baseline-2026-08-26-r3.sql`;
- current baseline `0000_baseline-2026-09-04-r4.sql`;
- migrations `0042` through `0048`, with no gap.

The current baseline measures `47 / 634 / 138 / 155 / 6`. Frozen Development
and a fresh template0 replay each produced 1,579 normalized catalog entries
with SHA-256
`5547643ec341a47ab09f87074ce8ebb0ff2540b1e640cc71c8128dfd38777afc`.

The manifest's own immutable commit, blob, byte count, and SHA-256 are reported
outside this file after publication to avoid a circular self-hash.