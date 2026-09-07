# Round 3 UAT — Section 5 final manifest

**Date:** 2026-09-07  
**Result:** PASS  
**Evidence channel:** individual files on the MV-DevOps-Relay main branch; no ZIP bundle  
**Integrity:** every accepted file was read back through its immutable Git blob and byte-compared before inclusion

## Delivered behavior

1. View-only PDF files render on portal-owned PDF.js canvases; no browser-native PDF iframe or plugin is used.
2. View-only Word files are converted by the authenticated API and rendered as non-empty HTML in a sandboxed iframe.
3. View-only images render independently in the portal preview.
4. Folder add/edit no longer exposes or applies download/view-only defaults. Folder visibility floors remain enforced.
5. Existing documents can be changed from download-allowed to view-only and retain that mode after reload.
6. Choosing a custom folder never overwrites an explicitly chosen per-document download mode.
7. Signed-out navigation to Dalil stops at the authenticated route boundary, and the browser regression proves no request reaches /api/ai/chat.
8. Document create requires an explicit downloadMode; update/replacement preserves the current mode when omitted and accepts explicit valid changes.

## Evidence correction

The previously published file named Section-5-Pre-Fix-FAIL-5e-Edit-View-Only-Persistence-2026-09-07.png was a browser-test navigation artifact, not a product failure. The test reloaded without reselecting its isolated folder. It passed after the folder was reselected, with no product change to edit persistence.

- Removed from relay main in commit cd8d3cac0ab6d60321bd8085903aa629d887be42.
- Historical blob retained for transparent audit only: 7dcb60c82bcc787c1faae4818370018eefa51574.
- The accepted failure set is PDF native rendering, folder download defaults, and custom-folder mode overwrite.
- See the verified correction note in the evidence table.

## Validation summary

| Gate | Result |
|---|---|
| Focused Section 5 browser suite | 12 passed, 0 failed |
| Named Round 3 browser regression | 25 passed, 0 failed |
| Complete Playwright suite | 108 passed, 8 existing skips, 0 failed |
| Portal tests / translation guard | 1,446 passed, 0 failed |
| API tests | 1,480 passed, 26 intentional skips, 0 failed |
| Portal typecheck | passed |
| H4 schema integrity | passed |
| Relay schema promotion gate | passed unchanged through migration 0055 |
| React type version pin | one version: 19.2.17 |
| Dedicated PDF visual capture | 1 passed |
| Strengthened visual assertions | 4 passed: Word body text, 5e card, 5f card, signed-out no-chat-call |
| Browser/PDF worker logs | no browser-console or PDF worker errors |

## Retained constraints and scope

- Folder visibility remains a database/API-enforced floor and its tightening cascade remains intact.
- The legacy folder download-mode database column remains unused to avoid an unnecessary schema migration.
- The six documented Section 3 Waha audit-only findings remain unremediated, as required.
- Relay package/schema promotion protections were not weakened.
- The invalid 5e screenshot and interrupted evidence-capture log are excluded from this manifest.

## Accepted evidence and immutable verification

| File | SHA-256 | Immutable Git blob |
|---|---|---|
| [Section-5-Post-Fix-5a-PDF-Portal-Renderer-2026-09-07.png](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-5a-PDF-Portal-Renderer-2026-09-07.png) | aa854a8774e20d39db5399a33a21b1cf00ad1f16882246186065a5224e3eb24d | [4ecba8a443a3f0a6065bd259d1ce346dd13d27e2](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/4ecba8a443a3f0a6065bd259d1ce346dd13d27e2) |
| [Section-5-Post-Fix-5b-Word-Sandboxed-Preview-2026-09-07.png](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-5b-Word-Sandboxed-Preview-2026-09-07.png) | 3ea7b84e955dbe70f98648a5d76baa0f2baf4ae3d170fcf784df2ab9bbc988ba | [514f6657c636f4893d0b8422e0350b06e909db38](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/514f6657c636f4893d0b8422e0350b06e909db38) |
| [Section-5-Post-Fix-5c-Image-Preview-2026-09-07.png](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-5c-Image-Preview-2026-09-07.png) | 4d5d5923dcdf5702a5a89adbd01077c6fb8450762f1a283656239acfe30f578c | [d468f44e93f9c655925f7490ec5556a418f82775](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/d468f44e93f9c655925f7490ec5556a418f82775) |
| [Section-5-Post-Fix-5d-Folder-Add-No-Download-Default-2026-09-07.png](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-5d-Folder-Add-No-Download-Default-2026-09-07.png) | dc146350bb0b69c72cc267316ffcdf0dd589c99be20d09179807ea89418d79ab | [292c823451dca15cacc4420cce650fa347592227](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/292c823451dca15cacc4420cce650fa347592227) |
| [Section-5-Post-Fix-5d-Folder-Edit-No-Download-Default-2026-09-07.png](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-5d-Folder-Edit-No-Download-Default-2026-09-07.png) | e64e1297ed518a4fe7a14bdd18c1b2ecb51c53f1bb44d69d0e2e01aa5a6b2d84 | [64d8133fc6f81fc32aeb8b876b3d3433aedb00b2](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/64d8133fc6f81fc32aeb8b876b3d3433aedb00b2) |
| [Section-5-Post-Fix-5e-Edit-To-View-Only-Persists-2026-09-07.png](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-5e-Edit-To-View-Only-Persists-2026-09-07.png) | b75082b4862990385b316bc61830c15d6b366d2c3bde8d388c79ff6335dcf6ec | [87576e8a1894dfebc516e6a1ed914dcbeafb339c](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/87576e8a1894dfebc516e6a1ed914dcbeafb339c) |
| [Section-5-Post-Fix-5f-Custom-Folder-Preserves-Mode-2026-09-07.png](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-5f-Custom-Folder-Preserves-Mode-2026-09-07.png) | cd16d72ae5dfd2a920358c5e095b12bf5d0e81fbb465bf18358277c5f79580b0 | [03de22a4d6d81d02da5089a85c97d321e2f3abf1](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/03de22a4d6d81d02da5089a85c97d321e2f3abf1) |
| [Section-5-Post-Fix-5g-Signed-Out-Dalil-Auth-Boundary-2026-09-07.png](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-5g-Signed-Out-Dalil-Auth-Boundary-2026-09-07.png) | efa132f3c1122ece81d6c32dac77ee66e72ef4b3be1f3a88dedc9c87bf45c7e4 | [5caf7db1e4ffa2cb91bd776a2c4ae4cbe356f331](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/5caf7db1e4ffa2cb91bd776a2c4ae4cbe356f331) |
| [Section-5-Post-Fix-API-Tests-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-API-Tests-2026-09-07.txt) | 35064432829b0021cd3297705c813d6ccbffbc58c59e1c9f83529b2dde9ec3e6 | [036133eec7f802f1c8cced01e048292dd5985b0d](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/036133eec7f802f1c8cced01e048292dd5985b0d) |
| [Section-5-Post-Fix-Complete-Playwright-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-Complete-Playwright-2026-09-07.txt) | 2340783aa3b9c3ecc9157875a97c3dbda91704484ecbaa4fb0fccd892ca65c91 | [b8b62ff6e631453c02981f2519f95f0cc1936287](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/b8b62ff6e631453c02981f2519f95f0cc1936287) |
| [Section-5-Post-Fix-H4-Schema-Integrity-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-H4-Schema-Integrity-2026-09-07.txt) | e1ba2ec8f251da203f122c83340b4931bf14151eeec9394d67acaed35c78a314 | [7c68c1672068ab5d61c3abfdec9d118e0ac059d0](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/7c68c1672068ab5d61c3abfdec9d118e0ac059d0) |
| [Section-5-Post-Fix-Named-Round3-Regression-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-Named-Round3-Regression-2026-09-07.txt) | 4d479f7887e41ac46bcc4a1d12b20e603120bd37832e13ffbf07cab76ea65478 | [bb0835516e0e51afe9f31f388d2a8e119ec804eb](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/bb0835516e0e51afe9f31f388d2a8e119ec804eb) |
| [Section-5-Post-Fix-PDF-Evidence-Capture-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-PDF-Evidence-Capture-2026-09-07.txt) | 7fb19e77954840769cd3972ee84acbed4e83445ef2eeac41876be1a7d8c5556e | [a69002add6b6ca898c9f049c5e6d8980cef23c11](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/a69002add6b6ca898c9f049c5e6d8980cef23c11) |
| [Section-5-Post-Fix-Playwright-Focused-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-Playwright-Focused-2026-09-07.txt) | f4a68c5b1a42b0196c6755bc817de01f3fd6e1ea7195dc82b7e69eadd19f306d | [521f3c46c49e3a8e1558468ad4a8059b868919e1](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/521f3c46c49e3a8e1558468ad4a8059b868919e1) |
| [Section-5-Post-Fix-Portal-Tests-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-Portal-Tests-2026-09-07.txt) | 92dd0cbd2648234f164bd8186eecf15d6e4f3be9729d9c969ea8742314a0afa5 | [ec8a942ecf70620b94a1c1a697522e8ab34379ee](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/ec8a942ecf70620b94a1c1a697522e8ab34379ee) |
| [Section-5-Post-Fix-Portal-Typecheck-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-Portal-Typecheck-2026-09-07.txt) | 22e8c1f28938d9dd0c2c945aee2b9666df16d74bb1bf2bf7d6170e82c1163a41 | [f1898d0a4881af3859633ab129dafd03e311b1c7](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/f1898d0a4881af3859633ab129dafd03e311b1c7) |
| [Section-5-Post-Fix-Relay-Promotion-Gate-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-Relay-Promotion-Gate-2026-09-07.txt) | 2791dc8babaf3c6bed9f9f1f69af650b9d73093d16684c08659bee13a10dea00 | [f49d285c4a810efdc09c285563a197b626aecec5](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/f49d285c4a810efdc09c285563a197b626aecec5) |
| [Section-5-Post-Fix-Types-React-Pin-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-Types-React-Pin-2026-09-07.txt) | 3d6441026d9cec7ef5962821c95a1f0a4861e22934d34b2496fb2e54b94bc957 | [03c40e5e7e531edadd4d28a5438f194813da8cc6](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/03c40e5e7e531edadd4d28a5438f194813da8cc6) |
| [Section-5-Post-Fix-Visual-Evidence-Assertions-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Post-Fix-Visual-Evidence-Assertions-2026-09-07.txt) | df8814f3ce8adad1277d90fd74112c412bb914496d72b024b9d980e55101fe42 | [f4ef9062a71aef3fc35dba0444dba1e23342bb99](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/f4ef9062a71aef3fc35dba0444dba1e23342bb99) |
| [Section-5-Pre-Fix-Edge-Observed-Facts-2026-09-07.md](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Pre-Fix-Edge-Observed-Facts-2026-09-07.md) | b8ee752554e5ab21518ad9abfe28aed1785da5438c95f05a6d7521c157d4006d | [86ee56fae27e5b3d046162a9eef959b31fae64b4](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/86ee56fae27e5b3d046162a9eef959b31fae64b4) |
| [Section-5-Pre-Fix-Edge-View-Only-PDF-2026-09-07.png](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Pre-Fix-Edge-View-Only-PDF-2026-09-07.png) | 9972cc2972c3a2e085c8bce23e60a1d185652ad993b24924aa8d3711838f8a76 | [7e8941ac7e591dc69fa7a1dd55ed19ae5038466d](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/7e8941ac7e591dc69fa7a1dd55ed19ae5038466d) |
| [Section-5-Pre-Fix-Evidence-Correction-2026-09-07.md](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Pre-Fix-Evidence-Correction-2026-09-07.md) | 9b459b49c6d027357cdd18eb8c75462bb20b6d4244badff0bffa1bfe5faddacc | [62f979f28624fc5497ce131d463691284d5778e0](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/62f979f28624fc5497ce131d463691284d5778e0) |
| [Section-5-Pre-Fix-FAIL-5a-PDF-Native-Renderer-2026-09-07.png](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Pre-Fix-FAIL-5a-PDF-Native-Renderer-2026-09-07.png) | ab2b89eb4813e7a07ff83828c0c2de1e36b41afb6ec083dfc230e5db2c677224 | [900ec5c3f5a0e2b5793df40025276811fb27f164](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/900ec5c3f5a0e2b5793df40025276811fb27f164) |
| [Section-5-Pre-Fix-FAIL-5d-Folder-Download-Default-2026-09-07.png](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Pre-Fix-FAIL-5d-Folder-Download-Default-2026-09-07.png) | 5d327f84badef16a0217e4807d64bc761f8a1368bf6a21df0b8c987eddd83737 | [e9263225a3a67b9c50825da67f0876e84b0127be](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/e9263225a3a67b9c50825da67f0876e84b0127be) |
| [Section-5-Pre-Fix-FAIL-5f-Custom-Folder-Overrides-Mode-2026-09-07.png](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Pre-Fix-FAIL-5f-Custom-Folder-Overrides-Mode-2026-09-07.png) | 7935cfb1174b5e0d0547aeca1bd529e5a7c748e5ca90494d662dba2581c35afa | [dd76eb7291e00e228420b025b314d2487ab37135](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/dd76eb7291e00e228420b025b314d2487ab37135) |
| [Section-5-Pre-Fix-Playwright-Focused-2026-09-07.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-3/section-5-documents/Section-5-Pre-Fix-Playwright-Focused-2026-09-07.txt) | 9ccf93ddafb633871bf32c645382cdcaa5a5476cad40ed2eb79e381dcf0d8d55 | [82f20c3811819180431cbe2dd2875cd3ecff27df](https://api.github.com/repos/JerryFeet/MV-DevOps-Relay/git/blobs/82f20c3811819180431cbe2dd2875cd3ecff27df) |
