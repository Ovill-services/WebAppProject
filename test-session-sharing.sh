#!/bin/bash

# Test session sharing between applications

echo "🔐 Testing Session Sharing Between Applications"
echo "=============================================="

# Clean up any existing cookies
rm -f test_session_cookies.txt

echo "1. Testing login on public site..."
# First, get the login page to establish initial session
curl -s http://localhost:3000/login -c test_session_cookies.txt > /dev/null

# Attempt login
LOGIN_RESULT=$(curl -s -X POST http://localhost:3000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=admin&password=admin123" \
  -b test_session_cookies.txt \
  -c test_session_cookies.txt \
  -w "%{redirect_url}|%{http_code}" \
  -o /dev/null)

echo "   Login result: $LOGIN_RESULT"

echo "2. Testing direct access to private zone..."
PRIVATE_ACCESS=$(curl -s http://localhost:3001/dashboard \
  -b test_session_cookies.txt \
  -w "%{http_code}" \
  -o private_response.html)

echo "   Private zone access code: $PRIVATE_ACCESS"

echo "3. Checking session cookies..."
if [ -f test_session_cookies.txt ]; then
    echo "   Session cookies found:"
    cat test_session_cookies.txt | grep -v "^#" | head -3
else
    echo "   No session cookies found"
fi

echo "4. Testing session data in database..."
SESSION_COUNT=$(docker exec postgres psql -U postgres -d Ovill -t -c "SELECT COUNT(*) FROM session;" 2>/dev/null | tr -d ' ')
echo "   Active sessions in database: $SESSION_COUNT"

# Check if private response contains dashboard content or login redirect
if [ -f private_response.html ]; then
    if grep -q "dashboard\|Dashboard\|Private Zone" private_response.html 2>/dev/null; then
        echo "✅ SUCCESS: Session sharing works! Private zone accessible after login."
    elif grep -q "login\|Login" private_response.html 2>/dev/null; then
        echo "❌ ISSUE: Still redirecting to login page."
    else
        echo "⚠️  UNCLEAR: Unable to determine response content."
    fi
else
    echo "❌ ERROR: No response from private zone."
fi

# Clean up
rm -f test_session_cookies.txt private_response.html

echo ""
echo "🔍 Manual Test Instructions:"
echo "1. Open browser to http://localhost:3000"
echo "2. Login with admin/admin123"  
echo "3. You should be redirected to http://localhost:3001/dashboard"
echo "4. Or manually navigate to http://localhost:3001 after login"
