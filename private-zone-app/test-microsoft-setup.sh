#!/bin/bash

# Test Microsoft Integration Setup
echo "🔍 Testing Microsoft Integration Setup..."

# Check if required files exist
echo "📁 Checking required files..."

if [ -f ".env" ]; then
    echo "✅ .env file exists"
else
    echo "❌ .env file missing"
    exit 1
fi

if [ -f "services/microsoftAuthService.js" ]; then
    echo "✅ Microsoft Auth Service exists"
else
    echo "❌ Microsoft Auth Service missing"
    exit 1
fi

if [ -f "services/microsoftGraphService.js" ]; then
    echo "✅ Microsoft Graph Service exists"
else
    echo "❌ Microsoft Graph Service missing"
    exit 1
fi

# Check environment variables
echo "🔧 Checking environment variables..."

if grep -q "MICROSOFT_CLIENT_ID=" .env; then
    echo "✅ MICROSOFT_CLIENT_ID configured"
else
    echo "⚠️  MICROSOFT_CLIENT_ID not configured"
fi

if grep -q "MICROSOFT_CLIENT_SECRET=" .env; then
    echo "✅ MICROSOFT_CLIENT_SECRET configured"
else
    echo "⚠️  MICROSOFT_CLIENT_SECRET not configured"
fi

if grep -q "MICROSOFT_TENANT_ID=" .env; then
    echo "✅ MICROSOFT_TENANT_ID configured"
else
    echo "⚠️  MICROSOFT_TENANT_ID not configured"
fi

# Check database table
echo "🗄️ Checking database table..."

PGPASSWORD=mysecretpassword psql -h localhost -p 5433 -U postgres -d Ovill -c "\dt microsoft_integration" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Microsoft integration table exists"
else
    echo "❌ Microsoft integration table missing"
    echo "   Run: psql -h localhost -p 5433 -U postgres -d Ovill -f migrations/create_microsoft_integration_table.sql"
fi

# Check npm dependencies
echo "📦 Checking npm dependencies..."

if npm list @azure/msal-node > /dev/null 2>&1; then
    echo "✅ @azure/msal-node installed"
else
    echo "❌ @azure/msal-node missing"
fi

if npm list @microsoft/microsoft-graph-client > /dev/null 2>&1; then
    echo "✅ @microsoft/microsoft-graph-client installed"
else
    echo "❌ @microsoft/microsoft-graph-client missing"
fi

if npm list axios > /dev/null 2>&1; then
    echo "✅ axios installed"
else
    echo "❌ axios missing"
fi

if npm list dotenv > /dev/null 2>&1; then
    echo "✅ dotenv installed"
else
    echo "❌ dotenv missing"
fi

echo ""
echo "🚀 Setup Status Summary:"
echo "   Next steps:"
echo "   1. Complete Azure app registration (see MICROSOFT_SETUP_GUIDE.md)"
echo "   2. Update .env with your Azure app credentials"
echo "   3. Start the application: npm run dev"
echo "   4. Test integration at: http://localhost:3001/calendar"
echo ""
echo "📖 For detailed setup instructions, see: MICROSOFT_SETUP_GUIDE.md"
