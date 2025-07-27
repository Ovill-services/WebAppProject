-- Migration: Add Microsoft integration table
-- This table stores Microsoft OAuth tokens and integration settings for users

CREATE TABLE IF NOT EXISTS microsoft_integration (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_on TIMESTAMP NOT NULL,
    account_info JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_email)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_microsoft_integration_user_email ON microsoft_integration(user_email);
CREATE INDEX IF NOT EXISTS idx_microsoft_integration_active ON microsoft_integration(is_active);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_microsoft_integration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_microsoft_integration_updated_at_trigger ON microsoft_integration;
CREATE TRIGGER update_microsoft_integration_updated_at_trigger
    BEFORE UPDATE ON microsoft_integration
    FOR EACH ROW
    EXECUTE FUNCTION update_microsoft_integration_updated_at();
