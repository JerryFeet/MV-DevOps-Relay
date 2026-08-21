# pg_dump --schema-only — user_role enum (development database)

Captured: 2026-08-21 alongside Stage 3b r2 delivery.

```sql
CREATE TYPE public.user_role AS ENUM (
    'owner',
    'tenant',
    'admin',
    'guard'
);

ALTER TYPE public.user_role OWNER TO postgres;
```

`supervisor` is absent. The enum contains exactly four values: `owner`, `tenant`, `admin`, `guard`.

This confirms migration `0029_remove_supervisor_role.sql` was applied successfully to the development database.
