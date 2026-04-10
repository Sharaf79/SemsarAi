-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'BANNED') NOT NULL DEFAULT 'ACTIVE',
    `is_phone_verified` BOOLEAN NOT NULL DEFAULT false,
    `is_email_verified` BOOLEAN NOT NULL DEFAULT false,
    `user_type` ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_phone_key`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `properties` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `price` DECIMAL(14, 2) NOT NULL,
    `type` ENUM('SALE', 'RENT') NOT NULL,
    `bedrooms` INTEGER NULL,
    `bathrooms` INTEGER NULL,
    `area_m2` DECIMAL(10, 2) NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT 'Egypt',
    `governorate` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `district` VARCHAR(191) NULL,
    `zone` VARCHAR(191) NULL,
    `street` VARCHAR(191) NULL,
    `nearest_landmark` VARCHAR(191) NULL,
    `latitude` DECIMAL(10, 8) NULL,
    `longitude` DECIMAL(11, 8) NULL,
    `property_status` ENUM('ACTIVE', 'INACTIVE', 'SOLD', 'RENTED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `properties_user_id_idx`(`user_id`),
    INDEX `properties_type_property_status_idx`(`type`, `property_status`),
    INDEX `properties_governorate_city_district_idx`(`governorate`, `city`, `district`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lower_offices` (
    `id` VARCHAR(191) NOT NULL,
    `office_name` VARCHAR(191) NOT NULL,
    `lower_name` VARCHAR(191) NOT NULL,
    `governorate` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `district` VARCHAR(191) NULL,
    `zone` VARCHAR(191) NULL,
    `street` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `age` INTEGER NULL,
    `license_number` VARCHAR(191) NULL,
    `position_title` VARCHAR(191) NULL,
    `working_hours` VARCHAR(191) NULL,
    `rating_score` DECIMAL(3, 2) NULL,
    `max_properties` INTEGER NULL,
    `notes` TEXT NULL,
    `location_latitude` DECIMAL(10, 8) NULL,
    `location_longitude` DECIMAL(11, 8) NULL,
    `active_status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `lower_offices_governorate_city_district_idx`(`governorate`, `city`, `district`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `negotiations` (
    `id` VARCHAR(191) NOT NULL,
    `property_id` VARCHAR(191) NOT NULL,
    `buyer_id` VARCHAR(191) NOT NULL,
    `seller_id` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'AGREED', 'FAILED') NOT NULL DEFAULT 'ACTIVE',
    `current_offer` DECIMAL(14, 2) NULL,
    `min_price` DECIMAL(14, 2) NULL,
    `max_price` DECIMAL(14, 2) NULL,
    `round_number` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `negotiations_property_id_idx`(`property_id`),
    INDEX `negotiations_buyer_id_idx`(`buyer_id`),
    INDEX `negotiations_seller_id_idx`(`seller_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `offers` (
    `id` VARCHAR(191) NOT NULL,
    `negotiation_id` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `created_by` VARCHAR(191) NOT NULL DEFAULT 'AI',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `offers_negotiation_id_idx`(`negotiation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `deals` (
    `id` VARCHAR(191) NOT NULL,
    `negotiation_id` VARCHAR(191) NOT NULL,
    `buyer_id` VARCHAR(191) NOT NULL,
    `seller_id` VARCHAR(191) NOT NULL,
    `lower_office_id` VARCHAR(191) NULL,
    `final_price` DECIMAL(14, 2) NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `deals_negotiation_id_idx`(`negotiation_id`),
    INDEX `deals_buyer_id_idx`(`buyer_id`),
    INDEX `deals_seller_id_idx`(`seller_id`),
    INDEX `deals_lower_office_id_idx`(`lower_office_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `deal_id` VARCHAR(191) NOT NULL,
    `type` ENUM('DEPOSIT', 'COMMISSION', 'INSURANCE') NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `provider` ENUM('PAYMOB', 'FAWRY') NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `transaction_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `payments_user_id_idx`(`user_id`),
    INDEX `payments_deal_id_idx`(`deal_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_logs` (
    `id` VARCHAR(191) NOT NULL,
    `negotiation_id` VARCHAR(191) NULL,
    `action_type` ENUM('ASK', 'COUNTER', 'ACCEPT', 'REJECT') NOT NULL,
    `message` TEXT NULL,
    `data` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_logs_negotiation_id_idx`(`negotiation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversations` (
    `id` VARCHAR(191) NOT NULL,
    `whatsapp_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `flow_state` ENUM('AWAITING_INTENT', 'AWAITING_UNIT_TYPE', 'AWAITING_SPECS', 'AWAITING_MEDIA', 'AWAITING_CONFIRMATION', 'CONFIRMED') NOT NULL DEFAULT 'AWAITING_INTENT',
    `current_field` VARCHAR(191) NULL,
    `intent` ENUM('BUY', 'SELL', 'RENT', 'LEASE') NULL,
    `listing_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NULL,

    UNIQUE INDEX `conversations_whatsapp_id_key`(`whatsapp_id`),
    INDEX `conversations_whatsapp_id_idx`(`whatsapp_id`),
    INDEX `conversations_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `listings` (
    `id` VARCHAR(191) NOT NULL,
    `whatsapp_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `intent` ENUM('BUY', 'SELL', 'RENT', 'LEASE') NULL,
    `unit_type` ENUM('APARTMENT', 'LAND', 'VILLA', 'COMMERCIAL') NULL,
    `specs` JSON NULL,
    `location` VARCHAR(191) NULL,
    `price` DECIMAL(14, 2) NULL,
    `media_urls` JSON NULL,
    `status` ENUM('DRAFT', 'CONFIRMED') NOT NULL DEFAULT 'DRAFT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `listings_whatsapp_id_idx`(`whatsapp_id`),
    INDEX `listings_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `units` (
    `id` VARCHAR(191) NOT NULL,
    `listing_id` VARCHAR(191) NOT NULL,
    `whatsapp_id` VARCHAR(191) NOT NULL,
    `intent` ENUM('BUY', 'SELL', 'RENT', 'LEASE') NOT NULL,
    `unit_type` ENUM('APARTMENT', 'LAND', 'VILLA', 'COMMERCIAL') NOT NULL,
    `specs` JSON NULL,
    `location` VARCHAR(191) NULL,
    `price` DECIMAL(14, 2) NULL,
    `media_urls` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `units_listing_id_idx`(`listing_id`),
    INDEX `units_is_active_intent_unit_type_idx`(`is_active`, `intent`, `unit_type`),
    INDEX `units_whatsapp_id_idx`(`whatsapp_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `properties` ADD CONSTRAINT `properties_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `negotiations` ADD CONSTRAINT `negotiations_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `negotiations` ADD CONSTRAINT `negotiations_buyer_id_fkey` FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `negotiations` ADD CONSTRAINT `negotiations_seller_id_fkey` FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `offers` ADD CONSTRAINT `offers_negotiation_id_fkey` FOREIGN KEY (`negotiation_id`) REFERENCES `negotiations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deals` ADD CONSTRAINT `deals_negotiation_id_fkey` FOREIGN KEY (`negotiation_id`) REFERENCES `negotiations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deals` ADD CONSTRAINT `deals_buyer_id_fkey` FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deals` ADD CONSTRAINT `deals_seller_id_fkey` FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deals` ADD CONSTRAINT `deals_lower_office_id_fkey` FOREIGN KEY (`lower_office_id`) REFERENCES `lower_offices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_deal_id_fkey` FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_logs` ADD CONSTRAINT `ai_logs_negotiation_id_fkey` FOREIGN KEY (`negotiation_id`) REFERENCES `negotiations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_listing_id_fkey` FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `listings` ADD CONSTRAINT `listings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `units` ADD CONSTRAINT `units_listing_id_fkey` FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
