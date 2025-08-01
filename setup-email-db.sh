#!/bin/bash

# Email Database Migration Script
echo "Setting up email database tables..."

# Run the migration SQL
psql -h localhost -U postgres -d Ovill -p 5433 -f migrations/create_emails_table.sql

echo "Email database setup completed!"
echo ""
echo "You can now:"
echo "1. Start your server: node index.js"
echo "2. Go to /email page to test the email functionality"
echo "3. The system includes:"
echo "   - Send/compose emails"
echo "   - Mark as read/unread"
echo "   - Mark as important"
echo "   - Search and filter emails"
echo "   - Delete emails"
echo "   - Reply and forward functionality"
