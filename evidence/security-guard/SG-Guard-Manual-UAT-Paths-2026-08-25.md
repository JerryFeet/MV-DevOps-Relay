# Security Guard — Manual UAT Paths

**Environment:** development/UAT only  
**Order:** complete on one phone/browser session, in English and Arabic where noted  
**Rule:** record the tester, device, time, result, and screenshot for every path. Do not use a typed credential as evidence of a physical camera scan.

## 1. Sign in and guard-only landing

1. Start from the normal portal sign-in URL using a genuine guard account.
2. Confirm the account lands on **Security Gate**, not the resident dashboard or an admin page.
3. Confirm the active guard session shows the signed-in guard name.
4. Try the resident dashboard, Documents, Guest Registration, Facility Booking, and an admin URL directly. Each must remain unavailable to the guard.

## 2. Five dashboard purposes

For each purpose, record the visible verdict and the fields shown. Do not accept a blank card, stale result, or ambiguous success as a pass.

1. **Resident lookup by National ID/Iqama:** enter a known UAT identifier. Confirm the matching resident name, unit, and role are shown. Confirm the searched identifier is not shown in the result or error.
2. **Guest Pass:** use an approved guest-pass credential for today. Confirm the screen visibly identifies a valid pass, guest, host, unit, visit date, and supplied vehicle plate where applicable.
3. **Paid Guest Day Pass:** use a valid paid day-pass credential. Confirm the screen says the pass is valid and shows its date, guest count, host, unit, payment/validity state, and plate when supplied. It must not say that a complimentary guest allowance was exceeded.
4. **Move-in / move-out:** enter a unit number with approved fixtures for both forms. Confirm the corresponding approved status and date range are visible.
5. **Renovation permit:** enter a unit with an approved renovation fixture. Confirm the approved status, date range, contractor name, and contractor mobile are visible.

Repeat the five-purpose review after switching to Arabic. Confirm status labels, field labels, and failure messages remain legible and do not expose National ID/Iqama.

## 3. Unified scanner credentials

From the Scanner tab, perform three separate checks:

1. Present a real Guest Pass QR/barcode to the physical device camera, if hardware is available. Record the camera/device and the visible result.
2. Present a real paid Guest Day Pass barcode to the physical device camera, if hardware is available. Record the visible result.
3. Present a real Waha credential QR/barcode to the physical device camera, if hardware is available. Record the visible result.

If the camera is unavailable, tap **Scan credential**, record the exact camera fallback message and screenshot, then use the manual-entry field only to verify the live server-side classifier. Mark the physical barcode path **Manual UAT required**, not automated-pass.

For manual-entry fallback, repeat the three credential types with known development values and record the visible valid/not-valid decision and minimum result fields.

## 4. Real-time 15-minute inactivity check

This is a separate product-owner check from the automated browser-clock proof.

1. Sign in as a guard and open Security Gate.
2. Leave the phone/browser untouched while doing unrelated work; do not refresh, navigate, or interact with the portal.
3. After at least 15 minutes of inactivity, return to the tab.
4. Confirm the guard session has ended and the protected gate page is replaced by the Clerk sign-in screen. Confirm returning to the portal requires authentication again.
5. Record the actual start time, return time, device/browser, and screenshot.

The automated evidence uses browser-clock advancement only to avoid waiting 15 wall-clock minutes. This manual path verifies the same timeout under real elapsed time.

## Evidence references

- Automated real guard walkthrough: `evidence/security-guard/SG1-SG5-Real-Guard-Walkthrough-2026-08-25.md`
- Automated camera-unavailable fallback: `.../00-camera-unavailable-in-headless-uat.png`
- Automated idle-timeout result: `.../08-guard-signed-out-after-idle-timeout.png`