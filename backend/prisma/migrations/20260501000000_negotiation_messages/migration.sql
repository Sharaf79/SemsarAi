-- AlterTable: Add lastActivityAt to negotiations
ALTER TABLE `negotiations` ADD COLUMN `last_activity_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateIndex
CREATE INDEX `negotiations_lastActivityAt_idx` ON `negotiations`(`last_activity_at`);

-- CreateTable: NegotiationMessage
CREATE TABLE `negotiation_messages` (
    `id` VARCHAR(36) NOT NULL,
    `negotiation_id` VARCHAR(36) NOT NULL,
    `sender_role` ENUM('BUYER', 'SELLER', 'AI', 'SYSTEM') NOT NULL,
    `sender_user_id` VARCHAR(36) NULL,
    `body` TEXT NOT NULL,
    `kind` ENUM('TEXT', 'OFFER', 'ACTION', 'NOTICE') NOT NULL DEFAULT 'TEXT',
    `meta` JSON NULL,
    `client_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `read_by_buyer_at` DATETIME(3) NULL,
    `read_by_seller_at` DATETIME(3) NULL,

    INDEX `negotiation_messages_negotiationId_createdAt_idx`(`negotiation_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: negotiationId → negotiations
ALTER TABLE `negotiation_messages` ADD CONSTRAINT `negotiation_messages_negotiation_id_fkey` FOREIGN KEY (`negotiation_id`) REFERENCES `negotiations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: senderUserId → users
ALTER TABLE `negotiation_messages` ADD CONSTRAINT `negotiation_messages_sender_user_id_fkey` FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
