-- Migration: Add bio and phone fields to users table
-- Run this SQL script to add bio and phone columns to the existing users table

-- Add phone column (VARCHAR for international phone numbers)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Add bio column (TEXT for longer biographical information)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS bio TEXT;

-- Optional: Add comments to document the columns
COMMENT ON COLUMN users.phone IS 'User phone number (optional)';
COMMENT ON COLUMN users.bio IS 'User biographical information (optional)';

-- Verify the table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;
