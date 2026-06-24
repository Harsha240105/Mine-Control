import React, { useEffect, useState } from 'react';
import { HardDrive, Plus, RotateCcw, Trash2, Lock, Clock } from 'lucide-react';
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

  useEffect(() => {
    fetchBackups();
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
