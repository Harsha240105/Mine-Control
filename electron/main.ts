import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { autoUpdater } from 'electron-updater';
import { migrateData, backupCriticalFiles, cleanupOldBackups, MigrationReport } from './migration';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function waitForPort(port: number, timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      const client = new net.Socket();
      client.once('connect', () => { client.destroy(); resolve(); });
      client.once('error', () => {
        client.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error(`Server did not start within ${timeout}ms`));
        } else {
          setTimeout(check, 200);
        }
      });
      client.connect(port, '127.0.0.1');
    }
    check();
  });
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update:checking');
  });

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update:not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:progress', progress.percent);
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update:downloaded');
  });

  autoUpdater.on('error', (err) => {
    console.error('AutoUpdater error:', err);
    const msg = (err?.message || err?.toString() || 'Unknown error').toLowerCase();
    let userMsg: string;
    if (msg.includes('404') || msg.includes('not found') || msg.includes('no published') || msg.includes('no releases')) {
      userMsg = 'No update channel configured. Updates will be available when a new version is published with installer assets.';
    } else if (msg.includes('net_err') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('timeout') || msg.includes('econnreset') || msg.includes('econnaborted')) {
      userMsg = 'Unable to reach update server. Check your internet connection.';
    } else if (msg.includes('rate limit') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('401')) {
      userMsg = 'GitHub API rate limited. Updates will be checked again later automatically.';
    } else {
      userMsg = `Update check failed: ${err?.message || err?.toString() || 'Unknown error'}`;
    }
    mainWindow?.webContents.send('update:error', userMsg);
  });

  setTimeout(() => {
    try {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('Failed during autoUpdater.checkForUpdates():', err);
      });
    } catch (err) {
      console.error('Synchronous error in autoUpdater:', err);
    }
  }, 5000);
}

async function createWindow() {
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

  if (!isDev) {
    const userDataPath = app.getPath('userData');
    const oldDataPath = path.join(path.dirname(app.getPath('exe')), 'MineControl OS');

    // Set up GitHub token for auto-updater if available
    if (!process.env.GH_TOKEN) {
      const ghTokenPath = path.join(userDataPath, 'config', 'github_token.txt');
      try {
        if (fs.existsSync(ghTokenPath)) {
          process.env.GH_TOKEN = fs.readFileSync(ghTokenPath, 'utf-8').trim();
        }
      } catch {}
    }

    process.env.APP_DATA_PATH = userDataPath;
    process.env.MINECRAFT_DIR = path.join(userDataPath, 'servers', 'default');

    // Run data migration from old location to new persistent location
    if (fs.existsSync(oldDataPath)) {
      console.log('[Migration] Detected old data at:', oldDataPath);
      console.log('[Migration] Migrating to:', userDataPath);
      const report: MigrationReport = migrateData(oldDataPath, userDataPath);
      if (report.completed) {
        console.log('[Migration] Complete:', report.moved.length, 'items moved,', report.skipped.length, 'skipped');
      } else {
        console.error('[Migration] Failed:', report.errors);
      }
    }

    try {
      require(path.join(__dirname, '../server/index.js'));
      await waitForPort(3001);
    } catch (err: any) {
      console.error('Failed to start server:', err);
      dialog.showErrorBox('Server Error', 'Failed to start the backend server.\n' + (err?.message || err));
    }

    // Auto-recovery: if the backend process dies, restart it
    const recoveryInterval = setInterval(async () => {
      try {
        const client = new net.Socket();
        const alive = await new Promise<boolean>((resolve) => {
          client.setTimeout(2000);
          client.on('connect', () => { client.destroy(); resolve(true); });
          client.on('error', () => { client.destroy(); resolve(false); });
          client.on('timeout', () => { client.destroy(); resolve(false); });
          client.connect(3001, '127.0.0.1');
        });
        if (!alive) {
          console.log('[Auto-Recovery] Backend unreachable, attempting restart...');
          try {
            delete require.cache[require.resolve(path.join(__dirname, '../server/index.js'))];
            require(path.join(__dirname, '../server/index.js'));
            await waitForPort(3001, 20000);
            console.log('[Auto-Recovery] Backend restarted successfully');
          } catch (restartErr: any) {
            console.error('[Auto-Recovery] Failed to restart backend:', restartErr);
          }
        }
      } catch (e) {
        // ignore check errors
      }
    }, 10000);

    app.on('before-quit', () => {
      clearInterval(recoveryInterval);
    });
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'MineControl OS',
    backgroundColor: '#020617',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('http://localhost:3001');
  }

  // Content Security Policy header
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws://localhost:* http://localhost:*; font-src 'self'",
        ],
      },
    });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (!isDev) {
      setupAutoUpdater();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'MineControl OS',
      submenu: [
        { label: 'About MineControl OS', role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.send('navigate', '/settings'),
        },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Server',
      submenu: [
        {
          label: 'Start Server',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.send('server:action', 'start'),
        },
        {
          label: 'Stop Server',
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => mainWindow?.webContents.send('server:action', 'stop'),
        },
        {
          label: 'Restart Server',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow?.webContents.send('server:action', 'restart'),
        },
        { type: 'separator' },
        {
          label: 'Create Backup',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => mainWindow?.webContents.send('server:action', 'backup'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Dashboard', accelerator: 'CmdOrCtrl+1', click: () => mainWindow?.webContents.send('navigate', '/dashboard') },
        { label: 'Players', accelerator: 'CmdOrCtrl+2', click: () => mainWindow?.webContents.send('navigate', '/players') },
        { label: 'Console', accelerator: 'CmdOrCtrl+3', click: () => mainWindow?.webContents.send('navigate', '/console') },
        { label: 'Worlds', accelerator: 'CmdOrCtrl+4', click: () => mainWindow?.webContents.send('navigate', '/worlds') },
        { label: 'Backups', accelerator: 'CmdOrCtrl+5', click: () => mainWindow?.webContents.send('navigate', '/backups') },
        { type: 'separator' },
        { label: 'Toggle Developer Tools', role: 'toggleDevTools' },
        { label: 'Reload', role: 'reload' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          accelerator: 'CmdOrCtrl+U',
          click: () => {
            if (!isDev) {
              autoUpdater.checkForUpdates().catch(() => {});
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/minecontrol-os/docs'),
        },
        {
          label: 'Feedback Center',
          click: () => mainWindow?.webContents.send('navigate', '/feedback'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  createTray();
}

function createTray() {
  const iconPath = path.join(__dirname, '../public/logo.png');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show MineControl OS',
      click: () => mainWindow?.show(),
    },
    { type: 'separator' },
    {
      label: 'Start Server',
      click: () => mainWindow?.webContents.send('server:action', 'start'),
    },
    {
      label: 'Stop Server',
      click: () => mainWindow?.webContents.send('server:action', 'stop'),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);

  tray.setToolTip('MineControl OS');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow?.show();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

// before-quit cleanup is handled at line 149

// IPC handlers
ipcMain.handle('get-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-path', () => {
  return app.getAppPath();
});

ipcMain.handle('get-data-path', () => {
  return path.join(app.getPath('userData'), 'data');
});

ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

ipcMain.handle('get-old-data-path', () => {
  return path.join(path.dirname(app.getPath('exe')), 'MineControl OS');
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-file', async (_event, filters?: { name: string; extensions: string[] }[]) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters,
  });
  return result.canceled ? null : result.filePaths[0];
});

// Auto-update IPC handlers
ipcMain.handle('check-for-updates', async () => {
  try {
    await autoUpdater.checkForUpdates();
  } catch (err: any) {
    console.error('Failed to check for updates:', err);
    mainWindow?.webContents.send('update:error', err?.message || 'Failed to check for updates');
  }
});

ipcMain.handle('download-update', async () => {
  const userDataPath = app.getPath('userData');
  console.log('[Updater] Backing up critical files before update...');
  const backupDir = backupCriticalFiles(userDataPath);
  if (backupDir) {
    console.log('[Updater] Backup saved to:', backupDir);
  } else {
    console.warn('[Updater] Backup failed, proceeding with update anyway');
  }
  cleanupOldBackups(userDataPath, 5);
  try {
    await autoUpdater.downloadUpdate();
  } catch (err: any) {
    console.error('Failed to download update:', err);
    mainWindow?.webContents.send('update:error', `Download failed: ${err?.message || 'Unknown error'}`);
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

// Uninstall IPC handlers
ipcMain.handle('uninstall-app-only', async () => {
  const { execSync } = require('child_process');
  const exePath = app.getPath('exe');
  const installDir = path.dirname(exePath);
  const uninstallPath = path.join(installDir, 'Uninstall MineControl OS.exe');

  if (fs.existsSync(uninstallPath)) {
    try {
      execSync(`"${uninstallPath}"`, { detached: true });
      app.quit();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: 'Uninstaller not found at ' + uninstallPath };
});

ipcMain.handle('uninstall-complete-removal', async () => {
  const userDataPath = app.getPath('userData');
  const oldDataPath = path.join(path.dirname(app.getPath('exe')), 'MineControl OS');

  try {
    if (fs.existsSync(userDataPath)) {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
    if (fs.existsSync(oldDataPath)) {
      fs.rmSync(oldDataPath, { recursive: true, force: true });
    }
  } catch (e: any) {
    console.error('[Uninstall] Failed to remove user data:', e.message);
    return { success: false, error: e.message };
  }

  const { execSync } = require('child_process');
  const exePath = app.getPath('exe');
  const installDir = path.dirname(exePath);
  const uninstallPath = path.join(installDir, 'Uninstall MineControl OS.exe');

  if (fs.existsSync(uninstallPath)) {
    try {
      execSync(`"${uninstallPath}"`, { detached: true });
      app.quit();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: 'Uninstaller not found at ' + uninstallPath };
});
