#!/bin/bash

echo "🎯 TESTING TOKEN-BASED LOGIN"
echo "============================="

echo "Step 1: Login and get token"
LOGIN_RESPONSE=$(curl -s -d "email=admin&password=admin123" -X POST http://localhost:3000/login)
echo "Login response: $LOGIN_RESPONSE"

# Extract token from redirect URL
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o 'token=[^"]*' | cut -d= -f2)
echo "Extracted token: ${TOKEN:0:20}..."

if [ -n "$TOKEN" ]; then
    echo ""
    echo "Step 2: Test private zone with token"
    curl -v "http://localhost:3001?token=$TOKEN" 2>&1 | head -20
else
    echo "❌ No token found!"
fi
