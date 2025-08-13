-- Create users table
-- This script creates the users table required for authentication

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    entrydate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    lastlogin TIMESTAMP,
    email VARCHAR(255) UNIQUE,
    google_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    role VARCHAR(50) DEFAULT 'user',
    avatar_url VARCHAR(500),
    phone VARCHAR(20),
    bio TEXT
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- Insert a default admin user (password: admin123)
INSERT INTO users (name, username, password, entrydate, lastlogin, email, role) 
VALUES ('Administrator', 'admin', 'admin123', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'admin@localhost', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE users IS 'User accounts for authentication and authorization';
COMMENT ON COLUMN users.id IS 'Primary key, auto-incrementing user ID';
COMMENT ON COLUMN users.name IS 'Full display name of the user';
COMMENT ON COLUMN users.username IS 'Unique username for login';
COMMENT ON COLUMN users.password IS 'User password (should be hashed in production)';
COMMENT ON COLUMN users.email IS 'User email address (optional, unique)';
COMMENT ON COLUMN users.google_id IS 'Google OAuth ID for SSO integration';
COMMENT ON COLUMN users.phone IS 'User phone number (optional)';
COMMENT ON COLUMN users.bio IS 'User biographical information (optional)';
