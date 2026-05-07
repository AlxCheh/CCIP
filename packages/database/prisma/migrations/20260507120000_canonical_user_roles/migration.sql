-- Migration: canonical_user_roles
-- Phase 2 RBAC consistency: replaces VARCHAR(50) role column with
-- typed enum user_role (admin | director | stroycontrol | engineer).
--
-- Rollback plan:
--   ALTER TABLE "users" ALTER COLUMN "role" TYPE VARCHAR(50) USING "role"::TEXT;
--   DROP TYPE "user_role";
--   (restore CHECK constraint if needed)

-- Step 1: Create the enum type
CREATE TYPE "user_role" AS ENUM ('admin', 'director', 'stroycontrol', 'engineer');

-- Step 2: Normalize legacy role values that may exist in dev/staging data
--   'sc'           -> 'stroycontrol'  (Phase 1 rename, commit c063e67)
--   'site_engineer' -> 'engineer'     (Phase 1 rename, commit c063e67)
UPDATE "users" SET "role" = 'stroycontrol' WHERE "role" = 'sc';
UPDATE "users" SET "role" = 'engineer'     WHERE "role" = 'site_engineer';

-- Step 3: Guard — abort if any non-canonical role values remain
DO $$
DECLARE
  bad_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_count FROM "users"
  WHERE "role" NOT IN ('admin', 'director', 'stroycontrol', 'engineer');
  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'canonical_user_roles migration: % user(s) have non-canonical role values. '
      'Fix data before re-running this migration.', bad_count;
  END IF;
END $$;

-- Step 4: Drop the legacy CHECK constraint from the initial migration
--   (the constraint name used in 0001_initial was defined inline, so
--    PostgreSQL auto-named it; we use IF EXISTS for safety)
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_check";

-- Step 5: Convert column type using USING cast
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "user_role" USING "role"::"user_role";
