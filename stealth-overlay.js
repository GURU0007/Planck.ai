// planck.ai — Stealth Invisible Teleprompter Overlay
// Uses OS-level capture exclusion (WDA_EXCLUDEFROMCAPTURE on Windows, NSWindowSharingNone on macOS)
// The window is 100% visible on your physical screen, but completely INVISIBLE to Zoom, Meet, Teams screen shares!

const { app, BrowserWindow, screen, globalShortcut } = require('electron');

let mainWindow = null;

function createStealthWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const winWidth = Math.min(520, Math.floor(width * 0.35));
  const winHeight = Math.min(550, Math.floor(height * 0.6));

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.floor((width - winWidth) / 2),
    y: 60,
    alwaysOnTop: true,
    transparent: false,
    frame: true,
    title: 'Planck.ai Stealth Prompter',
    hasShadow: true,
    resizable: true,
    minimizable: true,
    maximizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // =========================================================================
  // THE SECRET VAULT / GHOST OVERLAY SHIELD:
  // Windows: calls SetWindowDisplayAffinity(hWnd, WDA_EXCLUDEFROMCAPTURE)
  // macOS: calls [window setSharingType:NSWindowSharingNone]
  // Zoom, Google Meet, Microsoft Teams, Slack, and Screen Recorders CANNOT CAPTURE THIS WINDOW!
  // =========================================================================
  mainWindow.setContentProtection(true);

  // URL to load: defaults to local server or Render live teleprompter
  const targetUrl = process.env.PLANCK_URL || 'https://planck-ai.onrender.com/live';
  console.log('[Stealth Overlay] Loading:', targetUrl);
  mainWindow.loadURL(targetUrl);

  // Global Panic Shortcut: Ctrl+Shift+H to immediately hide or unhide overlay
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
      console.log('[Stealth] Overlay hidden');
    } else {
      mainWindow.show();
      console.log('[Stealth] Overlay restored');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createStealthWindow();
  console.log('====================================================');
  console.log('🛡️ PLANCK.AI STEALTH OVERLAY RUNNING');
  console.log('   - Windows/Mac Screen Capture Exclusion: ACTIVE');
  console.log('   - Zoom, Google Meet & Teams see through this window');
  console.log('   - Toggle visibility anytime with: Ctrl+Shift+H');
  console.log('====================================================');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
