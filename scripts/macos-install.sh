#!/bin/bash
# macOS Install Helper for AWS Login Hub
# Run this after downloading the .dmg to fix Gatekeeper "damaged" error

echo "🔧 AWS Login Hub - macOS Install Helper"
echo "======================================="

APP_PATH="/Applications/AWS Login Hub.app"

if [ ! -d "$APP_PATH" ]; then
    echo "❌ App not found at $APP_PATH"
    echo "   Please drag 'AWS Login Hub' to Applications first, then run this script."
    exit 1
fi

echo "→ Removing quarantine flag..."
sudo xattr -cr "$APP_PATH"

if [ $? -eq 0 ]; then
    echo "✅ Done! You can now open AWS Login Hub."
    echo "→ Launching app..."
    open "$APP_PATH"
else
    echo "❌ Failed. Try running: sudo xattr -cr \"$APP_PATH\""
fi
