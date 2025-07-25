#!/bin/bash

# Script to add professional fields to users table
echo "Adding professional fields to users table..."

export PGPASSWORD="mysecretpassword"

psql -h localhost -p 5433 -U postgres -d Ovill << EOF
-- Add professional fields
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS job_title VARCHAR(100);

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS company VARCHAR(100);

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS skills TEXT;

-- Add comments
COMMENT ON COLUMN users.job_title IS 'User job title/position';
COMMENT ON COLUMN users.company IS 'User company/organization';
COMMENT ON COLUMN users.skills IS 'User skills (comma separated)';

-- Verify the table structure
\d users;

SELECT 'Professional fields migration completed successfully!' as status;
EOF

unset PGPASSWORD
echo "Professional fields migration completed!"
