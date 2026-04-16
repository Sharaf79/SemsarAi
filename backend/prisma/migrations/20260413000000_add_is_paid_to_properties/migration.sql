-- Add isPaid column to properties table
ALTER TABLE `properties` ADD COLUMN `is_paid` BOOLEAN NOT NULL DEFAULT FALSE;
