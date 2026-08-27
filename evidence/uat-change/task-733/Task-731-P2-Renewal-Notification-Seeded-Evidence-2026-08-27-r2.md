# Task 731 P2 renewal-notification seeded evidence — r2

## Result

PASS. Vitest ran the seeded lifecycle, rendered-message, and enqueue-failure suites: 3 files, 82 tests, 82 passed.

## Seeded date/lifecycle proof

- Fake clock: `2099-01-01T08:00:00Z`.
- A/B boundaries: 30, 14, 7, and 1 days; tenant A and landlord B each emit mandatory email and push.
- Submission stops further B and creates C immediately.
- C repeats exactly after two days while pending.
- Approval stops C and carries the lease end forward.
- Pending expiry suspends the tenant while C continues.
- At 30 elapsed days C stops while suspension remains; the stale state is exposed to the admin attention contract.
- Completed move-out/release stops A, B, and C.

## Actual rendered A/B/C content

Variables used by the rendering proof include unit `A 101` and date `2099-02-01`.

**A English:** “Your tenancy at A 101 ends on 2099-02-01. To stay, ask your landlord for a renewed Ejar contract and submit it in the portal before 2099-02-01…”

**A Arabic:** “ينتهي عقد إيجارك في الوحدة A 101 بتاريخ 2099-02-01. للبقاء، اطلب من المالك عقد إيجار مُجددًا…”

**B English:** “The tenancy at your unit A 101 ends on 2099-02-01. If you are renewing, please provide your tenant with the renewed Ejar contract…”

**B Arabic:** “ينتهي عقد الإيجار في وحدتك A 101 بتاريخ 2099-02-01. إذا كنت تنوي التجديد، يرجى تزويد المستأجر بعقد إيجار المُجدد…”

**C English:** “Your tenant at A 101 has submitted a renewed lease and it is waiting for your approval. Their portal access and Waha Pass will stop working on 2099-02-01 unless you approve it…”

**C Arabic:** “قدّم المستأجر في وحدتك A 101 عقد إيجار مُجددًا وهو بانتظار موافقتك. سيتوقف وصوله إلى البوابة وبطاقة الواحة في 2099-02-01 ما لم تعتمده…”

## Recipient/channel proof

- A: tenant user id 2; email + push; mandatory.
- B/C: landlord user id 1; email + push; mandatory.
- Invalid/missing Clerk locale falls back to Arabic.

## Deliberate refusal

The submission-window test asserts rejection at 31 days before expiry and on the expiry date. The test passes only because the invalid submissions reject.

## Retained files

- `Task-731-P2-seeded-lifecycle-source-r2.ts`
- `Task-731-P2-rendered-message-source-r2.ts`
- `Task-731-P2-seeded-vitest-output-r2.txt`