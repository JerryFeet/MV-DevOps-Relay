# Round 3 Section 6 — final public evidence manifest

**Repository:** `JerryFeet/MV-DevOps-Relay`  
**Branch:** `main`  
**Evidence policy:** individual files only; no ZIP bundle  
**Integrity:** every row below was decoded from its immutable Git blob and
byte-compared with the local source before inclusion.

## Validation

| Gate | Result |
|---|---|
| Complete Playwright suite | 111 passed, 8 intentional skips, 0 failures |
| Named Round 3 browser regression | 27 passed |
| Focused Section 6 browser regression | 2 passed |
| Signed-out homepage browser regression | 1 passed; zero announcement calls, zero Dalil calls, zero 401 responses |
| Portal unit/translation suite | 1,446 passed |
| API unit suite | 1,482 passed, 26 skipped, 1 real-database file skipped by environment |
| Portal and API type checks | passed |
| React type pin | one version: 19.2.17 |
| H4 schema integrity | passed |
| Relay schema-promotion gate | passed through migration 0055 |

The first complete Playwright attempt reached 110 passes and 8 intentional
skips, then failed one old document test because its `/download|view/` locator
matched “preview” in a folder name and collided with the hidden empty-state
node. This was classified as a harness fault, not defect evidence. The
permanent test now scopes the control to an actual document card and its focused
rerun passed. That failed transcript is deliberately excluded from this
accepted manifest.

## Section 6 and homepage files

| File | Local SHA-256 | Immutable Git blob |
|---|---|---|
| [Section-6-Delivery-Summary-2026-09-07.md](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-6-residents/Section-6-Delivery-Summary-2026-09-07.md) | `11d81fed4c099ebae362ada7c9485aff599cc8225c38f5ead9d69f9e9b9e0a1f` | [c285d834d0a9b25900d8dede513727a4439b41b6](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/c285d834d0a9b25900d8dede513727a4439b41b6) |
| [Homepage-Signed-Out-Announcement-Request-Correction-2026-09-07.md](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-6-residents/Homepage-Signed-Out-Announcement-Request-Correction-2026-09-07.md) | `2bf84836fc58714024bc18b6940e62664e88f71b16e21bb29866bdda110ae3ef` | [217d50897706e30398d5189a962c76db939b3d95](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/217d50897706e30398d5189a962c76db939b3d95) |
| [Section-6-Post-Fix-6a-Guardian-ID-Autofill-2026-09-07.png](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-6-residents/Section-6-Post-Fix-6a-Guardian-ID-Autofill-2026-09-07.png) | `f4d26acaafdbe6a18b00c77451ff4ad74b95ed4413ce15a05b30ec09b50bcf67` | [4f7c9252ecd5569b00617cff9db1df666c56bfbf](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/4f7c9252ecd5569b00617cff9db1df666c56bfbf) |
| [Section-6-Post-Fix-6b-Pending-Resident-Visible-No-Delete-2026-09-07.png](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-6-residents/Section-6-Post-Fix-6b-Pending-Resident-Visible-No-Delete-2026-09-07.png) | `3ecb30bd1fb64f14089d801db1c458ae76e9a37129be0b8b585bbbda97d90e2b` | [90df31c27bf3eb5ed16f14e29341c62ee575f4c9](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/90df31c27bf3eb5ed16f14e29341c62ee575f4c9) |
| [Section-6-Post-Fix-Browser-PASS-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-6-residents/Section-6-Post-Fix-Browser-PASS-2026-09-07.txt) | `40fa4a85a981cb757131a30f5bc7f1fa255735b7819563d343ac2f5a93749ae9` | [826cc13a122449bea1431f80240142479d92d8f9](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/826cc13a122449bea1431f80240142479d92d8f9) |
| [Section-6-Full-Portal-Tests-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-6-residents/Section-6-Full-Portal-Tests-2026-09-07.txt) | `f7c131edc14c0f9b4bf934031ba1be6897af1a1a14a2090f515c0d159d4544d8` | [0d249ae13cfd072761f622b130594f7c10860b11](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/0d249ae13cfd072761f622b130594f7c10860b11) |
| [Section-6-Full-API-Tests-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-6-residents/Section-6-Full-API-Tests-2026-09-07.txt) | `4122fd727f3af3e57569bcf6b365c8959449b9880c6c95fa5f171faa9b0fff81` | [a326b92458178a561461aa996f6689746f9ab928](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/a326b92458178a561461aa996f6689746f9ab928) |
| [Section-6-Complete-Playwright-PASS-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-6-residents/Section-6-Complete-Playwright-PASS-2026-09-07.txt) | `313e40e41d055ffb7b9a96c263ade129e18e2666252732bd5bbb84f331c0ffb3` | [8bd74f3336f3f31c2110b3f37abe76e46f21828c](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/8bd74f3336f3f31c2110b3f37abe76e46f21828c) |
| [Homepage-Signed-Out-Permanent-Browser-Regression-2026-09-07.ts](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-6-residents/Homepage-Signed-Out-Permanent-Browser-Regression-2026-09-07.ts) | `8561770b2f546d9651bcb181b8c702285417e30ce917eabf2bdea7b533d6a891` | [a079d4632648db2fbbcc647dfaf1bfc90bc599fc](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/a079d4632648db2fbbcc647dfaf1bfc90bc599fc) |
| [Round-3-Section-6-Permanent-Browser-Regression-2026-09-07.ts](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-6-residents/Round-3-Section-6-Permanent-Browser-Regression-2026-09-07.ts) | `fc5c1bd3df386db38357244541f6171b8a2354ab0b29c905fc7f96b47ff77abb` | [5618e185992a0c242fbd656c6101626858165081](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/5618e185992a0c242fbd656c6101626858165081) |
| [Round-3-Section-6-Residents-API-Regression-2026-09-07.ts](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-6-residents/Round-3-Section-6-Residents-API-Regression-2026-09-07.ts) | `73e428803a794b5f02c9a0540e852886d8e52592a9a327102f01c94062615f07` | [474809f047876fcbb7a1476ef92f673d712e2dce](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/474809f047876fcbb7a1476ef92f673d712e2dce) |

## Exhaustive asymmetric-invariant audit

| File | Local SHA-256 | Immutable Git blob |
|---|---|---|
| [Cross-Project-Asymmetric-Invariant-Route-Enumeration-2026-09-07.md](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/Cross-Project-Asymmetric-Invariant-Route-Enumeration-2026-09-07.md) | `5465f164a95e4d652589326199e0990ae363d0613c8ef69e59cd07b092717234` | [a4e68e7329d5de27c7ae9481c1fb18f65e85215d](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/a4e68e7329d5de27c7ae9481c1fb18f65e85215d) |
| [Section-3-Waha-Invariant-Route-Matrix-2026-09-07.md](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-3-waha-second-credential/Section-3-Waha-Invariant-Route-Matrix-2026-09-07.md) | `45c2384373ef657c8d79743432c4759160e2ded9111c1d455351b380a119c926` | [8df32fcdf9bed941fd8861b7f4af06b31d3dec70](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/8df32fcdf9bed941fd8861b7f4af06b31d3dec70) |

## Six individually published Waha audit-only findings

These six records remain audit-only. Publication is not runtime confirmation and
does not authorize remediation.

| Finding | Local SHA-256 | Immutable Git blob |
|---|---|---|
| [01 — Lost card](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-3-waha-second-credential/Waha-Audit-Only-01-Lost-Card-2026-09-07.md) | `6ab00fb4bd5f9034de8b42eaea86f609c8e2c0fd311874ba7e1652eeca4a65aa` | [b2151f189a8c1272b669cd06d62a74cf46f781cc](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/b2151f189a8c1272b669cd06d62a74cf46f781cc) |
| [02 — Replacement](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-3-waha-second-credential/Waha-Audit-Only-02-Replacement-2026-09-07.md) | `c1dd1e738b077dac08df5c9fe3b81a0ef30ac5197888bc317551e73a85ec8fd8` | [759bb2e5ea1261b24c09e6dd4ce1ab8d8b53fb25](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/759bb2e5ea1261b24c09e6dd4ce1ab8d8b53fb25) |
| [03 — Credential 2 holder removal](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-3-waha-second-credential/Waha-Audit-Only-03-Credential-2-Holder-Removal-2026-09-07.md) | `c9cbde6765a7fab374482a4595281b6d2c0ad36058f887286d36d86cbe3ff76b` | [9e343b694f27487d943cb387ffdf42652a528e21](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/9e343b694f27487d943cb387ffdf42652a528e21) |
| [04 — Day pass](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-3-waha-second-credential/Waha-Audit-Only-04-Day-Pass-2026-09-07.md) | `f3111114fd8d9017b34b9301e884229d368907f575b2c092076db1b110f9261b` | [bc6bd1f07b52c93691387833bf89cc0c8a7b1d0b](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/bc6bd1f07b52c93691387833bf89cc0c8a7b1d0b) |
| [05 — Scheduler](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-3-waha-second-credential/Waha-Audit-Only-05-Scheduler-2026-09-07.md) | `6fddea4dd902f49d25451937a688513efd9fb951780a08f91e7eb787372d5c52` | [603baa93f08c230c4f13fd9f9ffcb7a3741a3625](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/603baa93f08c230c4f13fd9f9ffcb7a3741a3625) |
| [06 — Database cardinality](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-3-waha-second-credential/Waha-Audit-Only-06-Database-Cardinality-2026-09-07.md) | `104c488a1ce639d8dc9b5a8ecc1a9ee2dcafc18925d6f9f5f5327c837cc2a5f7` | [bc335069e5fa2a3f7f79abc129ed713f71ca1db3](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/bc335069e5fa2a3f7f79abc129ed713f71ca1db3) |
