# Round 4 C-1–C-9 and B4 publication manifest

Published: 2026-09-12  
Repository: `JerryFeet/MV-DevOps-Relay`  
Branch: `main`  
Format: individual files; no ZIP bundle

## Published evidence

| File | SHA-256 | Immutable Git blob | Publication commit |
|---|---|---|---|
| [Round-4-C1-C9-Delivery-Matrix-2026-09-12-r1.md](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-4/Round-4-C1-C9-Delivery-Matrix-2026-09-12-r1.md) | `1b2274570ffe713064fbc7589c28aafd799f0f354c447a92920051a4762d2405` | [`416bf276b3f90438de86d764be23d7bafb76924f`](https://github.com/JerryFeet/MV-DevOps-Relay/blob/416bf276b3f90438de86d764be23d7bafb76924f) | `26dcf8d480b8bcce41b7f666130247e1f9de2e62` |
| [Round-4-B4-Remaining-Enumeration-A1a-Matrix-2026-09-12-r1.md](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-4/Round-4-B4-Remaining-Enumeration-A1a-Matrix-2026-09-12-r1.md) | `c692ecf823136d25a55bd887aa8cc9b14bc1ef526bcf16dd37dffa45a9a4940d` | [`b80fb6fb6bb04775b9d0f40bfa4126af181121c8`](https://github.com/JerryFeet/MV-DevOps-Relay/blob/b80fb6fb6bb04775b9d0f40bfa4126af181121c8) | `289abf4ffe67441a0ba43f8c8d809babee0b4f7c` |
| [Round-4-C1-C9-B4-Canonical-Gate-PASS-2026-09-12-r1.txt](https://github.com/JerryFeet/MV-DevOps-Relay/blob/main/evidence/uat-round-4/Round-4-C1-C9-B4-Canonical-Gate-PASS-2026-09-12-r1.txt) | `66e18a9f73914049189107903442c3570b1dfa699c11b62041bf79f30eeffcae` | [`b586bfa7341e9fcbb6972b6fc071a48cd913aed6`](https://github.com/JerryFeet/MV-DevOps-Relay/blob/b586bfa7341e9fcbb6972b6fc071a48cd913aed6) | `daa206bab55fa0fd12718b91159e3600fe1f7f12` |

## Readback verification

Each file was fetched through GitHub's immutable Git Blob API using the blob ID
listed above. The returned base64 bytes were decoded and hashed independently.
Every readback SHA-256 matched the local source:

- Delivery matrix: MATCH
- B4/A1a matrix: MATCH
- Canonical transcript: MATCH

## Canonical result

`pnpm run round3:regression:e2e` exited with code 0:

- API: 305/305
- Portal contracts: 22/22
- Mobile contracts: 4/4
- Browser: 39/39
- Total: 370/370

The successful browser phase used system Chromium through the canonical portal
script, avoiding the unsupported downloaded Chromium shell on Replit NixOS.

No schema push, migration runner, force operation, or immutable-protection
bypass ran during this delivery.