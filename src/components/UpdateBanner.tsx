import { useState, useEffect, useCallback } from 'react';
import { Download, RotateCw, RefreshCw, X } from 'lucide-react';

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState>('idle');
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [dismissed, setDismissed] = useState(false);

  const api = (window as any).electronAPI;

  useEffect(() => {
    if (!api) return;

    const onChecking = () => setState('checking');
    const onAvailable = (v: string) => {
      setVersion(v);
      setState('available');
      setDismissed(false);
    };
    const onNotAvailable = () => setState('idle');
    const onProgress = (p: number) => {
      setProgress(Math.round(p));
      setState('downloading');
    };
    const onDownloaded = () => setState('downloaded');
    const onError = (msg: string) => {
      setErrorMessage(msg);
      setState('error');
    };

    api.onUpdateChecking(onChecking);
    api.onUpdateAvailable(onAvailable);
    api.onUpdateNotAvailable(onNotAvailable);
    api.onUpdateProgress(onProgress);
    api.onUpdateDownloaded(onDownloaded);
    api.onUpdateError(onError);

    return () => {
      if (api.removeAllListeners) {
        api.removeAllListeners('update:checking');
        api.removeAllListeners('update:available');
        api.removeAllListeners('update:not-available');
        api.removeAllListeners('update:progress');
        api.removeAllListeners('update:downloaded');
        api.removeAllListeners('update:error');
      }
    };
  }, [api]);

  const handleDownload = useCallback(() => {
    if (api) api.downloadUpdate();
  }, [api]);

  const handleInstall = useCallback(() => {
    if (api) api.installUpdate();
  }, [api]);

  if (!api || dismissed) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-minecraft-600/20 border border-minecraft-500/30 rounded-lg text-xs">
      {state === 'checking' && (
        <>
          <RefreshCw size={12} className="animate-spin text-minecraft-400" />
          <span className="text-gray-300">Checking for updates...</span>
        </>
      )}

      {state === 'available' && (
        <>
          <span className="text-gray-200">
            Update <span className="text-minecraft-400 font-semibold">v{version}</span> available
          </span>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2 py-1 bg-minecraft-600 hover:bg-minecraft-500 text-white rounded transition-colors"
          >
            <Download size={12} />
            Download
          </button>
          <button onClick={() => setDismissed(true)} className="text-gray-500 hover:text-gray-300">
            <X size={12} />
          </button>
        </>
      )}

      {state === 'downloading' && (
        <>
          <RefreshCw size={12} className="animate-spin text-minecraft-400" />
          <span className="text-gray-300">Downloading update...</span>
          <div className="w-20 h-1.5 bg-surface-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-minecraft-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-gray-400 w-8">{progress}%</span>
        </>
      )}

      {state === 'downloaded' && (
        <>
          <span className="text-green-400 font-semibold">Update ready</span>
          <button
            onClick={handleInstall}
            className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
          >
            <RotateCw size={12} />
            Restart & Update
          </button>
          <button onClick={() => setDismissed(true)} className="text-gray-500 hover:text-gray-300">
            <X size={12} />
          </button>
        </>
      )}

      {state === 'error' && (
        <>
          <span className="text-red-400">Update failed: {errorMessage}</span>
          <button onClick={() => setDismissed(true)} className="text-gray-500 hover:text-gray-300">
            <X size={12} />
          </button>
        </>
      )}
    </div>
  );
}