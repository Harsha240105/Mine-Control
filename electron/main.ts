import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } from 'electron';
import path from 'path';
import net from 'net';
import { autoUpdater } from 'electron-updater';

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
    mainWindow?.webContents.send('update:error', 'Failed to check for updates. Please try again later.');
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
    const appRoot = path.join(app.getPath('exe'), '..', 'MineControl OS');
    process.env.APP_DATA_PATH = appRoot;
    process.env.MINECRAFT_DIR = path.join(appRoot, 'servers', 'default');
    try {
      require(path.join(__dirname, '../server/index.js'));
      await waitForPort(3001);
    } catch (err: any) {
      console.error('Failed to start server:', err);
      dialog.showErrorBox('Server Error', 'Failed to start the backend server.\n' + (err?.message || err));
    }

    // Auto-recovery: if the backend process dies, restart it
    let serverModule: any = null;
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
            serverModule = require(path.join(__dirname, '../server/index.js'));
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
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('http://localhost:3001');
  }

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
          click: () => require('electron').shell.openExternal('https://github.com/minecontrol-os/docs'),
        },
        {
          label: 'Report Issue',
          click: () => require('electron').shell.openExternal('https://github.com/minecontrol-os/issues'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  createTray();
}

function createTray() {
  const icon = nativeImage.createEmpty();
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

app.on('before-quit', () => {
  // Backend server runs in-process and will be cleaned up by app quit
});

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
ipcMain.handle('check-for-updates', () => {
  try {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('Failed to manually check for updates:', err);
    });
  } catch (err) {
    console.error('Synchronous error checking for updates:', err);
  }
});

ipcMain.handle('download-update', () => {
  autoUpdater.downloadUpdate().catch((err) => {
    console.error('Failed to download update:', err);
  });
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});
