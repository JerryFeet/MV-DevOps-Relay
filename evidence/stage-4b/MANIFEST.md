# Stage 4b evidence manifest — 2026-08-20 r1

**Repository:** `JerryFeet/MV-DevOps-Relay`  
**Path:** `evidence/stage-4b/`  
**Classification:** Status/evidence delivery only; Stage 4b remains pending reviewer approval.  
**Verification method:** SHA-256 values below were calculated from the exact decoded GitHub content blobs after publication, not only from local files.

## Content artifacts

| File | GitHub blob SHA | SHA-256 | Content commit |
|---|---|---|---|
| `Stage-4b-UAT-Delivery-Status-Report-2026-08-20-r1.md` | `1b2e1aac5cf53b45ddbdb85a98ffd915d141e769` | `ddd1945a088a4f1944d4d8f61464623e45984775a858650a45eae5d8caa3281e` | `f632bcc33e897ae9526aadbde4fcf50f1d52b1a7` |
| `Stage-4b-UAT-Migration-2026-08-20-r1.sql` | `ac81fafca5cfbcf9db337cd581fe36953095fa33` | `4e504c3cfd359b26e16215f7830e8428de02a90ca1644adf7302fc6fa798b897` | `148bd6ee7532b6aac4512a8a0f99fd833e9dab2c` |
| `Stage-4b-UAT-Schema-Only-2026-08-20-r1.sql` | `43eb74a40700b77f209afbbf74926e8061388c90` | `03b77dc583e84c94d6bbf6d5adf8c68265ad9f0fbecd8b267c0005cc3d58f34f` | `cbe44fa9748519871319bee8efa80c5fe7314b07` |
| `HOA-Stage-4b-Schema-Source-2026-08-20-r1.md` | `469a6d29146212fbca3e1c9623e71bd77305f6ed` | `42c68c64b3941f0cd9f37bce145f4330cf77a2c0503b0d7e1b2d6c36bfe26f37` | `042d1fdf23ece103c3a0a0069671e6ccbb984fb9` |
| `Madain-Village-HOA-Portal-Stage-4b-Delivery-Status-2026-08-20-r1.zip` | `ba9f8cac7d16cbe3f4fe6459e16dab5c0116000d` | `e534e9ebad2c023217d2b0dce02e69939996c6ce1065ae58a1f14b632d7b066f` | `5c6eb318fdf609603c0a183ee8754d84b2ab18d4` |

**Final evidence-content commit:** `5c6eb318fdf609603c0a183ee8754d84b2ab18d4`

## Safety checks

- The schema-only evidence contains no `INSERT` statement and no `COPY ... FROM stdin` data block.
- The migration source includes only static bilingual folder labels and defaults; it contains no resident, user, document, credential, object-storage, or production data.
- The ZIP includes exactly the four named evidence files and no hidden supplemental data.
- This manifest is deliberately separate: including its own final hash would alter that hash.