# Go-Live Workbook walkthrough — Section C (Tenant)

**Result:** returned to manual. No tenant lifecycle check is claimed as automated.

The requested sequence requires distinct real Clerk identities for T2 (verified owner), T3 (tenant claimant), and ADMIN; a wrong-owner-ID refusal; an owner-only approval; and owner-only document/announcement fixtures. The current reusable E2E identities are not a safe, complete reproduction of that three-session lifecycle. Replacing it with API assertions would violate the walkthrough instruction.

| Workbook ID | Manual reason |
|---|---|
| C1–C3 | Requires a fresh tenant claim against the named owner’s unit and both wrong/correct National-ID entries. |
| C4 | Requires the same submitted tenancy in the admin UI so the refusal is visible, not merely an API 403. |
| C5 | Requires the actual owner UI to approve that same tenancy. |
| C6 | Requires the approved T3 tenant session to show the landlord-directed Contact HOA refusal. |
| C7 | Requires an owners-only document fixture visible to owner but not T3. |
| C8 | Requires resident- and owner-audience announcement fixtures and the approved T3 session. |

**Deliberate refusal still required manually:** C4 — an administrator must be visibly refused when attempting tenancy approval.
