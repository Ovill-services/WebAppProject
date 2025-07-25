#!/bin/bash

# Script to add bio and phone fields to users table
# This script will connect to PostgreSQL and run the migration

echo "Adding bio and phone fields to users table..."

# Set password as environment variable to avoid interactive prompt
export PGPASSWORD="mysecretpassword"

# Run the SQL migration
psql -h localhost -p 5433 -U postgres -d Ovill << EOF
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
\d users;

-- Show success message
SELECT 'Database migration completed successfully!' as status;
EOF

# Unset password
unset PGPASSWORD

echo "Migration completed!"
