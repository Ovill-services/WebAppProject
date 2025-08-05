-- Create Gmail integration table
CREATE TABLE IF NOT EXISTS gmail_integration (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMP,
    gmail_email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_gmail_integration_user_email ON gmail_integration(user_email);

-- Update emails table to support Gmail integration
ALTER TABLE emails 
ADD COLUMN IF NOT EXISTS gmail_message_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS gmail_thread_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS gmail_labels TEXT[],
ADD COLUMN IF NOT EXISTS snippet TEXT,
ADD COLUMN IF NOT EXISTS synced_from_gmail BOOLEAN DEFAULT false;

-- Create index for Gmail message ID
CREATE INDEX IF NOT EXISTS idx_emails_gmail_message_id ON emails(gmail_message_id);

-- Insert sample Gmail integration data (replace with actual user data)
-- This is just for testing - in production, users will authenticate via OAuth
INSERT INTO gmail_integration (user_email, access_token, refresh_token, gmail_email, is_active)
VALUES 
    ('test@example.com', 'sample_access_token', 'sample_refresh_token', 'test@gmail.com', false)
ON CONFLICT DO NOTHING;

-- Sample email data synced from Gmail
INSERT INTO emails (
    user_email, 
    sender_email, 
    recipient_email, 
    subject, 
    body, 
    is_read, 
    is_important, 
    email_type, 
    gmail_message_id, 
    gmail_thread_id, 
    snippet, 
    synced_from_gmail
) VALUES 
    (
        'test@example.com',
        'sender@gmail.com',
        'test@example.com',
        'Welcome to Gmail Integration',
        'This is a sample email synced from Gmail API. You can now view and manage your Gmail messages directly from this application.',
        false,
        false,
        'received',
        'sample_gmail_message_id_1',
        'sample_gmail_thread_id_1',
        'This is a sample email synced from Gmail API...',
        true
    ),
    (
        'test@example.com',
        'noreply@service.com',
        'test@example.com',
        'Your Account Summary',
        'Dear user, here is your monthly account summary. Thank you for using our services.',
        true,
        true,
        'received',
        'sample_gmail_message_id_2',
        'sample_gmail_thread_id_2',
        'Dear user, here is your monthly account summary...',
        true
    )
ON CONFLICT DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for gmail_integration table
DROP TRIGGER IF EXISTS update_gmail_integration_updated_at ON gmail_integration;
CREATE TRIGGER update_gmail_integration_updated_at
    BEFORE UPDATE ON gmail_integration
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;
