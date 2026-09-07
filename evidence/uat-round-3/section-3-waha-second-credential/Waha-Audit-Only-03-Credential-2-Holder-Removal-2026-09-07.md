# Waha audit-only finding 3 — Credential 2 holder removal

**Status:** code-audit candidate only; not runtime-confirmed; not remediated.

Household and tenancy removal paths are not proved to invalidate or detach an
active Credential 2 held by the departing resident. A removed resident may
retain a credential that still passes downstream status checks.

**Required proof before any remedy:** remove a marked Credential 2 holder
through each supported exit path and read back application, credential, gate,
booking, and household state.
