// planck.ai — Stealth Invisible Teleprompter Overlay
// Uses OS-level capture exclusion (WDA_EXCLUDEFROMCAPTURE on Windows, NSWindowSharingNone on macOS)
// The window is 100% visible on your physical screen, but completely INVISIBLE to Zoom, Meet, Teams screen shares!

const { app, BrowserWindow, screen, globalShortcut, session, desktopCapturer } = require('electron');
const path = require('path');
const http = require('http');

// Prevent Chromium from throttling audio and background timers in the overlay
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

let mainWindow = null;

function createStealthWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const winWidth = Math.min(580, Math.floor(width * 0.42));
  const winHeight = Math.min(640, Math.floor(height * 0.72));

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.floor((width - winWidth) / 2),
    y: 40,
    alwaysOnTop: true,
    transparent: false,
    frame: true,
    title: 'Planck.ai Stealth Copilot',
    // Win32 WS_EX_TOOLWINDOW: OS-level exclusion from Windows Taskbar & Alt+Tab
    type: process.platform === 'win32' ? 'toolbar' : 'normal',
    skipTaskbar: true, // Invisible on taskbar
    icon: path.join(__dirname, 'icon.ico'),
    hasShadow: true,
    resizable: true,
    minimizable: true,
    maximizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Explicitly enforce taskbar invisibility on Windows
  mainWindow.once('ready-to-show', () => {
    mainWindow.setSkipTaskbar(true);
    mainWindow.show();
  });

  // =========================================================================
  // THE SECRET VAULT / GHOST OVERLAY SHIELD:
  // Windows: calls SetWindowDisplayAffinity(hWnd, WDA_EXCLUDEFROMCAPTURE)
  // macOS: calls [window setSharingType:NSWindowSharingNone]
  // Zoom, Google Meet, Microsoft Teams, Slack, and Screen Recorders CANNOT CAPTURE THIS WINDOW!
  // =========================================================================
  mainWindow.setContentProtection(true);

  // Auto-detect: Accept CLI arg URL, or check localhost:3000, otherwise use Render cloud
  const localUrl = 'http://localhost:3000/live?room=main_room';
  const renderUrl = 'https://planck-ai.onrender.com/live?room=main_room';

  const cliUrl = process.argv.slice(1).find(arg => arg && (arg.startsWith('http://') || arg.startsWith('https://')));

  if (cliUrl) {
    console.log('[Stealth Overlay] Using CLI URL:', cliUrl);
    mainWindow.loadURL(cliUrl);
  } else if (process.env.PLANCK_URL) {
    console.log('[Stealth Overlay] Using custom PLANCK_URL:', process.env.PLANCK_URL);
    mainWindow.loadURL(process.env.PLANCK_URL);
  } else {
    const probeReq = http.get('http://localhost:3000/api/status', (res) => {
      if (res.statusCode === 200) {
        console.log('[Stealth Overlay] Connected to Local Server (0ms latency):', localUrl);
        mainWindow.loadURL(localUrl);
      } else {
        console.log('[Stealth Overlay] Connected to Cloud Server:', renderUrl);
        mainWindow.loadURL(renderUrl);
      }
    });
    probeReq.on('error', () => {
      console.log('[Stealth Overlay] Connected to Cloud Server:', renderUrl);
      mainWindow.loadURL(renderUrl);
    });
    probeReq.setTimeout(600, () => {
      probeReq.destroy();
      console.log('[Stealth Overlay] Connected to Cloud Server:', renderUrl);
      mainWindow.loadURL(renderUrl);
    });
  }

  // Enable F5, Ctrl+R to quickly reload, and F12 / Ctrl+Shift+I to open DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r') || (input.meta && input.key.toLowerCase() === 'r')) {
      console.log('[Stealth] Reloading page...');
      mainWindow.reload();
    }
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Global Panic Shortcut: Ctrl+Shift+H to immediately hide or unhide overlay
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
      console.log('[Stealth] Overlay hidden');
    } else {
      mainWindow.show();
      mainWindow.setSkipTaskbar(true);
      console.log('[Stealth] Overlay restored');
    }
  });

  // Global Quick Quit: Ctrl+Shift+Q to exit completely
  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    console.log('[Stealth] Quitting overlay...');
    app.quit();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Grant all media, microphone, and screen-capture permissions automatically
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });
  session.defaultSession.setPermissionCheckHandler(() => true);
  session.defaultSession.setDevicePermissionHandler(() => true);

  // Enable 1-click audio capture inside Electron (captures loopback audio from speakers/headphones)
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      if (sources && sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' });
      } else {
        callback(null);
      }
    } catch (err) {
      console.error('[Stealth Overlay] Display media handler error:', err);
      callback(null);
    }
  }, { useSystemPicker: false });

  createStealthWindow();
  console.log('====================================================');
  console.log('🛡️ PLANCK.AI STEALTH OVERLAY RUNNING');
  console.log('   - Windows Screen Capture Exclusion: ACTIVE');
  console.log('   - Taskbar Invisibility (WS_EX_TOOLWINDOW): ACTIVE');
  console.log('   - Loopback Audio Capture: ENABLED');
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
