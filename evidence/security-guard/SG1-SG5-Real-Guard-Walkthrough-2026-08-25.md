# SG1 and SG5 — Real Guard-Authenticated Walkthrough

**Date:** 2026-08-25  
**Environment:** development only; no production writes, deployment, or payment-provider configuration  
**Result:** PASS for the real Clerk-authenticated portal and API walkthrough required for SG1 and SG5 acceptance.

## What this proves

A real Clerk development test account was signed in through the actual portal, provisioned as a `guard` in the development HOA database, and then used against the running portal and API. The test did not mock the browser identity, portal UI, or API responses. Reserved development fixtures were created idempotently for `E2E / GATE-101`.

The browser walkthrough passed twice after evidence capture: the guard setup and the full guard journey both passed in the dedicated Playwright `guard` project.

## Visible gate output

| Purpose | Live credential / lookup | What the guard actually saw | Result |
| --- | --- | --- | --- |
| Unified scanner — Guest Pass | Approved Guest Pass | Valid decision, guest **Gate Fixture Visitor**, host **Gate Fixture Resident**, unit **GATE-101**, current visit date, and vehicle plate **E2E-GUEST-01**. The entry/exit controls appeared. | Approved |
| Unified scanner — paid Guest Day Pass | Numeric Code128-compatible day-pass ID | Valid decision, **3** guests, host, unit **GATE-101**, **Paid: Yes**, and vehicle plate **E2E-DAY-42**. | Approved |
| Unified scanner — Waha credential | Active Waha pass number | Valid decision with holder **Gate Fixture Resident** and unit **GATE-101**. | Approved |
| Resident lookup | National ID / Iqama fixture | Resident **Gate Fixture Resident**, unit **GATE-101**, role **owner**. The returned JSON and result card did not contain the searched National ID. | Matched without identifier disclosure |
| Move-in permit | Unit **GATE-101** | **APPROVED MOVE-IN PERMIT** with the effective date range. | Approved |
| Move-out permit | Unit **GATE-101** | **APPROVED MOVE-OUT PERMIT** with the effective date range. | Approved |
| Renovation permit | Unit **GATE-101** | **APPROVED RENOVATION PERMIT** with contractor **E2E Gate Works** and contact **+966501112233**. | Approved |

## SG5 15-minute inactivity result

The real `PortalLayout` guard idle timer was mounted under the live authenticated portal. Playwright advanced the browser clock by 15 minutes to avoid a wall-clock wait; this did not mock Clerk authentication, the portal, or the sign-out handler. The portal called Clerk sign-out and left the protected gate route. Clerk displayed `/sign-in` with the portal root retained as the return URL.

## Camera-path limitation and manual UAT

The live headless browser attempted **Scan credential**. The portal visibly reported: **Camera access denied or unavailable on this device.** No typed credential has been represented as a physical camera scan. The manual-entry path above proves the real server-side classifier and each credential type; presenting a real QR/barcode to a physical guard-device camera remains a manual hardware UAT item.

## Evidence files

- [Camera fallback in headless UAT](SG1-SG5-Real-Guard-Walkthrough-2026-08-25/00-camera-unavailable-in-headless-uat.png)
- [Approved Guest Pass](SG1-SG5-Real-Guard-Walkthrough-2026-08-25/01-guest-pass-approved.png)
- [Approved paid Guest Day Pass](SG1-SG5-Real-Guard-Walkthrough-2026-08-25/02-paid-guest-day-pass-approved.png)
- [Approved Waha credential](SG1-SG5-Real-Guard-Walkthrough-2026-08-25/03-waha-credential-approved.png)
- [National-ID resident search result](SG1-SG5-Real-Guard-Walkthrough-2026-08-25/04-national-id-resident-result.png)
- [Approved move-in permit](SG1-SG5-Real-Guard-Walkthrough-2026-08-25/05-move-in-permit-approved.png)
- [Approved move-out permit](SG1-SG5-Real-Guard-Walkthrough-2026-08-25/06-move-out-permit-approved.png)
- [Approved renovation permit](SG1-SG5-Real-Guard-Walkthrough-2026-08-25/07-renovation-permit-approved.png)
- [Clerk sign-in after guard idle timeout](SG1-SG5-Real-Guard-Walkthrough-2026-08-25/08-guard-signed-out-after-idle-timeout.png)

## Acceptance statement

The required real guard-account walkthrough has now passed. SG1 and SG5 are accepted for the real portal/API behaviors evidenced here. The physical-camera hardware scan remains explicitly manual UAT and is not claimed as automated proof.
