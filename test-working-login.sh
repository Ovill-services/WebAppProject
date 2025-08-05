#!/bin/bash

echo "🎉 COMPLETE LOGIN FLOW TEST"
echo "==========================="

echo "✅ Step 1: Login and get redirect with token"
LOGIN_RESPONSE=$(curl -s -d "email=admin&password=admin123" -X POST http://localhost:3000/login)
echo "Response: $LOGIN_RESPONSE"

# Extract token from redirect URL
TOKEN_URL=$(echo "$LOGIN_RESPONSE" | grep -o 'http://localhost:3001?token=[^"]*')
echo "Token URL: $TOKEN_URL"

if [[ $TOKEN_URL == *"token="* ]]; then
    echo ""
    echo "✅ Step 2: Access private zone with token (should authenticate and redirect)"
    curl -s -c /tmp/final_cookies.txt -b /tmp/final_cookies.txt "$TOKEN_URL" > /tmp/first_response.html
    echo "First request completed (token authentication)"
    
    echo ""
    echo "✅ Step 3: Access private zone without token (should use session)"
    curl -s -b /tmp/final_cookies.txt "http://localhost:3001" > /tmp/second_response.html
    
    echo ""
    echo "✅ Step 4: Check results"
    if grep -q "My App\|Dashboard\|Private Zone" /tmp/second_response.html; then
        echo "🎉 SUCCESS! You can now:"
        echo "   1. Login at: http://localhost:3000/login"
        echo "   2. Get automatically redirected to: http://localhost:3001"  
        echo "   3. Access the private zone dashboard!"
        echo ""
        echo "📊 Response size: $(wc -c < /tmp/second_response.html) bytes"
        echo "📝 Page title: $(grep -o '<title>[^<]*</title>' /tmp/second_response.html)"
    else
        echo "❌ Still having issues with session persistence"
        echo "Response preview:"
        head -5 /tmp/second_response.html
    fi
    
    # Cleanup
    rm -f /tmp/final_cookies.txt /tmp/first_response.html /tmp/second_response.html
else
    echo "❌ No token found in login response!"
fi

echo ""
echo "🔍 Final check - verify all services are running:"
docker-compose ps
