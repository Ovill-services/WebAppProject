#!/bin/bash

# Gmail Integration Database Setup Script
# This script sets up the Gmail integration tables and sample data

echo "🚀 Setting up Gmail Integration Database..."

# Database connection parameters
DB_USER="postgres"
DB_HOST="localhost"
DB_NAME="Ovill"
DB_PASSWORD="mysecretpassword"
DB_PORT="5433"

# Check if PostgreSQL is running
echo "📡 Checking PostgreSQL connection..."
if ! PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c '\q' 2>/dev/null; then
    echo "❌ Error: Cannot connect to PostgreSQL database"
    echo "Make sure PostgreSQL is running and the connection parameters are correct"
    exit 1
fi

echo "✅ PostgreSQL connection successful"

# Run the Gmail integration migration
echo "📊 Creating Gmail integration tables..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f migrations/create_gmail_integration_table.sql

if [ $? -eq 0 ]; then
    echo "✅ Gmail integration tables created successfully"
else
    echo "❌ Error creating Gmail integration tables"
    exit 1
fi

# Install required Google APIs npm package if not present
echo "📦 Checking Google APIs dependency..."
if ! npm list googleapis > /dev/null 2>&1; then
    echo "📥 Installing Google APIs package..."
    npm install googleapis
    
    if [ $? -eq 0 ]; then
        echo "✅ Google APIs package installed successfully"
    else
        echo "❌ Error installing Google APIs package"
        exit 1
    fi
else
    echo "✅ Google APIs package already installed"
fi

echo ""
echo "🎉 Gmail Integration Setup Complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Set up Google Cloud Project and enable Gmail API"
echo "2. Create OAuth 2.0 credentials"
echo "3. Add the following environment variables to your .env file:"
echo "   GOOGLE_CLIENT_ID=your_client_id"
echo "   GOOGLE_CLIENT_SECRET=your_client_secret"
echo "   GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback"
echo ""
echo "4. Implement OAuth flow to get user tokens"
echo "5. Use the Gmail sync functionality in the email page"
echo ""
echo "📖 Gmail API Documentation: https://developers.google.com/gmail/api"
echo "🔧 OAuth 2.0 Setup: https://developers.google.com/identity/protocols/oauth2"
echo ""
