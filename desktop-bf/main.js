const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const URLS = {
  online: 'https://jingchen.zbjh.top',
  local:  'http://localhost:3091',
};
const APP_NAME = '景琛';
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let currentMode = 'online';
let alwaysOnTop = true;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      if (cfg.mode && URLS[cfg.mode]) currentMode = cfg.mode;
      if (typeof cfg.alwaysOnTop === 'boolean') alwaysOnTop = cfg.alwaysOnTop;
    }
  } catch {}
}

function saveConfig() {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify({ mode: currentMode, alwaysOnTop })); } catch {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380, height: 550,
    minWidth: 300, minHeight: 420,
    x: 40, y: 100,
    frame: false,
    alwaysOnTop: alwaysOnTop,
    resizable: true,
    skipTaskbar: false,
    backgroundColor: '#0F172A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
    },
  });
  loadURL();
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(`
      body { -webkit-app-region: drag; }
      button, input, textarea, select, [role="button"] { -webkit-app-region: no-drag; }
      .overflow-y-auto { -webkit-app-region: no-drag; }
      .fixed.inset-0.z-50 { -webkit-app-region: no-drag; }
    `);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('close', (event) => {
    if (!isQuitting) { event.preventDefault(); mainWindow.hide(); }
  });
}

function loadURL() { if (mainWindow) mainWindow.loadURL(URLS[currentMode]); }

function switchMode(mode) {
  if (currentMode === mode) return;
  currentMode = mode; saveConfig(); loadURL();
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 / 隐藏', click: () => { if (mainWindow) mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); } },
    { type: 'separator' },
    { label: '线上公开版', type: 'radio', checked: currentMode === 'online', click: () => switchMode('online') },
    { label: '本地完整版', type: 'radio', checked: currentMode === 'local', click: () => switchMode('local') },
    { type: 'separator' },
    { label: 'Always on Top', type: 'checkbox', checked: alwaysOnTop, click: (item) => { alwaysOnTop = item.checked; if (mainWindow) mainWindow.setAlwaysOnTop(alwaysOnTop); saveConfig(); } },
    { label: 'Open at Login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }) },
    { type: 'separator' },
    { label: 'Exit', click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  updateTrayMenu();
  tray.on('click', () => { if (mainWindow) mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); });
}

app.whenReady().then(() => { loadConfig(); createWindow(); createTray(); });
app.on('window-all-closed', () => {});
app.on('activate', () => { if (mainWindow) mainWindow.show(); });
app.on('before-quit', () => { isQuitting = true; saveConfig(); });
