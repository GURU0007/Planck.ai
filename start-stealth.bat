@echo off
title Planck.ai Copilot
cd /d "C:\Users\gurus\realtime-voice-copilot"

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="http://localhost:3000/live?room=main_room" --window-size=560,640
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app="http://localhost:3000/live?room=main_room" --window-size=560,640
) else (
    start "" http://localhost:3000/live?room=main_room
)
exit
