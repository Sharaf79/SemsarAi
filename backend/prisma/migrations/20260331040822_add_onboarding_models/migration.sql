-- AlterTable
ALTER TABLE `offers` ADD COLUMN `round` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `properties` ADD COLUMN `property_kind` ENUM('APARTMENT', 'VILLA', 'SHOP', 'OFFICE') NULL;

-- CreateTable
CREATE TABLE `property_drafts` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `property_id` VARCHAR(191) NULL,
    `current_step` ENUM('PROPERTY_TYPE', 'LISTING_TYPE', 'LOCATION', 'DETAILS', 'PRICE', 'MEDIA', 'REVIEW', 'COMPLETED') NOT NULL DEFAULT 'PROPERTY_TYPE',
    `data` JSON NOT NULL,
    `is_completed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `property_drafts_user_id_idx`(`user_id`),
    INDEX `property_drafts_is_completed_idx`(`is_completed`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `property_media` (
    `id` VARCHAR(191) NOT NULL,
    `draft_id` VARCHAR(191) NULL,
    `property_id` VARCHAR(191) NULL,
    `url` VARCHAR(191) NOT NULL,
    `type` ENUM('IMAGE', 'VIDEO') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `property_media_draft_id_idx`(`draft_id`),
    INDEX `property_media_property_id_idx`(`property_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `property_drafts` ADD CONSTRAINT `property_drafts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `property_drafts` ADD CONSTRAINT `property_drafts_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `property_media` ADD CONSTRAINT `property_media_draft_id_fkey` FOREIGN KEY (`draft_id`) REFERENCES `property_drafts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `property_media` ADD CONSTRAINT `property_media_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
