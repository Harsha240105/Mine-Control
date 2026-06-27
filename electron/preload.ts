import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('get-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  getOldDataPath: () => ipcRenderer.invoke('get-old-data-path'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('select-file', filters),

  // Listen for navigation from menu
  onNavigate: (callback: (path: string) => void) => {
    ipcRenderer.on('navigate', (_event, path: string) => callback(path));
  },

  // Listen for server actions from menu
  onServerAction: (callback: (action: string) => void) => {
    ipcRenderer.on('server:action', (_event, action: string) => callback(action));
  },

  // Auto-update
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  onUpdateChecking: (callback: () => void) => {
    ipcRenderer.on('update:checking', () => callback());
  },
  onUpdateAvailable: (callback: (version: string) => void) => {
    ipcRenderer.on('update:available', (_event, version: string) => callback(version));
  },
  onUpdateNotAvailable: (callback: () => void) => {
    ipcRenderer.on('update:not-available', () => callback());
  },
  onUpdateProgress: (callback: (percent: number) => void) => {
    ipcRenderer.on('update:progress', (_event, percent: number) => callback(percent));
  },
  onUpdateDownloaded: (callback: () => void) => {
    ipcRenderer.on('update:downloaded', () => callback());
  },
  onUpdateError: (callback: (message: string) => void) => {
    ipcRenderer.on('update:error', (_event, message: string) => callback(message));
  },

  // Uninstall
  uninstallAppOnly: () => ipcRenderer.invoke('uninstall-app-only'),
  uninstallCompleteRemoval: () => ipcRenderer.invoke('uninstall-complete-removal'),

  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
