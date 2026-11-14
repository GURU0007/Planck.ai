#!/bin/bash
# Double-click launcher for macOS (Zero install required)
cd "$(dirname "$0")"
TARGET_URL="https://planck-ai.onrender.com/live?room=main_room"

echo "========================================================"
echo " 🛡️ Launching Planck.ai Stealth Prompter (Mac)..."
echo " - Connecting to: $TARGET_URL"
echo " - 100% Invisible to Zoom, Teams & Google Meet screen-shares"
echo "========================================================"

# If Electron is installed, launch native ghost overlay
if [ -f "./node_modules/.bin/electron" ]; then
    ./node_modules/.bin/electron stealth-overlay.js && exit 0
fi

# Otherwise, launch standalone app mode via Chrome, Edge, Brave, or default browser
if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app="$TARGET_URL" --window-size=580,640
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    open -na "Microsoft Edge" --args --app="$TARGET_URL" --window-size=580,640
elif [ -d "/Applications/Brave Browser.app" ]; then
    open -na "Brave Browser" --args --app="$TARGET_URL" --window-size=580,640
else
    open "$TARGET_URL"
fi

osascript -e 'tell application "Terminal" to close first window' &>/dev/null &
exit 0
