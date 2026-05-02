-- Migration: add negotiation voice phase
--   1. Add Property.minPrice / Property.maxPrice (seller-set negotiation band)
--   2. Create negotiation_escalations table (buyer offer below min → seller WhatsApp escalation)

-- AlterTable: properties → add price band columns
ALTER TABLE `properties`
    ADD COLUMN `min_price` DECIMAL(14, 2) NULL,
    ADD COLUMN `max_price` DECIMAL(14, 2) NULL;

-- CreateTable: negotiation_escalations
CREATE TABLE `negotiation_escalations` (
    `id` VARCHAR(191) NOT NULL,
    `negotiation_id` VARCHAR(191) NOT NULL,
    `buyer_offer` DECIMAL(14, 2) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `seller_action` VARCHAR(191) NULL,
    `seller_counter` DECIMAL(14, 2) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME(3) NULL,

    UNIQUE INDEX `negotiation_escalations_token_key` (`token`),
    INDEX `negotiation_escalations_negotiation_id_idx` (`negotiation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Foreign keys
ALTER TABLE `negotiation_escalations` ADD CONSTRAINT `negotiation_escalations_negotiation_id_fkey` FOREIGN KEY (`negotiation_id`) REFERENCES `negotiations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
