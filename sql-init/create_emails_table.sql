-- Create emails table
CREATE TABLE IF NOT EXISTS emails (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    sender_email VARCHAR(255) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    cc_emails TEXT, -- Comma-separated list of CC emails
    bcc_emails TEXT, -- Comma-separated list of BCC emails
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    is_important BOOLEAN DEFAULT FALSE,
    is_draft BOOLEAN DEFAULT FALSE,
    email_type VARCHAR(20) DEFAULT 'received', -- 'received', 'sent', 'draft'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_email) REFERENCES users(username) ON DELETE CASCADE
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_emails_user_email ON emails(user_email);
CREATE INDEX IF NOT EXISTS idx_emails_type ON emails(email_type);
CREATE INDEX IF NOT EXISTS idx_emails_read ON emails(is_read);
CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at DESC);

-- Insert some sample data
INSERT INTO emails (user_email, sender_email, recipient_email, subject, body, is_read, is_important, email_type, created_at) VALUES
('test@example.com', 'john.doe@example.com', 'test@example.com', 'Welcome to the Team!', 'Hi there,

Welcome to our amazing team! We''re excited to have you on board.

Best regards,
John Doe', FALSE, TRUE, 'received', NOW() - INTERVAL '2 hours'),

('test@example.com', 'hr@company.com', 'test@example.com', 'Monthly Report Due', 'Dear Team,

Please submit your monthly reports by Friday.

Thanks,
HR Department', TRUE, FALSE, 'received', NOW() - INTERVAL '5 hours'),

('test@example.com', 'newsletter@tech.com', 'test@example.com', 'Weekly Tech Newsletter', 'This week in tech: AI advances, new frameworks, and industry insights.

Read more...', FALSE, FALSE, 'received', NOW() - INTERVAL '1 day');
