-- CreateTable: property_requests
CREATE TABLE `property_requests` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `intent` ENUM('SALE', 'RENT') NOT NULL,
    `property_kind` ENUM('APARTMENT', 'VILLA', 'SHOP', 'OFFICE', 'SUMMER_RESORT', 'COMMERCIAL', 'LAND_BUILDING') NULL,
    `apartment_type` VARCHAR(191) NULL,
    `min_price` DECIMAL(14, 2) NULL,
    `max_price` DECIMAL(14, 2) NULL,
    `payment_preference` VARCHAR(191) NULL,
    `rent_rate_type` VARCHAR(191) NULL,
    `min_bedrooms` INTEGER NULL,
    `max_bedrooms` INTEGER NULL,
    `min_bathrooms` INTEGER NULL,
    `max_bathrooms` INTEGER NULL,
    `min_area_m2` DECIMAL(10, 2) NULL,
    `max_area_m2` DECIMAL(10, 2) NULL,
    `center_latitude` DECIMAL(10, 8) NULL,
    `center_longitude` DECIMAL(11, 8) NULL,
    `search_radius_km` DECIMAL(6, 2) NULL,
    `is_furnished` BOOLEAN NULL,
    `finishing_type` VARCHAR(191) NULL,
    `floor_level` VARCHAR(191) NULL,
    `readiness` VARCHAR(191) NULL,
    `ownership_type` VARCHAR(191) NULL,
    `preferred_amenities` JSON NULL,
    `urgency` ENUM('LOW', 'MEDIUM', 'HIGH') NOT NULL DEFAULT 'MEDIUM',
    `status` ENUM('ACTIVE', 'PAUSED', 'MATCHED', 'CLOSED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `notes` TEXT NULL,
    `expires_at` DATETIME(3) NULL,
    `last_matched_at` DATETIME(3) NULL,
    `last_recomputed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `property_requests_user_id_status_idx` (`user_id`, `status`),
    INDEX `property_requests_intent_status_idx` (`intent`, `status`),
    INDEX `property_requests_status_urgency_created_at_idx` (`status`, `urgency`, `created_at`),
    INDEX `property_requests_intent_property_kind_status_idx` (`intent`, `property_kind`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: property_request_locations
CREATE TABLE `property_request_locations` (
    `id` VARCHAR(191) NOT NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `location_id` INTEGER NOT NULL,

    INDEX `property_request_locations_location_id_idx` (`location_id`),
    UNIQUE INDEX `property_request_locations_request_id_location_id_key` (`request_id`, `location_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: property_matches
CREATE TABLE `property_matches` (
    `id` VARCHAR(191) NOT NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `property_id` VARCHAR(191) NOT NULL,
    `score` DOUBLE NOT NULL,
    `price_score` DOUBLE NOT NULL,
    `location_score` DOUBLE NOT NULL,
    `feature_score` DOUBLE NOT NULL,
    `distance_km` DECIMAL(8, 2) NULL,
    `reasons` JSON NULL,
    `status` ENUM('NEW', 'VIEWED', 'CONTACTED', 'DISMISSED', 'CONVERTED', 'CLOSED') NOT NULL DEFAULT 'NEW',
    `last_computed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `property_matches_request_id_score_idx` (`request_id`, `score` DESC),
    INDEX `property_matches_property_id_score_idx` (`property_id`, `score` DESC),
    INDEX `property_matches_status_last_computed_at_idx` (`status`, `last_computed_at`),
    UNIQUE INDEX `property_matches_request_id_property_id_key` (`request_id`, `property_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Foreign keys
ALTER TABLE `property_requests` ADD CONSTRAINT `property_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `property_request_locations` ADD CONSTRAINT `property_request_locations_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `property_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `property_request_locations` ADD CONSTRAINT `property_request_locations_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `property_matches` ADD CONSTRAINT `property_matches_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `property_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `property_matches` ADD CONSTRAINT `property_matches_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Add composite index on properties (skip if already present)
CREATE INDEX `properties_property_status_type_property_kind_idx` ON `properties`(`property_status`, `type`, `property_kind`);
