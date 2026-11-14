@echo off
title Planck.ai Stealth Copilot
set "TARGET_URL=https://planck-ai.onrender.com/live?room=main_room"

echo ========================================================
echo  [Planck.ai] Launching Invisible Stealth Copilot...
echo  - Target: %TARGET_URL%
echo  - Invisible to Zoom, Teams ^& Google Meet
echo  - Standalone HUD window (Zero local install required)
echo ========================================================
cd /d "%~dp0"

:: If Electron is locally installed, run the ghost overlay shield
if exist "%~dp0node_modules\.bin\electron.cmd" (
    call "%~dp0node_modules\.bin\electron.cmd" stealth-overlay.js
    if not errorlevel 1 exit
)

:: Otherwise, launch distraction-free Chrome / Edge / Brave app window directly to production
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%TARGET_URL%" --window-size=580,640
    exit
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%TARGET_URL%" --window-size=580,640
    exit
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --app="%TARGET_URL%" --window-size=580,640
    exit
)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%TARGET_URL%" --window-size=580,640
    exit
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="%TARGET_URL%" --window-size=580,640
    exit
)
if exist "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe" (
    start "" "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe" --app="%TARGET_URL%" --window-size=580,640
    exit
)

:: Fallback
start "" "%TARGET_URL%"
exit
