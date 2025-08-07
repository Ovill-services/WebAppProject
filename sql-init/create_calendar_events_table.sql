-- Create calendar_events table
CREATE TABLE IF NOT EXISTS calendar_events (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    location VARCHAR(500),
    is_all_day BOOLEAN DEFAULT false,
    event_type VARCHAR(50) DEFAULT 'user',
    google_event_id VARCHAR(255),
    recurrence_rule TEXT,
    attendees JSONB,
    reminder_minutes INTEGER DEFAULT 15,
    is_cancelled BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_email ON calendar_events(user_email);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_start ON calendar_events(user_email, start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_google_id ON calendar_events(google_event_id);

-- Create index for upcoming events query
CREATE INDEX IF NOT EXISTS idx_calendar_events_upcoming ON calendar_events(user_email, start_time) WHERE start_time >= NOW() AND is_cancelled = false;
