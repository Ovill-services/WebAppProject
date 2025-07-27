#!/bin/bash

# Set default database password if not provided
export PGPASSWORD="${PGPASSWORD:-mysecretpassword}"

# Setup session table in PostgreSQL
echo "Setting up session table in PostgreSQL..."
psql -h localhost -p 5433 -U postgres -d Ovill -f "${SETUP_SESSIONS_SQL:-./setup-sessions.sql}"

# Start both applications
echo "Starting Public Site and Private Zone App..."

# Get current directory
CURRENT_DIR=$(pwd)

# Start Public Site in background
cd "${PUBLIC_SITE_DIR:-./public-site}"
echo "Installing dependencies for Public Site..."
npm install
echo "Starting Public Site on port 3000 with nodemon..."
PGPASSWORD="$PGPASSWORD" npx nodemon index.js &
PUBLIC_PID=$!

# Return to main directory and start Private Zone App
cd "$CURRENT_DIR"
cd "${PRIVATE_ZONE_APP_DIR:-./private-zone-app}"
echo "Installing dependencies for Private Zone App..."
npm install
echo "Starting Private Zone App on port 3001 with nodemon..."
PGPASSWORD="$PGPASSWORD" npx nodemon index.js &
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
