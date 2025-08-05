-- Create Google Calendar integration table
CREATE TABLE IF NOT EXISTS google_calendar_integration (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP,
    scope TEXT,
    calendar_info JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on user_email for faster lookups
CREATE INDEX IF NOT EXISTS idx_google_calendar_user_email ON google_calendar_integration(user_email);

-- Create index on is_active for faster filtering
CREATE INDEX IF NOT EXISTS idx_google_calendar_active ON google_calendar_integration(is_active);
