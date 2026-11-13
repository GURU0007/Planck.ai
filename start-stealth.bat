@echo off
title Planck.ai Stealth Copilot
cd /d "%~dp0"
echo ========================================================
echo  [Planck.ai] Launching Invisible Stealth Q^&A Copilot...
echo  - OS Capture Exclusion Active (WDA_EXCLUDEFROMCAPTURE)
echo  - 100%% Invisible on Zoom, Teams ^& Google Meet!
echo  - Press Ctrl+Shift+H to quickly toggle visibility
echo  - Press Ctrl+Shift+Q to quit
echo ========================================================
if exist ".\node_modules\electron\dist\electron.exe" (
    .\node_modules\electron\dist\electron.exe stealth-overlay.js
) else (
    npx electron stealth-overlay.js
)
