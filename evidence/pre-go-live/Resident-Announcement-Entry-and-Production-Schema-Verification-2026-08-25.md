# Resident announcement entry and production schema verification

**Date:** 2026-08-25  
**Status:** Ready for the product owner’s post-Publish verification  
**Development database:** Frozen; this work ran no schema push or migration.

## Resident launch announcement URL

**Give residents this URL path on the published HOA Portal host:**

```text
/hoa-portal/
```

Do not give residents `/hoa-portal/portal` or `/hoa-portal/sign-in` as the
launch link. The base entry path is the stable, phone-friendly announcement
link.

### Signed-out behavior

When a signed-out resident opens `/hoa-portal/`:

1. The app does **not** render the application 404 page.
2. It hands the resident to Clerk at `/hoa-portal/sign-in`.
3. Clerk displays the normal sign-in screen.

### After sign-in

After a resident completes sign-in from that launch URL, Clerk returns them to:

```text
/hoa-portal/portal
```

That is the resident dashboard. Owners and tenants land there directly with no
extra navigation required. The pre-existing role redirect continues to send
admins and guards to their dedicated work areas after the dashboard resolves
their role.

### Mobile browser proof

An unauthenticated mobile-sized browser opened `/hoa-portal/` and reached:

```text
/hoa-portal/sign-in?redirect_url=...
```

The Clerk sign-in form was visible. No application 404 page or routing console
error occurred. The remaining browser messages were Clerk development-key and
browser autocomplete advisories, not route failures.

## Read-only production schema verifier

Script:

```text
scripts/verify-production-schema.sh
```

Run it once after Publish from a trusted environment where the **production**
`DATABASE_URL` is already available:

```bash
bash scripts/verify-production-schema.sh
```

The verifier executes catalog `SELECT` queries only. It never runs a migration,
schema push, reset, fixture setup, or data write.

It asserts:

- 41 public tables
- 563 public columns
- 107 public constraints
- 137 public indexes
- 3 non-internal public triggers
- `users_staff_unitless_check`
- `units_system_unit_identity_check`
- `units_one_system_unit` partial unique index
- `protect_hoa_common_system_unit` function
- `protect_hoa_common_system_unit_trigger` on `public.units`

The output prints every check as `PASS` or `FAIL`. Any catalog difference is
named with its expected and actual value and exits with status `1`.

If `DATABASE_URL` is missing, `psql` is unavailable, or PostgreSQL cannot be
reached, the script prints an explicit `FAIL` message and exits with status
`2`; it cannot silently look like a successful verification.

## Frozen-development validation

The script was executed against the frozen development/UAT catalog:

```text
PASS: production schema matches the accepted 41/563/107/137/3 catalog and all five raw protections.
```

Negative checks also passed:

- Unset `DATABASE_URL` → explicit failure, exit `2`
- Unreachable PostgreSQL URL → explicit connection/query failure, exit `2`
- Static write-token scan → no `INSERT`, `UPDATE`, `DELETE`, DDL, or other
  schema/data mutation token