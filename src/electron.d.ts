interface ElectronAPI {
  getAppPath: () => Promise<string>;
  getDataPath: () => Promise<string>;
  getUserDataPath: () => Promise<string>;
  getOldDataPath: () => Promise<string>;
  selectDirectory: () => Promise<string | null>;
  selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
  onNavigate: (callback: (path: string) => void) => void;
  onServerAction: (callback: (action: string) => void) => void;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateChecking: (callback: () => void) => void;
  onUpdateAvailable: (callback: (version: string) => void) => void;
  onUpdateNotAvailable: (callback: () => void) => void;
  onUpdateProgress: (callback: (percent: number) => void) => void;
  onUpdateDownloaded: (callback: () => void) => void;
  onUpdateError: (callback: (message: string) => void) => void;
  uninstallAppOnly: () => Promise<{ success: boolean; error?: string }>;
  uninstallCompleteRemoval: () => Promise<{ success: boolean; error?: string }>;
  getVersion: () => Promise<string>;
  removeAllListeners: (channel: string) => void;
}

declare module 'react-gauge-chart';

interface Window {
  electronAPI: ElectronAPI;
}
