# Waha audit-only finding 6 — database cardinality

**Status:** code-audit candidate only; not runtime-confirmed; not remediated.

Approval inserts Credential 1 and Credential 2 in application code, but the
database does not prove exactly two credentials or uniqueness of application
plus credential index. Missing or duplicate credentials may remain possible
under concurrency or direct/manual writes.

**Required proof before any remedy:** read-only catalog proof plus isolated
concurrent approval and direct-write rejection tests against the actual
development schema.
