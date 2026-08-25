# Go-Live Workbook walkthrough — Section G (release)

**Scope respected:** G1 and G2 dry-run only. G3–G7 were not executed.

The authenticated admin screen showed the Tenancy releases panel, but there was no safely identifiable development fixture case to preview. The walkthrough intentionally refused to preview or release an untrusted account, and it never located or clicked an execution control.

| Workbook ID | Result | Reason |
|---|---|---|
| G1 | Manual | No safe E2E-marked lifecycle case was visible for a browser preview. |
| G2 | Manual | No safe plan could be opened to compare booking counts and paid value. |
| G3–G7 | Not executed | Explicitly excluded: destructive release/account flow. |

**Required deliberate refusal:** preserved. The automation treats an unmarked/untrusted release subject as ineligible and does not open or execute it.