@echo off
title Planck.ai Stealth Prompter
echo ========================================================
echo  🛡️ Launching Planck.ai Invisible Stealth Prompter...
echo  - OS Capture Exclusion Active (WDA_EXCLUDEFROMCAPTURE)
echo  - 100%% Invisible on Zoom, Teams & Google Meet!
echo  - Press Ctrl+Shift+H to quickly toggle visibility
echo ========================================================
cd /d "%~dp0"
npx electron stealth-overlay.js
pause
