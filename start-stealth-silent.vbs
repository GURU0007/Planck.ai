Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\gurus\realtime-voice-copilot"
WshShell.Run "npx electron stealth-overlay.js", 0, False
