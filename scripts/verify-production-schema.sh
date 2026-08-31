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
    ('public tables'::text, 45::bigint),
    ('public columns'::text, 617::bigint),
    ('public constraints'::text, 132::bigint),
    ('public indexes'::text, 150::bigint),
    ('public non-internal triggers'::text, 3::bigint)
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
echo "PASS: production schema matches the accepted 45/617/132/150/3 catalog and all five raw protections."