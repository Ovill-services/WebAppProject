#!/bin/bash

# Setup session table in PostgreSQL
echo "Setting up session table in PostgreSQL..."
PGPASSWORD=mysecretpassword psql -h localhost -p 5433 -U postgres -d Ovill -f /home/oren/test/setup-sessions.sql

# Start both applications
echo "Starting Public Site and Private Zone App..."

# Start Public Site in background
cd "/home/oren/test/public-site"
echo "Installing dependencies for Public Site..."
npm install
echo "Starting Public Site on port 3000..."
npm run dev &
PUBLIC_PID=$!

# Start Private Zone App in background
cd "/home/oren/test/private-zone-app"
echo "Installing dependencies for Private Zone App..."
npm install
echo "Starting Private Zone App on port 3001..."
npm run dev &
PRIVATE_PID=$!

echo ""
echo "Both applications are starting..."
echo "Public Site: http://localhost:3000"
echo "Private Zone App: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop both applications"

# Function to cleanup both processes
cleanup() {
    echo ""
    echo "Stopping applications..."
    kill $PUBLIC_PID 2>/dev/null
    kill $PRIVATE_PID 2>/dev/null
    exit 0
}

# Set trap to cleanup on Ctrl+C
trap cleanup INT

# Wait for processes
wait
