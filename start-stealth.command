#!/bin/bash
# Double-click launcher for macOS
cd "$(dirname "$0")"
echo "========================================================"
echo " 🛡️ Launching Planck.ai Invisible Stealth Prompter (Mac)..."
echo " - macOS ScreenCaptureKit Exclusion: ACTIVE"
echo " - 100% Invisible on Zoom, Teams & Google Meet!"
echo " - Press Cmd+Shift+H to quickly toggle visibility"
echo "========================================================"
npx electron stealth-overlay.js
