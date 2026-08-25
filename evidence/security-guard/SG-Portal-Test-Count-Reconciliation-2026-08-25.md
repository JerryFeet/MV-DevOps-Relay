# Security Guard portal test-count reconciliation

**Evidence date:** 2026-08-25  
**Comparison requested:** portal suite from 1,374 tests to 1,346 tests before the guard/admin timeout correction.

## Net reconciliation

The reported reduction was **28 tests**. It was not a single unexplained deletion: five files lost a net 36 assertions during the guest-verification privacy refactor, while eight assertions were added later.

| File | Net change | Reason |
| --- | ---: | --- |
| `guestPassSponsorEdgeCases.test.tsx` | -7 | Sponsor identity/avatar rendering was removed from the public guest result; two privacy-minimized result tests replaced nine legacy assertions. |
| `guestStatusDisplayArabic.test.tsx` | -4 | Two Arabic verdict/date tests replaced six tests that exposed sponsor, unit, plate, and visit-reason detail. |
| `sponsorAvatarFallback.test.tsx` | -15 | Entire avatar fallback file retired with the removed sponsor/avatar rendering path. |
| `wahaPassResultCard.test.tsx` | -5 | Retired same-day guest-count/cap-warning display assertions. |
| `wahaStatusDisplay.test.tsx` | -5 | Retired same-day guest-count/cap-warning display assertions. |
| `gateEntryExitLog.test.tsx` | +1 | Added count-based Day Pass display/no-movement-control coverage. |
| `gateSession.test.ts` | +2 | Added shared-device guard idle-expiry and cleanup coverage. |
| `unitVerificationArabicLayout.test.ts` | +5 | Added tenant-verification Arabic-layout coverage. |
| **Total** | **-28** | **-36 retired net assertions + 8 later additions.** |

## Retired assertion names, per file

### `guestPassSponsorEdgeCases.test.tsx`

- hides the sponsor row (empty string and null are both falsy)
- does not throw when sponsorName is an empty string and imageUrl is null
- still renders the guest name in the detail card
- shows the sponsor row when imageUrl is present (imageUrl is truthy)
- renders an `<img>` element when imageUrl is set (SponsorAvatar image branch)
- the rendered `<img>` src contains the sponsor image URL
- does not throw when sponsorName is an empty string and imageUrl is a non-empty string
- shows the guest name in the detail card
- hides the sponsor row when both sponsorName and sponsorImageUrl are null

### `guestStatusDisplayArabic.test.tsx`

- shows the Arabic approved label when valid=true
- shows the Arabic expired label when status is PASS_EXPIRED
- shows the Arabic sponsor label when sponsorName is set
- shows the Arabic sponsor-unit sub-label when sponsorUnitNumber is set
- shows the Arabic vehicle-plate label when vehiclePlate is set
- shows the Arabic reason label when reasonForVisit is set

### `sponsorAvatarFallback.test.tsx`

All 15 assertions in this retired avatar/initial fallback file were:

- renders "?" when both imageUrl and name are null
- renders "?" when imageUrl is null and name is undefined
- renders "?" when imageUrl is null and name is an empty string
- does not render an `<img>` when imageUrl is null and name is null
- renders "AK" for name "Ahmed Khalid" when imageUrl is null
- renders "AK" for name "Ahmed Khalid" when imageUrl is undefined
- uses the first two words only (slices to 2 initials)
- upper-cases the initials
- renders a single initial for a single-word name
- does not render an `<img>` when only a name is provided
- renders an `<img>` with the correct src when imageUrl is a non-empty string
- does not render the initials fallback div when imageUrl is provided
- renders an `<img>` even when name is null (imageUrl takes priority)
- sets a sensible alt attribute when name is provided
- falls back to alt="Sponsor" when name is null

### `wahaPassResultCard.test.tsx`

- does not show the limit-reached warning when count is below 4
- shows the limit-reached suffix when sameDayGuestCount is 4
- shows the limit-reached suffix when sameDayGuestCount exceeds 4
- displays the count alongside the /4 cap
- shows the Arabic limit-reached suffix when count is 4

### `wahaStatusDisplay.test.tsx`

- shows the same-day guest count
- shows the limit-reached warning when sameDayGuestCount is at least 4
- does not show the limit warning when sameDayGuestCount is 3
- shows the Arabic limit warning when sameDayGuestCount is at least 4
- does not show the Arabic limit warning when sameDayGuestCount is 3

## Current state

The guard/admin timeout correction adds two tests, so the current portal suite is **1,348 tests in 65 files**, all passing.
