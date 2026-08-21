-- X6: Remove the supervisor role from user_role enum.
-- Confirmed safe: zero supervisor-role user rows exist at time of migration.
-- PostgreSQL does not support DROP VALUE on an enum; the type must be recreated.

BEGIN;

-- Step 1: rename the current enum out of the way
ALTER TYPE user_role RENAME TO user_role_old;

-- Step 2: create the new enum without 'supervisor'
CREATE TYPE user_role AS ENUM ('owner', 'tenant', 'admin', 'guard');

-- Step 3: drop the column default so the type cast can proceed
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;

-- Step 4: migrate the column to the new enum type
ALTER TABLE users
  ALTER COLUMN role TYPE user_role
  USING role::text::user_role;

-- Step 5: restore the default
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'tenant';

-- Step 6: drop the old enum
DROP TYPE user_role_old;

COMMIT;
