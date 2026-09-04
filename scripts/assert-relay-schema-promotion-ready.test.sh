#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

make_fixture() {
  rm -rf "$tmp/workspace" "$tmp/relay"
  mkdir -p "$tmp/workspace" "$tmp/relay"
  cp -a "$root/.replit" "$root/package.json" "$tmp/workspace/"
  cp -a "$root/lib" "$root/scripts" "$tmp/workspace/"
  cp -a "$tmp/workspace/." "$tmp/relay/"
}

run_guard() {
  SCHEMA_GUARD_TEST_MODE=1 \
  SCHEMA_GUARD_SKIP_DATABASE=1 \
  SCHEMA_GUARD_WORKSPACE_ROOT="$tmp/workspace" \
  SCHEMA_GUARD_RELAY_CHECKOUT="$tmp/relay" \
    bash "$tmp/workspace/scripts/assert-relay-schema-promotion-ready.sh"
}

expect_failure() {
  local expected="$1"
  if run_guard >"$tmp/output" 2>&1; then
    echo "FAIL: expected guard failure containing: $expected" >&2
    exit 1
  fi
  grep -Fq "$expected" "$tmp/output" || {
    cat "$tmp/output" >&2
    echo "FAIL: missing expected error: $expected" >&2
    exit 1
  }
}

make_fixture
run_guard >/dev/null

make_fixture
rm "$tmp/relay/lib/db/migrations/0048_booking_allowance_and_unit_master_audit.sql"
expect_failure "relay migration is missing"

make_fixture
printf '\n-- stale relay baseline\n' >> "$tmp/relay/lib/db/migrations/0000_baseline.sql"
expect_failure "relay canonical file is stale"

make_fixture
sed -i 's/47::bigint/46::bigint/' "$tmp/relay/scripts/verify-production-schema.sh"
expect_failure "relay canonical file is stale"

echo "PASS: relay schema promotion gate fixtures"