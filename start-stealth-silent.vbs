Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\gurus\realtime-voice-copilot"
WshShell.Run "node_modules\electron\dist\electron.exe stealth-overlay.js", 0, False
