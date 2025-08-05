#!/bin/bash

# Test login functionality for containerized applications

echo "🧪 Testing Login Functionality"
echo "==============================="

# Test 1: Check if services are running
echo "1. Checking service health..."
PUBLIC_HEALTH=$(curl -s http://localhost:3000/health | jq -r '.status' 2>/dev/null || echo "FAIL")
PRIVATE_HEALTH=$(curl -s http://localhost:3001/health | jq -r '.status' 2>/dev/null || echo "FAIL")

echo "   Public Site Health: $PUBLIC_HEALTH"
echo "   Private Zone Health: $PRIVATE_HEALTH"

# Test 2: Check database connection
echo "2. Checking database..."
DB_USERS=$(docker exec postgres psql -U postgres -d Ovill -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' ')
echo "   Users in database: $DB_USERS"

# Test 3: Test login endpoint
echo "3. Testing login..."
# Get login page first to establish session
curl -s http://localhost:3000/login -c test_cookies.txt > /dev/null

# Attempt login
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=admin&password=admin123" \
  -b test_cookies.txt \
  -c test_cookies.txt \
  -w "%{http_code}")

echo "   Login response code: $LOGIN_RESPONSE"

# Test 4: Check if redirected to private zone
echo "4. Testing private zone access..."
PRIVATE_ACCESS=$(curl -s http://localhost:3001 \
  -b test_cookies.txt \
  -w "%{http_code}" \
  -o /dev/null)

echo "   Private zone access code: $PRIVATE_ACCESS"

# Clean up
rm -f test_cookies.txt

echo ""
if [ "$PUBLIC_HEALTH" = "OK" ] && [ "$PRIVATE_HEALTH" = "OK" ] && [ "$DB_USERS" -gt "0" ]; then
    echo "✅ All systems are operational!"
    echo "   You can now log in with: admin / admin123"
    echo "   Public Site: http://localhost:3000"
    echo "   Private Zone: http://localhost:3001"
else
    echo "❌ Some issues detected. Check the logs with:"
    echo "   ./docker-manager.sh logs"
fi
