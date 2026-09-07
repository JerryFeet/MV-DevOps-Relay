# Round 3 Section 7 — wording and workflow delivery

**Date:** 2026-09-07  
**Requirements:** C-1 through C-6

## C-1 and C-2

- The fifth-resident message remains:
  **“The number of residents you add requires HOA review.”**
- Rejection requires a reason and retains the standard text:
  **“HOA cannot verify. Further proof is required.”**
- These journeys were previously accepted with Section 6 and remain guarded by
  the permanent resident browser suite.

## C-3 — move-out method

Pre-fix Development-browser reproduction reached the real Move-Out Permit
dialog and failed because no Move method control existed.

Delivered:

- mandatory **Self-move / Moving company** choice;
- self-move hides and clears company details;
- moving-company choice requires both name and contact;
- API independently validates the choice and conditional fields;
- English and Arabic labels.

The permanent C-3 Playwright regression passed after implementation.

## C-4 — approval-queue email routing

All actual approval-queue producers now use one queue-specific email contract
whose destination is exactly `approver@madainvillagehoa.com`, independent of
the configurable notification/contact address:

- permit applications;
- owner manual verification;
- tenant linkage and reconciliation;
- additional-vehicle requests;
- Waha Pass applications and approval-routed replacement work;
- ownership-change paths;
- portal-help approval routing.

Guest pre-registration and lost-card information remain informational alerts,
not approval queue items.

Focused regressions prove the exact destination, producer enumeration, and
non-blocking behavior. Actual external delivery was not claimed because no
SMTP capture/service is configured in Development; the transport remains
non-blocking when SMTP is unavailable.

## C-5 — facility approval toggle

Pre-fix handler reproduction proved `requiresApproval` was stored and shown but
ignored by booking creation.

Delivered:

- approval-required resident bookings start `pending`;
- checkout cannot be opened while approval is pending;
- free bookings become `confirmed` after admin approval;
- priced bookings become `pending_payment` after admin approval;
- facilities without the toggle retain their existing immediate/payment flow.

The permanent two-session Development-browser journey passed and proves the
resident cannot see Pay Now before approval, then can see it for the priced
booking after admin approval.

## C-6 — Unit Registry

Delivered:

- one admin parking editor rather than the duplicate;
- normalized `parking_lots` rows are the registry count/source;
- the ownership field is accurately labelled **Title Reference**;
- the booking list is independently focusable and scrollable while retaining
  every projected row;
- selected unit detail is resolved from the current query result, preventing a
  filtered/refetched unit sheet from retaining stale summary data.

The Development-browser fixture used one normalized parking lot and twenty
future confirmed bookings across twenty distinct facilities, satisfying the
database active-booking invariant. The filtered API returned all twenty and
the browser reached both ends of the bounded list.

## Browser evidence

- `Section-7-C5-Post-Fix-Approval-Then-Payment-2026-09-07.png`
- `Section-7-C6-Post-Fix-Scrollable-Bookings-2026-09-07.png`
- `Section-7-8-Post-Fix-Browser-PASS-2026-09-07.txt`
- `Section-7-8-Final-Portal-Preview-2026-09-07.jpg`
- `Section-7-8-Full-E2E-Reconciliation-2026-09-07.md`

Final combined browser result: **6 passed**.
