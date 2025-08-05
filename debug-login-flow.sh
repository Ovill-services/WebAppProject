#!/bin/bash

echo "🔍 LOGIN FLOW DEBUGGING"
echo "======================"

# First, let's see what's actually happening in the requests
echo "1. Testing with curl verbose mode:"
echo "curl -d 'email=admin&password=admin123' -X POST http://localhost:3000/login -v"
echo ""

curl -d "email=admin&password=admin123" -X POST http://localhost:3000/login -v 2>&1 | grep -E "(> |< |Location)"

echo ""
echo "2. Checking recent logs:"
echo ""
docker-compose logs --tail=10 public-site

echo ""
echo "3. Let's also check if there are any other POST routes to /login:"
echo ""
grep -n "post.*login\|POST.*login" /home/oren/test/public-site/index.js

echo ""
echo "4. And let's check what's running in the container:"
echo ""
docker-compose exec public-site ps aux

echo ""
echo "🎯 SUMMARY:"
echo "If we see 'User logged in' but not '=== ABOUT TO REDIRECT ===' then"
echo "the code is failing somewhere between those two points."
