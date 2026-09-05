# Raw-SQL-only database protections

Drizzle declares the foreign keys, delete policies, ordinary indexes, and
expressible checks from the Stage 6A release work. The following protections
remain intentionally owned by forward-only SQL migrations because they use
PostgreSQL expressions or trigger functions that cannot be safely represented
by the current Drizzle schema generator.

| Protection | Migration owner | Why it remains raw SQL | Verification |
| --- | --- | --- | --- |
| `users_staff_unitless_check` | `0036_stage6a_common_unit_integrity.sql` | Cross-column role implication check on an enum-backed role. | `scripts/assert-h4-schema-protections.sh` |
| `units_system_unit_identity_check` | `0036_stage6a_common_unit_integrity.sql` | Cross-column generated-address identity check for the one system unit. | `scripts/assert-h4-schema-protections.sh` |
| `units_one_system_unit` | `0036_stage6a_common_unit_integrity.sql` | Predicate/expression unique index: unique `(is_system)` only where `is_system`. | `scripts/assert-h4-schema-protections.sh` |
| `protect_hoa_common_system_unit()` | `0036_stage6a_common_unit_integrity.sql` | PL/pgSQL trigger function that blocks deletion, demotion, and rename. | `scripts/assert-h4-schema-protections.sh` |
| `protect_hoa_common_system_unit_trigger` | `0036_stage6a_common_unit_integrity.sql` | `BEFORE UPDATE OR DELETE` trigger invoking the protection function. | `scripts/assert-h4-schema-protections.sh` |
| `reject_occupancy_append_only_mutation()` | `0049_occupancy_core.sql` | Shared PL/pgSQL rejection function for immutable occupancy-evidence rows. | `scripts/assert-h4-schema-protections.sh` |
| `trg_occupancy_correction_operations_immutable` | `0051_w14_occupancy_correction_operations.sql` | `BEFORE UPDATE OR DELETE` append-only trigger for controlled occupancy-correction evidence. | `scripts/assert-h4-schema-protections.sh` |
| `trg_occupancy_correction_operation_supplements_immutable` | `0052_occupancy_correction_operation_supplements.sql` | `BEFORE UPDATE OR DELETE` append-only trigger for immutable final-state supplements. | `scripts/assert-h4-schema-protections.sh` |

The assertion script fails if any listed database object is absent or altered.
These objects must be kept in the forward-only migration ledger and verified
again during H5’s empty-database replay.