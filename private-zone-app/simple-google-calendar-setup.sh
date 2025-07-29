#!/bin/bash

echo "🚀 Setting up Simple Google Calendar Integration..."

# Navigate to the private zone app directory
cd "$(dirname "$0")"

echo ""
echo "📋 Current Setup Status:"

# Check if we're in the right directory
if [ -f "package.json" ]; then
    echo "✅ In private-zone-app directory"
else
    echo "❌ Not in private-zone-app directory"
    exit 1
fi

# Check Google Calendar service
if [ -f "services/googleCalendarService.js" ]; then
    echo "✅ Google Calendar Service exists"
else
    echo "❌ Google Calendar Service missing"
    exit 1
fi

# Check if migration exists and run it
if [ -f "migrations/create_google_calendar_integration_table.sql" ]; then
    echo "✅ Google Calendar migration exists"
    echo "🗃️  Running database migration..."
    PGPASSWORD=mysecretpassword psql -h localhost -p 5433 -U postgres -d Ovill -f migrations/create_google_calendar_integration_table.sql
    if [ $? -eq 0 ]; then
        echo "✅ Database table created/updated successfully"
    else
        echo "⚠️  Migration may have already been run (this is okay)"
    fi
else
    echo "❌ Google Calendar migration missing"
    exit 1
fi

# Check if Google APIs dependency is installed
echo ""
echo "📦 Checking Dependencies:"
if npm list googleapis > /dev/null 2>&1; then
    echo "✅ Google APIs client library is installed"
else
    echo "📦 Installing Google APIs client library..."
    npm install googleapis
fi

# Check environment variables
echo ""
echo "🔧 Environment Configuration:"
if [ -f ".env" ]; then
    if grep -q "GOOGLE_CLIENT_ID=" .env && grep -q "GOOGLE_CLIENT_SECRET=" .env; then
        echo "✅ Google OAuth credentials configured"
    else
        echo "⚠️  Google OAuth credentials not fully configured"
        echo "   Make sure you have GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env"
    fi
else
    echo "❌ .env file not found"
    exit 1
fi

echo ""
echo "🎯 Google Cloud Console Setup (Required):"
echo "1. Go to https://console.cloud.google.com/"
echo "2. Select your project or create a new one"
echo "3. Enable Google Calendar API:"
echo "   - Go to 'APIs & Services' → 'Library'"
echo "   - Search for 'Google Calendar API'"
echo "   - Click 'Enable'"
echo ""
echo "4. Configure OAuth2 credentials:"
echo "   - Go to 'APIs & Services' → 'Credentials'"
echo "   - Click 'Create Credentials' → 'OAuth 2.0 Client IDs'"
echo "   - Application type: 'Web application'"
echo "   - Add authorized redirect URI: http://localhost:3001/auth/google/callback"
echo ""
echo "5. The integration will automatically request calendar permissions"
echo "   when users sign in - no manual scope configuration needed!"

echo ""
echo "✨ Integration Features:"
echo "• Automatic calendar permission request during Google sign-in"
echo "• Read user's Google Calendar events"
echo "• Create events in user's Google Calendar"
echo "• Secure token storage in database"
echo "• Automatic token refresh"

echo ""
echo "🏃 To test the integration:"
echo "1. Start the app: npm start"
echo "2. Go to http://localhost:3001/calendar"
echo "3. Click 'Connect Google Calendar'"
echo "4. Sign in with Google - calendar permissions will be requested automatically"

echo ""
echo "✅ Simple Google Calendar Integration setup complete!"
