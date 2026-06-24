interface ElectronAPI {
  getAppPath: () => Promise<string>;
  getDataPath: () => Promise<string>;
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
  removeAllListeners: (channel: string) => void;
}

interface Window {
  electronAPI: ElectronAPI;
}