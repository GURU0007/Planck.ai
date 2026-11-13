@echo off
title Planck.ai Invisible Stealth Copilot
echo ========================================================
echo  [Planck.ai] Launching Invisible Stealth Copilot...
echo  - Windows Capture Exclusion: ACTIVE (WDA_EXCLUDEFROMCAPTURE)
echo  - Zoom, Teams, and Google Meet CANNOT see this window!
echo  - Invisible even when sharing ENTIRE SCREEN!
echo  - Toggle show/hide anytime with: Ctrl+Shift+H
echo  - Quick Quit: Ctrl+Shift+Q
echo ========================================================
cd /d "%~dp0"

if exist "%~dp0node_modules\.bin\electron.cmd" (
    call "%~dp0node_modules\.bin\electron.cmd" stealth-overlay.js
) else (
    call npx electron stealth-overlay.js
)
if errorlevel 1 (
    echo.
    echo [Fallback] Electron not available, launching standalone browser window...
    if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
        start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="http://localhost:3000/live?room=main_room" --window-size=560,640
    ) else (
        start "" http://localhost:3000/live?room=main_room
    )
)
