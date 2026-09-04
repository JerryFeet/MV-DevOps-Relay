#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: relay schema promotion gate: $*" >&2
  exit 1
}

workspace_root="${SCHEMA_GUARD_WORKSPACE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
relay_url="${SCHEMA_GUARD_RELAY_URL:-https://github.com/JerryFeet/MV-DevOps-Relay.git}"
relay_branch="${SCHEMA_GUARD_RELAY_BRANCH:-main}"
test_mode="${SCHEMA_GUARD_TEST_MODE:-0}"
skip_database="${SCHEMA_GUARD_SKIP_DATABASE:-0}"

if [[ -n "${SCHEMA_GUARD_RELAY_CHECKOUT:-}" ]]; then
  [[ "$test_mode" == "1" ]] || fail "SCHEMA_GUARD_RELAY_CHECKOUT is test-only"
  relay_root="$SCHEMA_GUARD_RELAY_CHECKOUT"
else
  relay_root="$(mktemp -d)"
  trap 'rm -rf "$relay_root"' EXIT
  echo "Cloning relay ${relay_url} (${relay_branch})..."
  git clone --quiet --depth 1 --branch "$relay_branch" "$relay_url" "$relay_root" \
    || fail "fresh relay clone failed"
fi

manifest_rel="lib/db/migrations/BASELINE_MANIFEST.env"
workspace_manifest="$workspace_root/$manifest_rel"
relay_manifest="$relay_root/$manifest_rel"
[[ -f "$workspace_manifest" ]] || fail "workspace manifest is missing: $manifest_rel"
[[ -f "$relay_manifest" ]] || fail "relay manifest is missing: $manifest_rel"

# shellcheck disable=SC1090
source "$workspace_manifest"
for required_var in MIGRATION_START INCLUDED_THROUGH BASELINE_SHA256 CATALOG_SHA256 \
  PUBLIC_TABLES PUBLIC_COLUMNS PUBLIC_CONSTRAINTS PUBLIC_INDEXES PUBLIC_TRIGGERS \
  VERIFIER_SHA256; do
  [[ -n "${!required_var:-}" ]] || fail "manifest variable $required_var is missing"
done
[[ "$MIGRATION_START" =~ ^[0-9]{4}$ ]] || fail "MIGRATION_START must be four digits"
[[ "$INCLUDED_THROUGH" =~ ^[0-9]{4}$ ]] || fail "INCLUDED_THROUGH must be four digits"

highest_workspace="$(
  find "$workspace_root/lib/db/migrations" -maxdepth 1 -type f \
    -regextype posix-extended -regex '.*/[0-9]{4}_.+\.sql' -printf '%f\n' \
    | cut -c1-4 | sort | tail -1
)"
[[ "$highest_workspace" == "$INCLUDED_THROUGH" ]] \
  || fail "workspace highest migration $highest_workspace does not match manifest $INCLUDED_THROUGH"

ledger_rel="lib/db/migrations/MIGRATION_LEDGER.md"
grep -Fq "\`00${INCLUDED_THROUGH#00}" "$workspace_root/$ledger_rel" \
  || grep -Fq "\`${INCLUDED_THROUGH}_" "$workspace_root/$ledger_rel" \
  || fail "workspace ledger does not include migration $INCLUDED_THROUGH"

fixed_paths=(
  ".replit"
  "package.json"
  "$manifest_rel"
  "$ledger_rel"
  "lib/db/migrations/0000_baseline.sql"
  "scripts/verify-production-schema.sh"
  "scripts/schema-catalog-signature.sql"
  "scripts/assert-relay-schema-promotion-ready.sh"
  "scripts/assert-relay-schema-promotion-ready.test.sh"
)

for rel in "${fixed_paths[@]}"; do
  [[ -f "$workspace_root/$rel" ]] || fail "workspace canonical file is missing: $rel"
  [[ -f "$relay_root/$rel" ]] || fail "relay canonical file is missing: $rel"
  cmp -s "$workspace_root/$rel" "$relay_root/$rel" \
    || fail "workspace is current but relay canonical file is stale: $rel"
done

grep -Fq 'build = "bash scripts/assert-relay-schema-promotion-ready.sh"' "$relay_root/.replit" \
  || fail "relay Publish configuration does not invoke the mandatory schema promotion gate"

for test_payment_key in PAYMENT_TEST_PROVIDER PAYMENT_TEST_OUTCOME; do
  if grep -Eq "^[[:space:]]*${test_payment_key}[[:space:]]*=" "$relay_root/.replit"; then
    fail "relay Publish configuration commits test payment key $test_payment_key; keep it in Development environment configuration only"
  fi
done

for ((n=10#$MIGRATION_START; n<=10#$INCLUDED_THROUGH; n++)); do
  prefix="$(printf '%04d' "$n")"
  mapfile -t workspace_matches < <(find "$workspace_root/lib/db/migrations" -maxdepth 1 -type f -name "${prefix}_*.sql" -printf '%f\n')
  [[ "${#workspace_matches[@]}" -eq 1 ]] || fail "expected exactly one workspace migration for $prefix"
  rel="lib/db/migrations/${workspace_matches[0]}"
  [[ -f "$relay_root/$rel" ]] || fail "relay migration is missing: $rel"
  cmp -s "$workspace_root/$rel" "$relay_root/$rel" \
    || fail "workspace is current but relay migration is stale: $rel"
done

relay_highest="$(
  find "$relay_root/lib/db/migrations" -maxdepth 1 -type f \
    -regextype posix-extended -regex '.*/[0-9]{4}_.+\.sql' -printf '%f\n' \
    | cut -c1-4 | sort | tail -1
)"
[[ "$relay_highest" == "$INCLUDED_THROUGH" ]] \
  || fail "relay highest migration $relay_highest does not match manifest $INCLUDED_THROUGH"

actual_baseline_sha="$(sha256sum "$relay_root/lib/db/migrations/0000_baseline.sql" | cut -d' ' -f1)"
[[ "$actual_baseline_sha" == "$BASELINE_SHA256" ]] \
  || fail "relay baseline hash mismatch: expected $BASELINE_SHA256, found $actual_baseline_sha"
actual_verifier_sha="$(sha256sum "$relay_root/scripts/verify-production-schema.sh" | cut -d' ' -f1)"
[[ "$actual_verifier_sha" == "$VERIFIER_SHA256" ]] \
  || fail "relay verifier hash mismatch: expected $VERIFIER_SHA256, found $actual_verifier_sha"

if [[ "$skip_database" == "1" ]]; then
  [[ "$test_mode" == "1" ]] || fail "SCHEMA_GUARD_SKIP_DATABASE is test-only"
else
  : "${DATABASE_URL:?DATABASE_URL must be set for the mandatory promotion gate}"
  command -v psql >/dev/null 2>&1 || fail "psql is unavailable"
  catalog_file="$(mktemp)"
  trap 'rm -rf "$relay_root"; rm -f "$catalog_file"' EXIT
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
    -f "$relay_root/scripts/schema-catalog-signature.sql" > "$catalog_file" \
    || fail "read-only frozen Development catalog signature failed"
  actual_catalog_sha="$(sha256sum "$catalog_file" | cut -d' ' -f1)"
  [[ "$actual_catalog_sha" == "$CATALOG_SHA256" ]] \
    || fail "applied catalog does not match relay baseline contract: expected $CATALOG_SHA256, found $actual_catalog_sha"

  counts="$(
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -F / <<'SQL'
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')),
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'),
  (SELECT count(*) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
  (SELECT count(*) FROM pg_indexes WHERE schemaname='public'),
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal);
SQL
  )"
  expected_counts="${PUBLIC_TABLES}/${PUBLIC_COLUMNS}/${PUBLIC_CONSTRAINTS}/${PUBLIC_INDEXES}/${PUBLIC_TRIGGERS}"
  [[ "$counts" == "$expected_counts" ]] \
    || fail "applied catalog counts are $counts; relay contract requires $expected_counts"

  DATABASE_URL="$DATABASE_URL" bash "$relay_root/scripts/verify-production-schema.sh" >/dev/null \
    || fail "relay canonical verifier rejected the applied catalog"
fi

relay_head="$(git -C "$relay_root" rev-parse HEAD 2>/dev/null || echo fixture)"
echo "PASS: mandatory relay schema promotion gate"
echo "Relay: $relay_url"
echo "Branch: $relay_branch"
echo "Relay HEAD: $relay_head"
echo "Included through migration: $INCLUDED_THROUGH"
echo "Baseline SHA-256: $BASELINE_SHA256"
echo "Catalog SHA-256: $CATALOG_SHA256"