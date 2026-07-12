import { useEffect, useState } from 'react';
import { Trash2, HardDrive, Server, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

export default function Uninstall() {
  const [storage, setStorage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uninstalling, setUninstalling] = useState<string | null>(null);

  useEffect(() => {
    api.getStorageAnalysis()
      .then(setStorage)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleKeepData = async () => {
    const confirmed = window.confirm(
      'Remove Application (Keep My Data)\n\n' +
      'This will remove the MineControl OS application.\n\n' +
      'Your servers, worlds, players, backups, and all settings will be preserved.\n' +
      'When you reinstall, your data will be automatically detected and restored.\n\n' +
      'Continue?'
    );
    if (!confirmed) return;
    setUninstalling('keep-data');
    try {
      const result = await api.uninstallKeepData();
      if (result.success) {
        toast.success('Application ready for uninstall. Data preserved.');
        if ((window as any).electronAPI?.uninstallAppOnly) {
          await (window as any).electronAPI.uninstallAppOnly();
        } else {
          toast('Uninstaller not available in dev mode.', { icon: '📁' });
        }
      } else {
        toast.error(result.message);
      }
    } catch (e: any) {
      toast.error(e.message || 'Uninstall failed');
    }
    setUninstalling(null);
  };

  const handleDeleteAll = async () => {
    const confirm1 = window.confirm(
      'DELETE EVERYTHING\n\n' +
      'This will permanently delete ALL MineControl OS data:\n\n' +
      '  All servers and worlds\n' +
      '  All players and their data\n' +
      '  All backups\n' +
      '  All settings and configurations\n' +
      '  All plugins, mods, shaders, and resource packs\n\n' +
      'This action CANNOT be undone.\n\n' +
      'Proceed?'
    );
    if (!confirm1) return;
    const confirm2 = window.prompt('Type "DELETE EVERYTHING" to confirm:');
    if (confirm2 !== 'DELETE EVERYTHING') {
      toast.error('You must type "DELETE EVERYTHING" to confirm.');
      return;
    }
    setUninstalling('delete-all');
    try {
      const result = await api.uninstallDeleteEverything();
      if (result.success) {
        toast.success('All data removed.');
        if ((window as any).electronAPI?.uninstallCompleteRemoval) {
          await (window as any).electronAPI.uninstallCompleteRemoval();
        } else {
          toast('Uninstaller not available in dev mode.', { icon: '🗑️' });
        }
      } else {
        toast.error(result.message);
      }
    } catch (e: any) {
      toast.error(e.message || 'Operation failed');
    }
    setUninstalling(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
          <Trash2 className="w-6 h-6 text-red-400" />
          Uninstall
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Remove MineControl OS from your computer
        </p>
      </div>

      {storage && (
        <div className="card p-4">
          <h3 className="text-sm font-medium text-gray-200 mb-3 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-blue-400" />
            Storage Usage
          </h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="bg-surface-800 rounded-lg p-3">
              <p className="text-gray-400">Total Size</p>
              <p className="text-lg font-bold text-gray-200">{storage.totalSize || 'Unknown'}</p>
            </div>
            <div className="bg-surface-800 rounded-lg p-3">
              <p className="text-gray-400">Servers</p>
              <p className="text-lg font-bold text-gray-200">{storage.serverCount || 0}</p>
            </div>
          </div>
        </div>
      )}

      <div className="card p-6">
        <h3 className="text-sm font-medium text-gray-200 mb-4">Uninstall Options</h3>

        <div className="space-y-4">
          <button
            onClick={handleKeepData}
            disabled={!!uninstalling}
            className="w-full text-left p-4 rounded-xl border border-surface-700 bg-surface-800/50 hover:bg-surface-800 hover:border-blue-500/30 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <Server className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-gray-200 group-hover:text-blue-400 transition-colors">
                  Uninstall (Keep My Data)
                </h4>
                <p className="text-xs text-gray-500 mt-1">
                  Removes the app only. Your servers, worlds, backups, and settings stay on this laptop.
                  Reinstall anytime to get everything back.
                </p>
              </div>
              {uninstalling === 'keep-data' && <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0" />}
            </div>
          </button>

          <button
            onClick={handleDeleteAll}
            disabled={!!uninstalling}
            className="w-full text-left p-4 rounded-xl border border-surface-700 bg-surface-800/50 hover:bg-surface-800 hover:border-red-500/30 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-gray-200 group-hover:text-red-400 transition-colors">
                  Uninstall (Delete Everything)
                </h4>
                <p className="text-xs text-gray-500 mt-1">
                  Removes the app AND deletes all data — servers, worlds, backups, settings, plugins, everything.
                  This cannot be undone.
                </p>
              </div>
              {uninstalling === 'delete-all' && <Loader2 className="w-5 h-5 text-red-400 animate-spin shrink-0" />}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
