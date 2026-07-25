-- CreateTable
CREATE TABLE `settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `electricityUnitPrice` INTEGER NOT NULL DEFAULT 3500,
    `waterUnitPrice` INTEGER NOT NULL DEFAULT 15000,
    `internetFee` INTEGER NOT NULL DEFAULT 100000,
    `elevatorFeePerPerson` INTEGER NOT NULL DEFAULT 30000,
    `cleaningFeePerPerson` INTEGER NOT NULL DEFAULT 20000,
    `motorbikeFeePerExtra` INTEGER NOT NULL DEFAULT 100000,
    `freeMotorbikeCount` INTEGER NOT NULL DEFAULT 2,
    `otherFee` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rooms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `price` INTEGER NOT NULL,
    `status` ENUM('AVAILABLE', 'OCCUPIED', 'MAINTENANCE') NOT NULL DEFAULT 'AVAILABLE',
    `occupantCount` INTEGER NOT NULL DEFAULT 0,
    `motorbikeCount` INTEGER NOT NULL DEFAULT 0,
    `internetEnabled` BOOLEAN NOT NULL DEFAULT true,
    `initialElectricityReading` INTEGER NOT NULL DEFAULT 0,
    `initialWaterReading` INTEGER NOT NULL DEFAULT 0,
    `electricityReading` INTEGER NOT NULL DEFAULT 0,
    `waterReading` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `rooms_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tenants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fullName` VARCHAR(191) NOT NULL,
    `idCardNumber` VARCHAR(191) NOT NULL,
    `dateOfBirth` DATETIME(3) NOT NULL,
    `hometown` VARCHAR(191) NOT NULL,
    `roomId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenants_idCardNumber_key`(`idCardNumber`),
    INDEX `tenants_roomId_idx`(`roomId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contracts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roomId` INTEGER NOT NULL,
    `price` INTEGER NOT NULL,
    `deposit` INTEGER NOT NULL DEFAULT 0,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `status` ENUM('ACTIVE', 'EXPIRED', 'TERMINATED') NOT NULL DEFAULT 'ACTIVE',
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `contracts_roomId_idx`(`roomId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roomId` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `roomPrice` INTEGER NOT NULL,
    `electricityPrev` INTEGER NOT NULL,
    `electricityCurrent` INTEGER NOT NULL,
    `electricityUnitPrice` INTEGER NOT NULL,
    `waterPrev` INTEGER NOT NULL,
    `waterCurrent` INTEGER NOT NULL,
    `waterUnitPrice` INTEGER NOT NULL,
    `internetFee` INTEGER NOT NULL,
    `elevatorFee` INTEGER NOT NULL,
    `cleaningFee` INTEGER NOT NULL,
    `motorbikeFee` INTEGER NOT NULL,
    `otherFee` INTEGER NOT NULL,
    `occupantCount` INTEGER NOT NULL,
    `motorbikeCount` INTEGER NOT NULL,
    `totalAmount` INTEGER NOT NULL,
    `status` ENUM('UNPAID', 'PAID') NOT NULL DEFAULT 'UNPAID',
    `paymentMethod` ENUM('CASH', 'TRANSFER') NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `invoices_year_month_idx`(`year`, `month`),
    UNIQUE INDEX `invoices_roomId_year_month_key`(`roomId`, `year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenants` ADD CONSTRAINT `tenants_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
