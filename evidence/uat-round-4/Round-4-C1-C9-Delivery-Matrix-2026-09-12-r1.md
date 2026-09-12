# Round 4 C-1 through C-9 delivery matrix

Date: 2026-09-12  
Canonical gate: `pnpm run round3:regression:e2e`  
Result: PASS

## Scope

This delivery closes:

- C-1 guardian mobile
- C-2 Portal Help tile
- C-3 Dalil wording
- C-4 Portal Help closure
- C-5 Waha revocation notification and confirmation
- C-6 Permits tile rename
- C-7 non-refundable wording
- C-8 standard message shown before sending
- C-9 Title Reference explained

## Delivery matrix

| Item | Delivered behavior | Permanent assertion boundary | Explicit exclusion |
|---|---|---|---|
| C-1 | Mobile Profile > Unit Info provides a bilingual guardian-ID/household entry point to the portal. Mobile does not create a disconnected guardian-ID form. | Mobile source contract verifies the translated entry point and portal destination. | Native browser handoff and authenticated portal completion are not exercised by the source contract. |
| C-2 | Portal and mobile navigation display **Portal Help** / **مساعدة البوابة** while preserving the existing route. | Portal and mobile contracts verify label and route. | API route names are unchanged. |
| C-3 | Dalil is described as **Dalil — your guide to Madain Village** / **دليل — دليلك إلى قرية مدائن**. The no-personal-records boundary remains visible. | Portal and mobile contracts verify both guide wording and privacy boundary. | No AI capability or data access was expanded. |
| C-4 | Closing a Portal Help ticket is terminal. Closed ticket history remains visible, but reply/reopen writes are rejected. | Real API route regression plus portal contract verify HTTP 409 after closure and retained Closed history. | Ticket deletion and schema changes are not covered. |
| C-5 | Admin revocation is application-level, confirms that both credentials are revoked, and discloses that both holders receive email and push. Secondary-resident lifecycle revocation now enqueues the same durable notifications. | Real HTTP API regressions assert two credential revocations and four durable outbox rows; portal contract asserts confirmation and application-level payload. | External email/push provider delivery and notification opening are not covered. |
| C-6 | Resident navigation displays **Permits & Moves** / **التصاريح والانتقال** while preserving permit routes and API identifiers. | Portal and mobile contracts verify label and route stability. | Permit workflow identifiers are unchanged. |
| C-7 | Booking confirmation states that bookings are non-refundable and that Waha revocation or residency end cancels the booking without refund. | Bilingual portal contract verifies the warning appears before submission. | Refund/payment behavior is unchanged. |
| C-8 | Portal Help shows a bilingual standard message before send: check the User Manual in Documents or ask Dalil first. | Portal contract verifies the message is adjacent to the submission controls. | Payload validation and ticket categories are unchanged. |
| C-9 | Title Reference now explains that it is the ownership/title-deed reference recorded for the unit. | Bilingual portal contract verifies helper text while preserving the raw value. | The stored value, null behavior, and schema are unchanged. |

## C-5 classification

C-5 remains part of the previously identified **Family B** divergence: direct
Waha revocation and lifecycle release/removal were separate paths to the same
authoritative revocation outcome. The secondary-resident removal path now uses
the same durable email/push event contract and idempotency keys as direct and
terminal lifecycle revocation.

The earlier direct-revocation double-winner remains a separate corrected
**Family A** race and retains its synchronized regression.

## Verification

- API typecheck: PASS
- Portal typecheck: PASS
- Mobile typecheck: PASS
- Portal preview: rendered successfully
- Mobile Expo preview: rendered the secure sign-in loading surface
- Canonical gate:
  - API: 305/305
  - Portal contracts: 22/22
  - Mobile contracts: 4/4
  - Browser: 39/39
  - Total: 370/370

No schema push, migration runner, force operation, or immutable-protection
bypass was used.