import { contextBridge, ipcRenderer } from 'electron';

function onDeduplicated(channel: string, callback: (...args: any[]) => void) {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, (_event: any, ...args: any[]) => callback(...args));
}

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('get-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  getOldDataPath: () => ipcRenderer.invoke('get-old-data-path'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('select-file', filters),

  // Listen for navigation from menu (deduplicated)
  onNavigate: (callback: (path: string) => void) => {
    onDeduplicated('navigate', callback);
  },

  // Listen for server actions from menu (deduplicated)
  onServerAction: (callback: (action: string) => void) => {
    onDeduplicated('server:action', callback);
  },

  // Auto-update
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  onUpdateChecking: (callback: () => void) => {
    onDeduplicated('update:checking', callback);
  },
  onUpdateAvailable: (callback: (version: string) => void) => {
    onDeduplicated('update:available', callback);
  },
  onUpdateNotAvailable: (callback: () => void) => {
    onDeduplicated('update:not-available', callback);
  },
  onUpdateProgress: (callback: (percent: number) => void) => {
    onDeduplicated('update:progress', callback);
  },
  onUpdateDownloaded: (callback: () => void) => {
    onDeduplicated('update:downloaded', callback);
  },
  onUpdateError: (callback: (message: string) => void) => {
    onDeduplicated('update:error', callback);
  },

  // Uninstall
  uninstallAppOnly: () => ipcRenderer.invoke('uninstall-app-only'),
  uninstallCompleteRemoval: () => ipcRenderer.invoke('uninstall-complete-removal'),

  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
