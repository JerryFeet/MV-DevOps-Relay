# Stage 4 Evidence Manifest

**Revision:** r3  
**Repository:** `JerryFeet/MV-DevOps-Relay`  
**Branch:** `main`  
**Evidence directory:** `evidence/stage-4/`

This manifest records SHA-256 values calculated from the exact bytes fetched back from the pushed GitHub blobs. Each r3 evidence document was published individually; this manifest is published as a separate manifest-only file.

| File | Bytes | SHA-256 | GitHub blob SHA | Content commit |
|---|---:|---|---|---|
| `Stage-4-Detailed-Plan-2026-08-22-r3.md` | 5,594 | `38ae81b94793de7674cfe571d2bf23be37636ab4bfc275115984629b4fcad48d` | `b146cbbf5b0ea79269054ca41a169c168f1d182e` | `d4d78301dbfa39887ddb303435a04d89a7d81387` |
| `Stage-4-Requirements-Traceability-2026-08-22-r3.md` | 4,673 | `8026760d4b67fc71a94ffccb8288ed6488e808374b7fce1c5289a84862063c90` | `0bf6efa76a4e9b80d1a4fc9c23e59f0a4078a5d7` | `bcfba5a131dbdbd8bcf7c87a25b719ac14ee9290` |
| `Stage-4-Delivery-Report-2026-08-22-r3.md` | 2,862 | `3c6527e9b8eba3b7f9b9746d0dec8a5bd118922f770fb18e5f78deb677a08735` | `9080f1a223804c5481f8ff622270fa52f4afef65` | `34e14634ca7f93ec61313c37e8f9eb080d3d4b61` |

## r3 acceptance-gate record

- **B6:** a deterministic production-source test scans portal source and fails if `/api/unit-registry/validate` is present. B6 is not a carried manual proof item.
- **J3:** unauthenticated private document routes returning `401` are the acceptance gate. Direct public-object denial and private-write coverage remain supporting proof. Visual signed-out review is supplemental only and is not carried.
- **Booking fixture:** the focused regression test and independent Clerk browser UAT passed with a browser-derived future date, exact created-booking date verification, and created-card-only cancellation.

## Broad browser-suite record

The configured Playwright suite was completed and is intentionally recorded as **not green**: **71 passed, 3 failed, 5 flaky, 9 skipped**, exit status 1 after 37.4 minutes. The repaired booking flow passed inside that run. The three unrecovered failures are unrelated Key Contacts admin-settings-to-drawer round trips.

## Delivery boundary

Earlier r1 and r2 evidence remains unchanged. This r3 revision is delivered for user acceptance only; it does not authorize deployment. The remaining carried visual review is exactly K2, K3, K4, I3, I4, B1, B2, B3, B5, and J1. A historical public-object storage inventory remains a separate go-live prerequisite.