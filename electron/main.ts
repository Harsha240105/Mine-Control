import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;

function createWindow() {
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

  // In development, load from Vite dev server
  // In production, load the built files
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Start the backend server
    startBackendServer();
    mainWindow.loadFile(path.join(__dirname, '../client/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Set application menu
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

  // Create system tray
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

function startBackendServer() {
  const serverPath = path.join(__dirname, '../server/index.js');
  serverProcess = spawn('node', [serverPath], {
    stdio: 'pipe',
    env: { ...process.env, PORT: '3001' },
  });

  serverProcess.stdout?.on('data', (data) => {
    console.log(`[Server] ${data}`);
  });

  serverProcess.stderr?.on('data', (data) => {
    console.error(`[Server Error] ${data}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
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
  if (serverProcess) {
    serverProcess.kill();
  }
});

// IPC handlers
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
