-- Add `username` for login and make `email` optional.
-- Existing rows are backfilled from the email local-part so the NOT NULL +
-- UNIQUE constraints apply cleanly on databases that already hold users.

-- AlterTable: add username as nullable first so a backfill is possible
ALTER TABLE `users` ADD COLUMN `username` VARCHAR(191) NULL;

-- Backfill: derive a username from the email local-part for existing rows
UPDATE `users` SET `username` = SUBSTRING_INDEX(`email`, '@', 1) WHERE `username` IS NULL;

-- Enforce NOT NULL now that every row has a username
ALTER TABLE `users` MODIFY `username` VARCHAR(191) NOT NULL;

-- Make email optional (unique index already permits multiple NULLs in MySQL)
ALTER TABLE `users` MODIFY `email` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_username_key` ON `users`(`username`);
