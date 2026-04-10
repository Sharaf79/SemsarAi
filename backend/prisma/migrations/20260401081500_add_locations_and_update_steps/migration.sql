-- Step 1: Migrate existing drafts from LOCATION to PROPERTY_TYPE (safe default)
-- LOCATION is being removed; reset those drafts so user starts location flow fresh
UPDATE `property_drafts` SET `current_step` = 'PROPERTY_TYPE' WHERE `current_step` = 'LOCATION';

-- Step 2: Add new enum values to OnboardingStep (MySQL ALTER enum)
ALTER TABLE `property_drafts` MODIFY `current_step` ENUM('PROPERTY_TYPE', 'LISTING_TYPE', 'GOVERNORATE', 'CITY', 'DISTRICT', 'DETAILS', 'PRICE', 'MEDIA', 'REVIEW', 'COMPLETED') NOT NULL DEFAULT 'PROPERTY_TYPE';

-- Step 3: Create LocationType enum and locations table
CREATE TABLE `locations` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name_ar` VARCHAR(100) NOT NULL,
    `name_en` VARCHAR(100) NULL,
    `type` ENUM('GOVERNORATE', 'CITY', 'DISTRICT') NOT NULL,
    `parent_id` INT UNSIGNED NULL,
    `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `locations_type_parent_id_idx` (`type`, `parent_id`),
    INDEX `locations_parent_id_is_active_idx` (`parent_id`, `is_active`),
    CONSTRAINT `locations_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
