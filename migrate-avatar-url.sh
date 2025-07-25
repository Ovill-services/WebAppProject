#!/bin/bash

# Script to add avatar_url column to users table
echo "Adding avatar_url column to users table..."

export PGPASSWORD="mysecretpassword"

psql -h localhost -p 5433 -U postgres -d Ovill << EOF
-- Add avatar_url column
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255);

-- Add comment
COMMENT ON COLUMN users.avatar_url IS 'URL path to user avatar image';

-- Verify the table structure
\d users;

SELECT 'Avatar URL column migration completed successfully!' as status;
EOF

unset PGPASSWORD
echo "Avatar URL migration completed!"
