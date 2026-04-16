-- Add date_of_birth, sex_type, notes columns to users table
ALTER TABLE `users`
  ADD COLUMN `date_of_birth` DATETIME(3) NULL,
  ADD COLUMN `sex_type` VARCHAR(191) NULL,
  ADD COLUMN `notes` TEXT NULL;
