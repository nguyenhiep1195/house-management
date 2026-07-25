-- AlterTable
ALTER TABLE `contracts` ADD COLUMN `initialElectricityReading` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `initialWaterReading` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `setting_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `electricityUnitPrice` INTEGER NOT NULL,
    `waterUnitPrice` INTEGER NOT NULL,
    `internetFee` INTEGER NOT NULL,
    `elevatorFeePerPerson` INTEGER NOT NULL,
    `cleaningFeePerPerson` INTEGER NOT NULL,
    `motorbikeFeePerExtra` INTEGER NOT NULL,
    `freeMotorbikeCount` INTEGER NOT NULL,
    `otherFee` INTEGER NOT NULL,
    `changedById` INTEGER NULL,
    `changedByName` VARCHAR(191) NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `setting_history_changedAt_idx`(`changedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meter_readings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roomId` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `electricityReading` INTEGER NOT NULL,
    `waterReading` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `meter_readings_roomId_year_month_idx`(`roomId`, `year`, `month`),
    UNIQUE INDEX `meter_readings_roomId_year_month_key`(`roomId`, `year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meter_reading_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roomId` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `electricityReading` INTEGER NOT NULL,
    `waterReading` INTEGER NOT NULL,
    `changedById` INTEGER NULL,
    `changedByName` VARCHAR(191) NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `meter_reading_history_roomId_changedAt_idx`(`roomId`, `changedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `meter_readings` ADD CONSTRAINT `meter_readings_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
