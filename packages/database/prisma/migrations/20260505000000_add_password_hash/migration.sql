-- AlterTable
ALTER TABLE "users" ADD COLUMN "password_hash" VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP DEFAULT;
