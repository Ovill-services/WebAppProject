#!/bin/bash

# Script to prepare SQL initialization files for Docker

echo "Preparing SQL initialization files..."

# Copy existing SQL files to sql-init directory
if [ -f "setup-sessions.sql" ]; then
    cp setup-sessions.sql sql-init/01-setup-sessions.sql
    echo "✓ Copied setup-sessions.sql"
fi

if [ -f "add-user-fields.sql" ]; then
    cp add-user-fields.sql sql-init/02-add-user-fields.sql
    echo "✓ Copied add-user-fields.sql"
fi

# Copy migration SQL files
if [ -d "private-zone-app/migrations" ]; then
    cp private-zone-app/migrations/*.sql sql-init/ 2>/dev/null
    echo "✓ Copied migration files"
fi

echo "SQL initialization files prepared!"
echo "Files will be executed in alphabetical order when PostgreSQL container starts."
