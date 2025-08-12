#!/bin/bash

# Update Picker Components from GitHub
# This script downloads the latest versions of the picker components from GitHub

echo "🔄 Updating Picker Components from GitHub..."

# Base directories
JS_DIR="private-zone-app/public/js/picker-components"
CSS_DIR="private-zone-app/public/style/picker-components"
GITHUB_BASE="https://raw.githubusercontent.com/OrenVill/picker-components/main"

# Create directories if they don't exist
mkdir -p "$JS_DIR"
mkdir -p "$CSS_DIR"

echo "📥 Downloading JavaScript files..."

# Download JavaScript files
curl -f -o "$JS_DIR/circular-time-picker.js" "$GITHUB_BASE/circular-time-picker.js"
if [ $? -eq 0 ]; then
    echo "✅ circular-time-picker.js updated"
else
    echo "❌ Failed to download circular-time-picker.js"
fi

curl -f -o "$JS_DIR/simple-date-picker.js" "$GITHUB_BASE/simple-date-picker.js"
if [ $? -eq 0 ]; then
    echo "✅ simple-date-picker.js updated"
else
    echo "❌ Failed to download simple-date-picker.js"
fi

echo "📥 Downloading CSS files..."

# Download CSS files
curl -f -o "$CSS_DIR/circular-time-picker.css" "$GITHUB_BASE/circular-time-picker.css"
if [ $? -eq 0 ]; then
    echo "✅ circular-time-picker.css updated"
else
    echo "❌ Failed to download circular-time-picker.css"
fi

curl -f -o "$CSS_DIR/simple-date-picker.css" "$GITHUB_BASE/simple-date-picker.css"
if [ $? -eq 0 ]; then
    echo "✅ simple-date-picker.css updated"
else
    echo "❌ Failed to download simple-date-picker.css"
fi

echo "🎉 Picker components update complete!"
echo "📝 Remember to restart your application if it's running"
