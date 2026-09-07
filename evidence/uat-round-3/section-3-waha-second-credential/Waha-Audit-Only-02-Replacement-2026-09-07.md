# Waha audit-only finding 2 — replacement

**Status:** code-audit candidate only; not runtime-confirmed; not remediated.

Replacement review, payment initiation, and the provider callback do not yet
have a proved shared lock/idempotency boundary. Concurrent or replayed
completion may issue twice or leave application, old credential, replacement
credential, and payment state partially aligned.

**Required proof before any remedy:** deterministic payment outcome, concurrent
callback replay, and atomic readback of payment/application/credential state.
