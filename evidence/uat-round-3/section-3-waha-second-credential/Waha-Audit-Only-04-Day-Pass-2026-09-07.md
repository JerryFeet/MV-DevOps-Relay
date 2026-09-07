# Waha audit-only finding 4 — day pass

**Status:** code-audit candidate only; not runtime-confirmed; not remediated.

Self-read, creation/payment, and gate verification derive
purchaser/guest/unit/lifecycle scope differently. No route-parity proof
establishes that stale or wrong-unit day passes are hidden and rejected
consistently.

**Required proof before any remedy:** one isolated paid day pass exercised
through self-read, wrong-unit rotation, and both gate-verification surfaces.
