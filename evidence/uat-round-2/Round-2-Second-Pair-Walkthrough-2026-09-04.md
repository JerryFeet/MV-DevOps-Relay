# UAT Round 2 — Second-Pair Walkthrough Evidence

- Date: 2026-09-04 (Asia/Riyadh)
- Environment: Development only
- Workbook: Madain Village UAT Round 2
- Scope walked: Part 2 R1–R30; Part 3 N1–N17; Part 4 O1–O6; Part 5 typed-entry G5–G15
- Explicitly not attempted: physical scans G16–G18, Arabic physical-device repetition G19, real 15-minute idle G20, live-session suspension G21, Part 6 release, all Part 7 actions
- Production/deployment/schema mutation: none

## Evidence method

A real Playwright browser used Clerk-authenticated resident, administrator, Operations Manager, and guard sessions against Development. Stateful resident/booking work used disposable unit Q7M4 (database unit id 13), never W14. Existing isolated CE34 gate fixtures were used for valid typed permit and Waha lookups. Fixture-only writes were inventoried and removed after the final browser step. Screenshot IDs are retained in the observations below.

## Part 2 — Re-tests

| Ref | Result | Browser observation |
|---|---|---|
| R1 | PASS | Q7M4 Vehicle Registration card visibly says `Underground Parking`; screenshot `41ugmi`. |
| R2 | PASS | Q7M4 admin Unit Registry detail shows parking type `Underground Parking`; current detail screenshot `tg6jur`. |
| R3 | PASS | Arabic owner vehicle UI visibly says `موقف تحت الأرض`; screenshot `ye4952`. |
| R4 | PASS | Add Household Member form visibly marks Gender, Date of Birth, National ID/Iqama, Nationality, and Phone required; Email optional; screenshot `0s594p`. |
| R5 | PASS | After Child + under-18 DOB, exact note appeared: `For residents under 18, you may provide the National ID or Iqama number of the registered father or mother.` Bilingual guidance and Guardian checkbox visible; screenshot `06s2aa`. |
| R6 | PASS | Clicking outside the resident modal left it open (`residentDialogAfterOutside 1`); screenshot `4jsx41`. |
| R7 | PASS | Register Guest modal has required `ID / Iqama Number *`; screenshot `bz3yu0`. |
| R8 | PASS | Guest page action is exactly `Purchase Waha Guest Day Pass`; page evidence `jjybck`, dialog `axv6or`. |
| R9 | PASS | Exact disclaimer visible: `Every unit can bring up to 4 guests to the facility area for free. Exceeding 4 guests, a guest day pass must be purchased. Guests are not allowed to use the Clubs.` Screenshot `axv6or`. |
| R10 | UNABLE | View-only PDF opened a real `blob:` popup titled `Test 2 All View Only`, but the popup had `bodyLen 0` and no popup screenshot/layout was captured. I cannot honestly confirm visible document content. |
| R11 | PASS | After closing the view popup, parent Documents page returned with `blockedText 0` and no blocked-popup error; screenshot `supcn6`. |
| R12 | UNABLE | Both available Q7M4 documents were explicitly `View Only` with only View controls; no downloadable document was present. |
| R13 | PASS | Q7M4 owner Residents list immediately showed the created tagged child alongside Tenant and Owner; screenshot `frnq1g`. |
| R14 | PASS | Admin Q7M4 Unit Registry refreshed to 3 residents and showed the same tagged child; screenshot `exf9u2` / current `tg6jur`. |
| R15 | UNABLE | Q7M4 resident UI exposes `Resend invite` for existing Tenant/Owner only; no open invitation-link control was available for the new child, and I did not create an unneeded extra resident solely to guess at an unavailable workflow. |
| R16 | UNABLE | No safe visible control existed to invite a second portal resident on Q7M4. Existing Tenant and Owner already have Portal access; no second-invitation attempt was made. |
| R17 | PASS | Resident cards visibly show mobile numbers, including child `[redacted mobile]` and Tenant/Owner mobiles; screenshot `frnq1g`. |
| R18 | PASS | Created tagged Q7M4 complaint `R2UAT-P3-20260904-Q7M4-R18 Reject`, then admin-scoped Reject only to that row. It changed to Rejected and displayed bilingual response: `Dear sender, thank you for contacting us. This request is not within the responsibility of the owner association. عزيزي المُرسِل، شكراً لتواصلك معنا. هذا الطلب ليس ضمن مسؤولية جمعية الملاك.` Screenshot `6zr20d`. |
| R19 | PASS | Created tagged Q7M4 complaint `R2UAT-P3-20260904-Q7M4-R19 Defer`, then admin-scoped Defer to Maintenance only to that row. It changed to Deferred to Maintenance with bilingual maintenance-channel response and `Updated` notification; screenshot `pn681a`. |
| R20 | PASS | Admin locator count for `Mark as read` was `0`; no such control was visible. Evidence screenshot `gpis9q`. |
| R21 | PASS | Refreshed admin Communications Inbox showed `Communications Inbox (5)` and five visible rows; two were the tagged pending rows before action and three pre-existing completed rows. Screenshot `c286a3`. |
| R22 | PASS (process exception) | Portal Help rendered as expandable rows as required. While proving expansion, the browser accidentally opened one pre-existing W14 row; no reply, redirect, or mutation was performed. Screenshot `gpis9q`. |
| R23 | PASS | Key Contacts & Notices drawer contained exactly three contacts: `Security Supervisor`, `Technical Maintenance (Common Areas)`, and `Developer Contact`; all were Not yet configured. Screenshot `khfy7l`. |
| R24 | PASS | Admin navigation displayed pending badge `1` beside Admin Dashboard; screenshots `0lbf30` and `mr7vxt`. |
| R25 | PASS | After collapsing navigation, the toggle became `Expand navigation` and `collapsedBadgeCount 1`; badge remained visible. Screenshot `rn7i16`. |
| R26 | PASS | Admin Facility Booking > Admin tab displayed `All Bookings` with 9 records and unit values including Q7M4 and 14; screenshot `w2y5dl`. |
| R27 | PASS | Same All Bookings list visibly used `Common Area` for common-area bookings rather than a unit number; screenshot `w2y5dl`. |
| R28 | UNABLE | Separate disposable unverified identity `[redacted test email]` reached Owner Verification, but Building/Tower options were A–Z/CA/CB/CD/CE and Unit Number options numeric 1–34; Q7M4 was not selectable. No claim was submitted and no fixture was changed. Screenshots `znku9t`, `gumdpz`, `boo2kr`. |
| R29 | UNABLE | Q7M4 tenant route showed an already approved `Verified Tenant` state for Unit Q7M4, with no verification form, underground-parking checkbox, or submit control. Screenshot `5i8aev`. |
| R30 | FAIL | Q7M4 admin detail has a separate Owner section, but the expanded `Household Residents 3` section also includes `R2UAT-P3-20260904-Q7M4 Owner` with role `owner`; this contradicts “owner ONLY — not as a household resident.” Current screenshot `tg6jur` visibly shows Owner card and Household Residents cards including the owner. |

## Part 3 — New features

| Ref | Result | Browser observation |
|---|---|---|
| N1 | PASS | A prior-month August allowance claim was pre-seeded on the disposable unit; the September booking screen still visibly said the monthly free booking was available, would apply automatically, and renews Thu Oct 1. This proved month separation without using W14. Screenshot `6446hp`. |
| N2 | PASS | First September paid Majli booking was immediately confirmed with toast `Booking submitted!` / `Your booking is confirmed.`; review showed 20.00 SAR reduced to 0.00 and no external payment UI. Minor inconsistency: final button was labeled `Confirm & Pay 20.00 SAR` despite zero total. 319ec9, 2wukws |
| N3 | PASS | Cancellation dialog explicitly warned: `Cancelling will NOT restore your free allowance for this month.` wrm95i |
| N4 | PASS | Cancelled free booking retained Monthly Free Booking and 0.00 SAR; banner/toast showed the used state. tyrxbc |
| N5 | PASS | Second Majli attempt showed normal 20.00 SAR total and `Confirm & Pay 20.00 SAR`; stopped before submission/payment as required. q93wnx |
| N6 | PASS | H5 Bookable Community Hall (facility A) booked for Sep 5, 10:00–11:00 at 0.00 SAR and immediately confirmed. 6swvnr, p6z3kc |
| N7 | PASS | Second active H5 attempt on another day was refused with exact toast: `ACTIVE_UNIT_FACILITY_BOOKING_EXISTS: this unit already has an active booking for this facility.` jl69aj |
| N8 | UNABLE | Majli (facility B) review was available at 20.00 SAR, but submission returned `Payment gateway unavailable` / `Payment gateway is not configured. Please contact the HOA office.` No external payment was attempted. The failed path left an unexpected `pending_payment`/Unpaid booking row. zvgkxn, 0c69bm |
| N9 | FAIL | Tenant/second credential holder attempt was refused, but the exact reason was the broader same-day rule (`Your household already has a booking today...`), not the required per-unit/per-facility error. The tenant was visibly `verified_tenant` on Unit Q7M4. p55gal, sieksc, 6b2acb |
| N10 | PASS | After cancelling H5, rebooking H5 on Sep 7 succeeded and immediately confirmed. A Sep 6 retry was first blocked by the separate same-day pending-Majli side effect; the Sep 7 retry isolated and passed rebooking. ihp7ip, lerzkn |
| N11 | PASS | Admin Unit Registry opened Q7M4. Building and unit number were editable, and parking had dedicated Admin Tools controls. Owner, tenant, verification, and household residents were display-only. Screenshot `exf9u2`. |
| N12 | PASS | Added a second Underground Parking entitlement through the UI. The save completed with `Parking lot added.` Screenshot `712hhd`. |
| N13 | FAIL | Immediately after the save, Audit History said `No audit history found`. After a full detail refresh, the audit row appeared with actor/date-time, action `parking lot added`, field `parking_lot`, old `null`, and the new value. Screenshot `exf9u2`. |
| N14 | FAIL | Reducing parking below the active vehicle count was blocked, but the UI exposed a raw backend SQL failure from the parking-capacity query instead of a clear reason. The entitlement remained active. Screenshot `k49wfb`. |
| N15 | PASS | Ownership, verification, owner/tenant identities, and household residents were visible as non-editable records; no edit controls were exposed for them. Screenshot `exf9u2`. |
| N16 | PASS | The owner added an under-18 child through the Residents UI using the guardian-ID option. The UI confirmed `Household member added!` and displayed the guardian-ID label. Screenshot `uc5nzz`. |
| N17 | PASS | Refreshed admin Unit Registry showed the child and explicitly marked the identifier as the guardian's ID. Screenshot `exf9u2`. |

## Part 4 — Operations Manager

| Ref | Result | Browser observation |
|---|---|---|
| O1 | PASS | The designated identity rendered `/portal/admin` as `Operations Manager` / `Administrator Account`, with the Admin Dashboard, same staff navigation, queue panels, and badge `1`. Screenshot `vr2b61`. Initial blank render resolved after bounded wait; body length was 68186. |
| O2 | FAIL | Q7M4 owner Vehicle Registration was used to create a uniquely tagged additional-vehicle approval submission: Make `R2UAT-P3-20260904-Q7M4-O2`, Model `ApprovalTest`, Year `2024`, Color `R2UAT`, Plate `R2UAT-P3-20260904-Q7M4-O2-PLATE`, file `R2UAT-P3-20260904-Q7M4-O2-istimara.pdf`. The form explicitly stated this was an additional vehicle request requiring HOA approval. Submit entered `Saving...`, then the API returned HTTP 409. A controlled retry with Underground Parking checked captured the exact response: `{"error":"PARKING_ENTITLEMENT_EXCEEDED","message":"This unit has 1 underground parking lot(s) registered and 1 vehicle(s) already assigned to them. Please select surface parking, or contact the HOA if the allocation is incorrect."}`. The dialog stayed open with an Error notification and no submission row. Screenshot `u7ftaj`. |
| O3 | UNABLE | No O2 approval row was created, so OPS inbox, recipient event comparison, and external email/push delivery could not be exercised honestly. No email or push delivery was claimed. |
| O4 | UNABLE | No approval event existed to compare against the ordinary E2E Admin account; no notification comparison was performed. |
| O5 | UNABLE | No uniquely tagged Q7M4 approval item existed for the OPS identity to approve. No pre-existing approval item was substituted. |
| O6 | UNABLE | No created item existed to reopen as ordinary ADMIN and verify already-decided/no-second-approval behavior. |

## Part 5 — Typed gate entry and permit checks

| Ref | Result | Browser observation |
|---|---|---|
| G5 | FAIL | Typed valid-format `CE34` through Residents → Unit; search was enabled, but the UI returned `No matching resident found` instead of `Gate Fixture Resident`. Read-only inventory showed the supplied fixture exists as `users.id=2139`, `Gate Fixture Resident`, `unit_number='34'`, `national_id='[redacted National ID]'`, while `units.id=11` is building `CE`, unit `34` and no matching `residents` row exists. The Guard backend compares the normalized query `CE34` to `users.unit_number='34'`, producing the mismatch. Screenshot `apbbg6`. |
| G6 | PASS | Typed National ID `[redacted National ID]`; visible result was `Gate Fixture Resident`, `Unit: 34`, `owner`. The visible result DOM exposed no email or national ID; the ID remained only in the input field. Screenshot `szfa3b`. Network payload was not independently captured, so this is a visible-DOM privacy verification rather than a raw-payload assertion. |
| G7 | PASS | Typed guest code `r2uat-gate-guest-token-q7m4`; visible result was `VALID — ENTRY PERMITTED` / `APPROVED`, Guest `R2UAT Gate Visitor Q7M4`, Host `Gate Fixture Resident`, Unit `34`, Visit date `2026-09-04`, Vehicle plate `R2UAT-GUEST`. Screenshot `ed4xga`. |
| G8 | FAIL | Typed paid Guest Day Pass barcode `93`; visible result showed `VALID — ENTRY PERMITTED`, three guests, host, unit, paid `Yes`, and vehicle plate, but the workbook-required date was absent from the result. Screenshot `ncpgvn`. |
| G9 | UNABLE | Submitted `E2E-GATE-WAHA-001` after resetting Scanner, but the captured state remained the previous guest result; no Waha holder/status/result was displayed. Therefore I cannot claim valid/revoked or no-photo behavior. Screenshot `35w8ja` shows the unchanged prior result and no photo. |
| G10 | PASS | The supplied invalid code `R2UAT-P3-20260904-Q7M4-GATE-INVALID` was tested via typed Scanner entry. It returned `NOT A VALID MADAIN VILLAGE CREDENTIAL` / `NOT VALID MADAIN VILLAGE CREDENTIAL`. Screenshot `5x2jqa`. |
| G11 | PASS | Typed `CE34` under Move-In; visible result `APPROVED MOVE-IN PERMIT`, Unit `CE34`, dates `2026-09-04 – 2026-09-05`. Screenshot `i3paam`. |
| G12 | PASS | Typed `CE34` under Move-Out; visible result `APPROVED MOVE-OUT PERMIT`, Unit `CE34`, dates `2026-09-04 – 2026-09-05`. Screenshot `mykmg2`. |
| G13 | PASS | Typed `CE34` under Renovation; visible result `APPROVED RENOVATION PERMIT`, Unit `CE34`, dates `2026-09-04 – 2026-09-06`, Contractor `E2E Gate Works`, Mobile `[redacted mobile]`. Screenshot `ea6hji`. |
| G14 | PASS | Plate Lookup typed `R2UAT-P3-20260904-Q7M4-PLATE` returned `REGISTERED VEHICLE`, resident `R2UAT-P3-20260904-Q7M4 Owner`, unit `Q7M4`, vehicle `Marker · R2UAT · blue`. No photo was shown. Screenshot `9h92gc`. |
| G15 | PASS | Plate Lookup typed `R2UAT-P3-20260904-Q7M4-NONEXISTENT-PLATE` returned explicit `NOT REGISTERED`; result was not blank. Screenshot `pa40yp`. |

## Findings requiring Round 2 attention

1. **N2:** The free booking was correctly reduced to SAR 0 and confirmed without payment, but the final button still said “Confirm & Pay 20.00 SAR.”
2. **N8:** A concurrent booking for facility B reached the normal-price path but could not complete because the payment gateway is not configured. The failed request left a pending-payment booking; it was removed during cleanup.
3. **N9:** The second credential holder was refused by the broader same-day household rule, not the required active-unit/facility rule.
4. **N13:** Unit audit history existed after reload but did not appear immediately after save.
5. **N14:** Parking reduction was blocked, but the UI exposed a raw backend SQL error instead of the required clear capacity explanation.
6. **R30:** The verified owner was also listed under Household Residents, contrary to owner-only presentation.
7. **O2:** The tagged additional-vehicle approval request was rejected before submission because the fixture’s underground allocation was occupied; O3–O6 were therefore not honestly testable.
8. **G5:** Unit lookup with valid CE34 returned no resident because the gate query normalized CE34 while the fixture user stored unit number 34.
9. **G8:** The paid day-pass result showed approved/paid/guest count/host/unit, but no date was visible in the captured result.
10. **G9:** Typed Waha submission did not transition away from the prior credential result, so validity/revocation/no-photo behavior could not be claimed.

## Process exception

While checking R22 expandability, the browser opened one pre-existing W14 Portal Help row. It performed no reply, redirect, update, or other write. The private before/after W14 comparison below proves the database state remained byte-identical.

## Cleanup proof

### Disposable records removed

- Disposable Q7M4 unit: removed.
- Three Q7M4 database users and one Operations Manager first-sign-in user: removed.
- Four corresponding Development Clerk identities: deleted successfully.
- Q7M4 residents, Waha application and two credentials, vehicle, parking lot, five bookings (including the pending-payment artifact), two monthly allowance claims, one append-only unit audit row, two communications, and eight notification events: removed.
- Temporary gate guest, guest pass, and paid day pass: removed.
- Remaining rows matching the fixture unit, IDs, or marker: zero.

### W14 protected-state proof

The private canonical JSON snapshot includes the complete W14 unit row, verified owner and tenant rows, residents, Waha application/credentials/events, bookings, monthly allowance, vehicles, permits, and unit-audit history. Personal data is intentionally not published.

- Before SHA-256: a7950fc373dbaa30a19f5697984350e04253dcc4dcb829271a0015fcf9024398
- After SHA-256:  a7950fc373dbaa30a19f5697984350e04253dcc4dcb829271a0015fcf9024398
- Result: exact match.

### All public table counts

| Table | Before | After | Delta |
|---|---:|---:|---:|
| ai_knowledge_chunks | 0 | 0 | 0 |
| ai_knowledge_documents | 0 | 0 | 0 |
| announcement_edit_history | 0 | 0 | 0 |
| announcements | 0 | 0 | 0 |
| api_rate_limit_counters | 12 | 12 | 0 |
| bookings | 4 | 4 | 0 |
| communications | 3 | 3 | 0 |
| data_migration_corrections | 1 | 1 | 0 |
| document_folders | 3 | 3 | 0 |
| documents | 6 | 6 | 0 |
| external_identity_deletion_jobs | 0 | 0 | 0 |
| facilities | 2 | 2 | 0 |
| facility_booking_config_normalization_audit | 0 | 0 | 0 |
| facility_operating_hours_conflicts | 0 | 0 | 0 |
| guest_entry_exit_logs | 0 | 0 | 0 |
| guest_pass_verification_logs | 0 | 0 | 0 |
| guest_passes | 2 | 2 | 0 |
| guests | 2 | 2 | 0 |
| hoa_settings | 21 | 21 | 0 |
| household_invitations | 1 | 1 | 0 |
| monthly_booking_allowances | 1 | 1 | 0 |
| move_forms | 0 | 0 | 0 |
| notification_events | 36 | 36 | 0 |
| notification_preferences | 0 | 0 | 0 |
| ownership_change_events | 0 | 0 | 0 |
| parking_lots | 0 | 0 | 0 |
| payment_attempts | 0 | 0 | 0 |
| permits | 3 | 3 | 0 |
| portal_help_screenshot_deletion_jobs | 0 | 0 | 0 |
| portal_help_tickets | 1 | 1 | 0 |
| push_tokens | 0 | 0 | 0 |
| release_operations | 0 | 0 | 0 |
| residents | 4 | 4 | 0 |
| tenancy_lifecycles | 1 | 1 | 0 |
| tenancy_renewals | 0 | 0 | 0 |
| unit_master_data_audit | 0 | 0 | 0 |
| unit_verification_document_cleanup_retries | 0 | 0 | 0 |
| unit_verification_owner_id_attempts | 1 | 1 | 0 |
| unit_verifications | 2 | 2 | 0 |
| units | 3 | 3 | 0 |
| users | 9 | 9 | 0 |
| vehicles | 0 | 0 | 0 |
| waha_guest_day_passes | 1 | 1 | 0 |
| waha_pass_applications | 3 | 3 | 0 |
| waha_pass_credentials | 4 | 4 | 0 |
| waha_pass_events | 2 | 2 | 0 |
| waha_replacement_requests | 0 | 0 | 0 |

All 47 public table counts match; every delta is zero.

## Honest limitations

- R10–R12 were walked only to the extent supported by the available Development document fixtures and browser download/popup behavior.
- R15–R16 had no safe available portal-invitation control on the already-linked disposable unit.
- R28 could not submit because the synthetic Q7M4 reference was not available in the verification selector.
- R29 could not return the already-verified disposable tenant to the pre-submit underground-parking confirmation state without destructive fixture rewinding.
- O3–O6 were blocked by O2 producing no approval item; no pre-existing approval was substituted.
- G9 did not produce a fresh Waha result.
- G16–G21, Part 6, and Part 7 were not attempted.
