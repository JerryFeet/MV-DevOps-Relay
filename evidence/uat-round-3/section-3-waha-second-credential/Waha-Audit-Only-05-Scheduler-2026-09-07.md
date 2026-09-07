# Waha audit-only finding 5 — scheduler

**Status:** code-audit candidate only; not runtime-confirmed; not remediated.

Expiry/cleanup schedulers mutate Waha lifecycle state without deterministic
clock coverage proving the same downstream booking/day-pass consequences as
interactive revoke/release paths.

**Required proof before any remedy:** deterministic-clock execution of every
expiry pass with before/after application, credential, booking, and day-pass
readback.
