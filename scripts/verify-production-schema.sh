#!/usr/bin/env bash
set -uo pipefail

# One-shot, read-only post-Publish verification.
# This script intentionally executes catalog SELECT statements only.

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "FAIL: DATABASE_URL is not set; cannot verify the PostgreSQL catalog." >&2
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "FAIL: psql is not installed; cannot verify the PostgreSQL catalog." >&2
  exit 2
fi

query_output="$(
  psql "$DATABASE_URL" \
    -X \
    -v ON_ERROR_STOP=1 \
    -At \
    -F $'\t' \
    --pset=pager=off \
    2>&1 <<'SQL'
WITH expected_counts(check_name, expected_count) AS (
  VALUES
    ('public tables'::text, 52::bigint),
    ('public columns'::text, 685::bigint),
    ('public constraints'::text, 165::bigint),
    ('public indexes'::text, 170::bigint),
    ('public non-internal triggers'::text, 11::bigint)
),
actual_counts(check_name, actual_count) AS (
  SELECT 'public tables', count(*)::bigint
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
  UNION ALL
  SELECT 'public columns', count(*)::bigint
  FROM information_schema.columns
  WHERE table_schema = 'public'
  UNION ALL
  SELECT 'public constraints', count(*)::bigint
  FROM pg_constraint AS con
  JOIN pg_class AS c ON c.oid = con.conrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'public indexes', count(*)::bigint
  FROM pg_indexes
  WHERE schemaname = 'public'
  UNION ALL
  SELECT 'public non-internal triggers', count(*)::bigint
  FROM pg_trigger AS trig
  JOIN pg_class AS c ON c.oid = trig.tgrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND NOT trig.tgisinternal
),
protection_checks(check_name, expected_count, actual_count) AS (
  SELECT 'users.users_staff_unitless_check', 1::bigint, count(*)::bigint
  FROM pg_constraint AS con
  WHERE con.conname = 'users_staff_unitless_check'
    AND con.conrelid = 'public.users'::regclass
    AND con.contype = 'c'
  UNION ALL
  SELECT 'units.units_system_unit_identity_check', 1::bigint, count(*)::bigint
  FROM pg_constraint AS con
  WHERE con.conname = 'units_system_unit_identity_check'
    AND con.conrelid = 'public.units'::regclass
    AND con.contype = 'c'
  UNION ALL
  SELECT 'units_one_system_unit partial unique index', 1::bigint, count(*)::bigint
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'units'
    AND indexname = 'units_one_system_unit'
    AND indexdef LIKE '%UNIQUE INDEX units_one_system_unit%'
    AND indexdef LIKE '%WHERE is_system%'
  UNION ALL
  SELECT 'protect_hoa_common_system_unit function', 1::bigint, count(*)::bigint
  FROM pg_proc
  WHERE proname = 'protect_hoa_common_system_unit'
    AND pg_function_is_visible(oid)
  UNION ALL
  SELECT 'protect_hoa_common_system_unit_trigger on public.units', 1::bigint, count(*)::bigint
  FROM pg_trigger AS trig
  WHERE trig.tgname = 'protect_hoa_common_system_unit_trigger'
    AND trig.tgrelid = 'public.units'::regclass
    AND NOT trig.tgisinternal
  UNION ALL
  SELECT 'monthly_booking_allowances table', 1::bigint, count(*)::bigint
  FROM pg_class AS c
  WHERE c.oid = 'public.monthly_booking_allowances'::regclass
    AND c.relkind IN ('r', 'p')
  UNION ALL
  SELECT 'unit_master_data_audit table', 1::bigint, count(*)::bigint
  FROM pg_class AS c
  WHERE c.oid = 'public.unit_master_data_audit'::regclass
    AND c.relkind IN ('r', 'p')
  UNION ALL
  SELECT 'monthly allowance unit/month unique index', 1::bigint, count(*)::bigint
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'monthly_booking_allowances'
    AND indexname = 'uq_monthly_booking_allowance_unit_period'
    AND indexdef LIKE '%UNIQUE INDEX uq_monthly_booking_allowance_unit_period%'
    AND indexdef LIKE '%(unit_id, period_start)%'
  UNION ALL
  SELECT 'reject_immutable_unit_registry_evidence function', 1::bigint, count(*)::bigint
  FROM pg_proc
  WHERE proname = 'reject_immutable_unit_registry_evidence'
    AND pg_function_is_visible(oid)
  UNION ALL
  SELECT 'enforce_one_active_unit_facility_booking function', 1::bigint, count(*)::bigint
  FROM pg_proc
  WHERE proname = 'enforce_one_active_unit_facility_booking'
    AND pg_function_is_visible(oid)
  UNION ALL
  SELECT 'monthly allowance immutable trigger', 1::bigint, count(*)::bigint
  FROM pg_trigger AS trig
  WHERE trig.tgname = 'trg_monthly_booking_allowances_immutable'
    AND trig.tgrelid = 'public.monthly_booking_allowances'::regclass
    AND NOT trig.tgisinternal
  UNION ALL
  SELECT 'unit correction audit append-only trigger', 1::bigint, count(*)::bigint
  FROM pg_trigger AS trig
  WHERE trig.tgname = 'trg_unit_master_data_audit_append_only'
    AND trig.tgrelid = 'public.unit_master_data_audit'::regclass
    AND NOT trig.tgisinternal
  UNION ALL
  SELECT 'one active unit/facility booking trigger', 1::bigint, count(*)::bigint
  FROM pg_trigger AS trig
  WHERE trig.tgname = 'trg_enforce_one_active_unit_facility_booking'
    AND trig.tgrelid = 'public.bookings'::regclass
    AND NOT trig.tgisinternal
  UNION ALL
  SELECT 'occupancy correction operations table', 1::bigint, count(*)::bigint
  FROM pg_class AS c
  WHERE c.oid = 'public.occupancy_correction_operations'::regclass
    AND c.relkind IN ('r', 'p')
  UNION ALL
  SELECT 'occupancy correction operations columns', 11::bigint, count(*)::bigint
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'occupancy_correction_operations'
    AND column_name IN (
      'id', 'idempotency_key', 'correction_key', 'unit_id', 'actor_user_id',
      'reason', 'before_snapshot', 'after_snapshot', 'affected_ids',
      'postcondition_summary', 'created_at'
    )
  UNION ALL
  SELECT 'occupancy correction operations constraints', 4::bigint, count(*)::bigint
  FROM pg_constraint AS con
  WHERE con.conrelid = 'public.occupancy_correction_operations'::regclass
    AND con.conname IN (
      'occupancy_correction_operations_pkey',
      'occupancy_correction_operations_reason_check',
      'occupancy_correction_operations_actor_user_id_fkey',
      'occupancy_correction_operations_unit_id_fkey'
    )
  UNION ALL
  SELECT 'occupancy correction operations indexes', 3::bigint, count(*)::bigint
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'occupancy_correction_operations'
    AND indexname IN (
      'uq_occupancy_correction_operations_idempotency',
      'uq_occupancy_correction_operations_correction',
      'idx_occupancy_correction_operations_unit_created'
    )
  UNION ALL
  SELECT 'occupancy append-only mutation function', 1::bigint, count(*)::bigint
  FROM pg_proc
  WHERE proname = 'reject_occupancy_append_only_mutation'
    AND pg_function_is_visible(oid)
  UNION ALL
  SELECT 'occupancy correction operations append-only trigger', 1::bigint, count(*)::bigint
  FROM pg_trigger AS trig
  WHERE trig.tgname = 'trg_occupancy_correction_operations_immutable'
    AND trig.tgrelid = 'public.occupancy_correction_operations'::regclass
    AND NOT trig.tgisinternal
  UNION ALL
  SELECT 'occupancy correction operation supplements table', 1::bigint, count(*)::bigint
  FROM pg_class AS c
  WHERE c.oid = 'public.occupancy_correction_operation_supplements'::regclass
    AND c.relkind IN ('r', 'p')
  UNION ALL
  SELECT 'occupancy correction operation supplements columns', 9::bigint, count(*)::bigint
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'occupancy_correction_operation_supplements'
    AND column_name IN (
      'id', 'operation_id', 'actor_user_id', 'reason', 'final_snapshot',
      'final_snapshot_sha256', 'original_after_snapshot_sha256',
      'postcondition_summary', 'created_at'
    )
  UNION ALL
  SELECT 'occupancy correction operation supplements constraints', 6::bigint, count(*)::bigint
  FROM pg_constraint AS con
  WHERE con.conrelid = 'public.occupancy_correction_operation_supplements'::regclass
    AND con.conname IN (
      'occupancy_correction_operation_supplements_pkey',
      'occupancy_correction_operation_supplements_reason_check',
      'occupancy_correction_operation_supp_final_snapshot_sha256_check',
      'occupancy_correction_operati_original_after_snapshot_sha2_check',
      'occupancy_correction_operation_supplements_actor_user_id_fkey',
      'occupancy_correction_operation_supplements_operation_id_fkey'
    )
  UNION ALL
  SELECT 'occupancy correction operation supplements index', 1::bigint, count(*)::bigint
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'occupancy_correction_operation_supplements'
    AND indexname = 'uq_occupancy_correction_operation_supplements_operation'
  UNION ALL
  SELECT 'occupancy correction operation supplements append-only trigger', 1::bigint, count(*)::bigint
  FROM pg_trigger AS trig
  WHERE trig.tgname = 'trg_occupancy_correction_operation_supplements_immutable'
    AND trig.tgrelid = 'public.occupancy_correction_operation_supplements'::regclass
    AND NOT trig.tgisinternal
),
all_checks AS (
  SELECT expected.check_name, expected.expected_count, actual.actual_count
  FROM expected_counts AS expected
  JOIN actual_counts AS actual USING (check_name)
  UNION ALL
  SELECT check_name, expected_count, actual_count
  FROM protection_checks
)
SELECT
  check_name,
  expected_count,
  actual_count,
  CASE WHEN expected_count = actual_count THEN 'PASS' ELSE 'FAIL' END,
  CASE
    WHEN expected_count = actual_count THEN 'matches expected catalog state'
    ELSE format('expected %s but found %s', expected_count, actual_count)
  END
FROM all_checks
ORDER BY check_name;
SQL
)"
query_status=$?

if [[ "$query_status" -ne 0 ]]; then
  # Avoid echoing a connection URI if libpq includes it in an error message.
  safe_error="${query_output//$DATABASE_URL/<redacted DATABASE_URL>}"
  echo "FAIL: PostgreSQL connection or read-only catalog query failed." >&2
  [[ -n "$safe_error" ]] && printf '%s\n' "$safe_error" >&2
  exit 2
fi

failures=()
printf '%-48s %-8s %-8s %s\n' "CHECK" "EXPECTED" "ACTUAL" "STATUS"
printf '%s\n' "--------------------------------------------------------------------------------"

while IFS=$'\t' read -r check_name expected_count actual_count status detail; do
  [[ -z "$check_name" ]] && continue
  printf '%-48s %-8s %-8s %s\n' \
    "$check_name" "$expected_count" "$actual_count" "$status"
  if [[ "$status" != "PASS" ]]; then
    failures+=("$check_name: $detail")
  fi
done <<< "$query_output"

if [[ "${#failures[@]}" -gt 0 ]]; then
  echo
  echo "FAIL: production schema verification found ${#failures[@]} discrepancy(ies)."
  for failure in "${failures[@]}"; do
    echo " - $failure"
  done
  exit 1
fi

echo
echo "PASS: production schema matches the accepted 52/685/165/170/11 catalog and all twenty-four raw protections."