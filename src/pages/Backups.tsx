import React, { useEffect, useState } from 'react';
import { HardDrive, Plus, RotateCcw, Trash2, Lock, Clock, Settings, ChevronRight, Save } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

interface Backup {
  id: string;
  name: string;
  size: string;
  created_at: string;
  type: 'manual' | 'auto';
  worlds: string[];
  encrypted: boolean;
}

export default function Backups() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [backupName, setBackupName] = useState('');
  const [encrypt, setEncrypt] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [customFolderEnabled, setCustomFolderEnabled] = useState(false);
  const [customFolder, setCustomFolder] = useState('');
  const [saveToBoth, setSaveToBoth] = useState(false);
  const [autoBackup, setAutoBackup] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    fetchBackups();
    api.get('/backups/settings').then((data) => {
      if (data.customFolder) setCustomFolder(data.customFolder);
      if (data.customFolderEnabled !== undefined) setCustomFolderEnabled(data.customFolderEnabled);
      if (data.saveToBoth !== undefined) setSaveToBoth(data.saveToBoth);
      if (data.autoBackup !== undefined) setAutoBackup(data.autoBackup);
    }).catch(() => {});
  }, []);

  const fetchBackups = async () => {
    try {
      const data = await api.getBackups();
      setBackups(data);
    } catch {}
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const backup = await api.createBackup(backupName || undefined, encrypt);
      toast.success(`Backup '${backup.name}' created`);
      setBackupName(''); setShowCreate(false);
      fetchBackups();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await api.restoreBackup(id);
      toast.success('Backup restored. Restart server for changes.');
      fetchBackups();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteBackup(id);
      toast.success('Backup deleted');
      fetchBackups();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Backup Manager</h2>
          <p className="text-sm text-gray-500 mt-0.5">{backups.length} backups</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            Create Backup
          </button>
        </div>
      </div>

      {/* Backup Settings */}
      <details className="card group" open={showSettings} onToggle={(e) => setShowSettings(e.currentTarget.open)}>
        <summary className="flex items-center gap-2 p-4 cursor-pointer hover:bg-surface-800/30 transition-colors rounded-lg">
          <Settings size={16} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-200">Backup Settings</span>
          <ChevronRight size={14} className="ml-auto text-gray-500 transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 pb-4 space-y-4 border-t border-surface-700/50 pt-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={customFolderEnabled}
              onChange={(e) => setCustomFolderEnabled(e.target.checked)}
              className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
            />
            <span className="text-sm text-gray-200">Custom Backup Folder</span>
          </label>
          {customFolderEnabled && (
            <div className="flex items-center gap-2 ml-6">
              <input
                type="text"
                value={customFolder}
                onChange={(e) => setCustomFolder(e.target.value)}
                placeholder="C:\\Backups\\MyServer"
                className="input flex-1 text-sm font-mono"
              />
              <button
                onClick={async () => {
                  if (window.electronAPI?.selectDirectory) {
                    const dir = await window.electronAPI.selectDirectory();
                    if (dir) setCustomFolder(dir);
                  }
                }}
                className="btn-secondary text-sm whitespace-nowrap"
              >
                Browse
              </button>
            </div>
          )}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={saveToBoth}
              onChange={(e) => setSaveToBoth(e.target.checked)}
              className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
            />
            <div>
              <span className="text-sm text-gray-200">Save to both locations</span>
              <p className="text-xs text-gray-500">Backups go to both the default and custom location</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoBackup}
              onChange={(e) => setAutoBackup(e.target.checked)}
              className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
            />
            <div>
              <span className="text-sm text-gray-200">Auto-backup</span>
              <p className="text-xs text-gray-500">Automatically create backups on a schedule</p>
            </div>
          </label>
          <div className="flex justify-end">
            <button
              onClick={async () => {
                setSavingSettings(true);
                try {
                  await api.post('/backups/settings', { customFolder, customFolderEnabled, saveToBoth, autoBackup });
                  toast.success('Backup settings saved');
                } catch (err: any) {
                  toast.error(err.message);
                }
                setSavingSettings(false);
              }}
              disabled={savingSettings}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              {savingSettings ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </details>

      {showCreate && (
        <div className="card p-5 animate-slide-in">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Backup Name (optional)</label>
              <input
                type="text"
                value={backupName}
                onChange={(e) => setBackupName(e.target.value)}
                className="input"
                placeholder={`Backup-${new Date().toISOString().slice(0, 10)}`}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={encrypt}
                onChange={(e) => setEncrypt(e.target.checked)}
                className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
              />
              <span className="text-sm text-gray-300">Encrypt backup</span>
              <Lock size={12} className="text-gray-500" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
                {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {loading ? 'Creating...' : 'Create Backup'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {backups.map((backup) => (
          <div key={backup.id} className="card-hover flex items-center gap-4 py-3 px-4">
            <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0">
              <HardDrive className="w-5 h-5 text-minecraft-500" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-gray-200">{backup.name}</h3>
                {backup.type === 'auto' && (
                  <span className="badge-info text-xs">Auto</span>
                )}
                {backup.encrypted && (
                  <Lock size={12} className="text-yellow-500" />
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                <span>{backup.size}</span>
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {new Date(backup.created_at).toLocaleDateString()}
                </span>
                <span>{backup.worlds?.length || 0} worlds</span>
              </div>
            </div>

            <button
              onClick={() => handleRestore(backup.id)}
              className="btn-ghost p-2 text-xs flex items-center gap-1 text-gray-400 hover:text-minecraft-400"
              title="Restore"
            >
              <RotateCcw size={14} /> Restore
            </button>
            <button
              onClick={() => handleDelete(backup.id)}
              className="btn-ghost p-2 text-gray-500 hover:text-red-400"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {backups.length === 0 && (
          <div className="card p-8 text-center text-gray-500">
            <HardDrive size={40} className="mx-auto mb-3 opacity-30" />
            <p>No backups yet</p>
            <p className="text-xs mt-1">Create your first backup to protect your worlds</p>
          </div>
        )}
      </div>
    </div>
  );
}
