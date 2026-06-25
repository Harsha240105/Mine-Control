import React, { useState, useEffect } from 'react';
import { Download, CheckCircle, AlertCircle, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AutoUpdater() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [version, setVersion] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onUpdateChecking(() => {
      setStatus('checking');
    });

    window.electronAPI.onUpdateAvailable((v: string) => {
      setVersion(v);
      setStatus('available');
      setVisible(true);
    });

    window.electronAPI.onUpdateNotAvailable(() => {
      setStatus('idle');
    });

    window.electronAPI.onUpdateProgress((p: number) => {
      setStatus('downloading');
      setProgress(p);
    });

    window.electronAPI.onUpdateDownloaded(() => {
      setStatus('downloaded');
      toast.success('Update downloaded successfully!');
    });

    window.electronAPI.onUpdateError((err: string) => {
      setStatus('error');
      setErrorMsg(err);
      toast.error(`Update error: ${err}`);
    });

    // Check for updates on mount
    window.electronAPI.checkForUpdates();

    return () => {
      window.electronAPI.removeAllListeners('update:checking');
      window.electronAPI.removeAllListeners('update:available');
      window.electronAPI.removeAllListeners('update:not-available');
      window.electronAPI.removeAllListeners('update:progress');
      window.electronAPI.removeAllListeners('update:downloaded');
      window.electronAPI.removeAllListeners('update:error');
    };
  }, []);

  const handleDownload = () => {
    if (window.electronAPI) {
      window.electronAPI.downloadUpdate();
    }
  };

  const handleInstall = () => {
    if (window.electronAPI) {
      window.electronAPI.installUpdate();
    }
  };

  if (!visible || status === 'idle' || status === 'checking') return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 bg-surface-800 border border-surface-700 shadow-xl rounded-2xl overflow-hidden animate-in slide-in-from-bottom-5">
      <div className="p-4 border-b border-surface-700 flex items-center justify-between bg-surface-800/50">
        <div className="flex items-center gap-2">
          {status === 'available' && <Download className="w-5 h-5 text-blue-400" />}
          {status === 'downloading' && <Loader2 className="w-5 h-5 text-minecraft-400 animate-spin" />}
          {status === 'downloaded' && <CheckCircle className="w-5 h-5 text-green-400" />}
          {status === 'error' && <AlertCircle className="w-5 h-5 text-red-400" />}
          <h3 className="font-semibold text-gray-200">
            {status === 'available' && 'Update Available'}
            {status === 'downloading' && 'Downloading Update...'}
            {status === 'downloaded' && 'Ready to Install'}
            {status === 'error' && 'Update Failed'}
          </h3>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4">
        {status === 'available' && (
          <div>
            <p className="text-sm text-gray-400 mb-4">
              MineControl OS version <span className="text-white font-medium">{version}</span> is available. Would you like to download it now?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setVisible(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white transition-colors"
              >
                Later
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                Download Update
              </button>
            </div>
          </div>
        )}

        {status === 'downloading' && (
          <div>
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>Downloading v{version}...</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-2 bg-surface-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-minecraft-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {status === 'downloaded' && (
          <div>
            <p className="text-sm text-gray-400 mb-4">
              Version <span className="text-white font-medium">{version}</span> has been downloaded. The application will restart to install the update.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setVisible(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white transition-colors"
              >
                Install Later
              </button>
              <button
                onClick={handleInstall}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-500 text-white transition-colors"
              >
                Restart & Install
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div>
            <p className="text-sm text-red-400 mb-4">{errorMsg || 'An unknown error occurred during update.'}</p>
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setStatus('idle');
                  setVisible(false);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-surface-700 hover:bg-surface-600 text-white transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
