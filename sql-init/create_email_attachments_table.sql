-- Create email_attachments table
CREATE TABLE IF NOT EXISTS email_attachments (
    id SERIAL PRIMARY KEY,
    email_id INTEGER NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    attachment_data BYTEA, -- Store small attachments directly
    file_path VARCHAR(500), -- Path to stored file for larger attachments
    gmail_attachment_id VARCHAR(255), -- Gmail-specific attachment ID
    is_inline BOOLEAN DEFAULT FALSE, -- Whether attachment is inline (like images in email body)
    content_id VARCHAR(255), -- Content-ID for inline attachments
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_attachments_email_id ON email_attachments(email_id);
CREATE INDEX IF NOT EXISTS idx_email_attachments_gmail_id ON email_attachments(gmail_attachment_id);
CREATE INDEX IF NOT EXISTS idx_email_attachments_inline ON email_attachments(is_inline);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_email_attachments_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language plpgsql;

CREATE TRIGGER update_email_attachments_updated_at
    BEFORE UPDATE ON email_attachments
    FOR EACH ROW
    EXECUTE FUNCTION update_email_attachments_updated_at();
