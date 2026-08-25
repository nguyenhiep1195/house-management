-- Add the named fee-type model that the application and seed already use.
-- Existing installations had a singleton `settings` row, so preserve it as
-- the default fee type and attach existing rooms/history to it.

-- AlterTable
ALTER TABLE `rooms` ADD COLUMN `feeSettingId` INTEGER NULL;

-- AlterTable
ALTER TABLE `setting_history` ADD COLUMN `feeSettingId` INTEGER NULL;

-- AlterTable
ALTER TABLE `settings` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `isDefault` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `name` VARCHAR(191) NOT NULL DEFAULT 'Loại I';

-- Give every pre-existing row a unique generated name before adding the
-- unique index. The oldest singleton keeps the user-facing default name.
UPDATE `settings` SET `name` = CONCAT('Loại ', `id`);
UPDATE `settings`
SET `name` = 'Loại I', `isDefault` = true
WHERE `id` = (SELECT `firstId` FROM (SELECT MIN(`id`) AS `firstId` FROM `settings`) AS `firstSetting`);

-- Preserve existing room/history behavior by linking records to the default.
UPDATE `rooms`
SET `feeSettingId` = (SELECT MIN(`id`) FROM `settings`)
WHERE `feeSettingId` IS NULL;
UPDATE `setting_history`
SET `feeSettingId` = (SELECT MIN(`id`) FROM `settings`)
WHERE `feeSettingId` IS NULL;

-- CreateIndex
CREATE INDEX `rooms_feeSettingId_idx` ON `rooms`(`feeSettingId`);

-- CreateIndex
CREATE INDEX `setting_history_feeSettingId_changedAt_idx` ON `setting_history`(`feeSettingId`, `changedAt`);

-- CreateIndex
CREATE UNIQUE INDEX `settings_name_key` ON `settings`(`name`);

-- AddForeignKey
ALTER TABLE `setting_history` ADD CONSTRAINT `setting_history_feeSettingId_fkey` FOREIGN KEY (`feeSettingId`) REFERENCES `settings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rooms` ADD CONSTRAINT `rooms_feeSettingId_fkey` FOREIGN KEY (`feeSettingId`) REFERENCES `settings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
