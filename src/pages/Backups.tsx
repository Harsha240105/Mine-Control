import React, { useEffect, useState, useCallback } from 'react';
import {
  HardDrive, Plus, RotateCcw, Trash2, Clock, Settings, ChevronRight, Save,
  Server, Search, Download, Upload, Shield, AlertTriangle, CheckCircle, XCircle,
  Filter, Archive, BarChart3, RefreshCw, Calendar, FileText, Globe, Users,
  Puzzle, Box, Cog,
} from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import { useActiveServer } from '../hooks/useActiveServer';
import { useSocket } from '../hooks/useSocket';

interface Backup {
  id: string; name: string; size: string; created_at: string; type: string;
  reason: string; encrypted: boolean; worlds: string[];
  minecraft_version: string; server_software: string;
  original_size: string; compressed_size: string; compression_ratio: number;
  restore_count: number; export_status: string; integrity_status: string;
  integrity_checked_at: string; includes_worlds: number; includes_players: number;
  includes_plugins: number; includes_mods: number; includes_config: number;
  includes_resourcepacks: number; content_manifest: Record<string, number>;
  created_by: string; path: string;
}

export default function Backups() {
  const { server: activeServer } = useActiveServer();
  const { socket } = useSocket();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');

  const [showCreate, setShowCreate] = useState(false);
  const [backupName, setBackupName] = useState('');
  const [backupReason, setBackupReason] = useState('');
  const [backupEncrypt, setBackupEncrypt] = useState(false);
  const [backupIncludes, setBackupIncludes] = useState({ worlds: true, players: true, plugins: true, mods: true, config: true, resourcepacks: true });

  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<any>({});
  const [savingSettings, setSavingSettings] = useState(false);

  const [showSchedule, setShowSchedule] = useState(false);
  const [schedule, setSchedule] = useState<any>(null);

  const [stats, setStats] = useState<any>(null);

  const fetchBackups = useCallback(async () => {
    try {
      const data = await api.getBackups({ search, type: typeFilter || undefined, sort: sortBy, order: sortOrder });
      setBackups(data);
    } catch {}
  }, [search, typeFilter, sortBy, sortOrder]);

  const fetchStats = useCallback(async () => {
    try { setStats(await api.getBackupStats()); } catch {}
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api.get('/backups/settings');
      setSettings(data);
    } catch {}
  }, []);

  const fetchSchedule = useCallback(async () => {
    try { setSchedule(await api.getBackupSchedule()); } catch {}
  }, []);

  useEffect(() => { fetchBackups(); fetchStats(); fetchSettings(); fetchSchedule(); }, [fetchBackups, fetchStats, fetchSettings, fetchSchedule]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => { fetchBackups(); fetchStats(); };
    socket.on('backup:created', refresh);
    socket.on('backup:deleted', refresh);
    socket.on('backup:restored', refresh);
    socket.on('backup:imported', refresh);
    socket.on('backup:cleanup', refresh);
    socket.on('backup:settings-updated', () => { fetchSettings(); fetchSchedule(); });
    socket.on('backup:schedule-updated', fetchSchedule);
    return () => {
      socket.off('backup:created', refresh);
      socket.off('backup:deleted', refresh);
      socket.off('backup:restored', refresh);
      socket.off('backup:imported', refresh);
      socket.off('backup:cleanup', refresh);
      socket.off('backup:settings-updated');
      socket.off('backup:schedule-updated');
    };
  }, [socket, fetchBackups, fetchStats, fetchSettings, fetchSchedule]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const backup = await api.createBackup({ name: backupName || undefined, reason: backupReason || undefined, encrypted: backupEncrypt, includes: backupIncludes });
      toast.success(`Backup '${backup.name}' created`);
      setBackupName(''); setBackupReason(''); setShowCreate(false);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const handleRestore = async () => {
    if (!selectedBackup) return;
    try {
      const result = await api.restoreBackup(selectedBackup.id);
      toast.success(`Restored. Safety backup: ${result.safetyBackupId?.slice(0, 8)}`);
      setShowRestoreConfirm(false);
      setSelectedBackup(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleExport = async (id: string) => {
    try {
      await api.exportBackup(id);
      toast.success('Backup exported');
      fetchBackups();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleVerify = async (id: string) => {
    try {
      const result = await api.verifyBackup(id);
      toast.success(`Integrity: ${result.integrity}`);
      fetchBackups();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.deleteBackup(deleteId);
      toast.success('Backup deleted');
      setShowDeleteConfirm(false);
      setDeleteId(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      await api.importBackup(fd);
      toast.success('Backup imported');
      setImportFile(null);
      setShowImport(false);
    } catch (err: any) { toast.error(err.message); }
    finally { setImporting(false); }
  };

  const handleRunCleanup = async () => {
    try {
      const result = await api.runCleanup();
      toast.success(`Cleanup: ${result.deleted} backups removed, ${result.freed} freed`);
    } catch (err: any) { toast.error(err.message); }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.post('/backups/settings', settings);
      toast.success('Backup settings saved');
    } catch (err: any) { toast.error(err.message); }
    finally { setSavingSettings(false); }
  };

  const saveSchedule = async () => {
    try {
      await api.updateBackupSchedule(schedule);
      toast.success('Backup schedule saved');
    } catch (err: any) { toast.error(err.message); }
  };

  const getIntegrityIcon = (status: string) => {
    switch (status) {
      case 'passed': return <CheckCircle size={14} className="text-green-400" />;
      case 'failed': return <XCircle size={14} className="text-red-400" />;
      default: return <Clock size={14} className="text-gray-500" />;
    }
  };

  if (!activeServer) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-gray-800 flex items-center justify-center">
            <Server className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-gray-400 text-sm font-medium">No server selected</p>
          <p className="text-gray-600 text-xs">Select a server from the Server Library to manage backups.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Backup Manager</h2>
          <p className="text-sm text-gray-500 mt-0.5">{backups.length} backups · {stats?.totalSize || '0 B'} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(!showImport)} className="btn-secondary flex items-center gap-2 text-sm">
            <Upload size={14} /> Import
          </button>
          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={14} /> Create Backup
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="card-hover p-3 text-center">
            <span className="text-2xl font-bold text-gray-100">{stats.backupCount}</span>
            <p className="text-[10px] text-gray-500 mt-0.5">Total Backups</p>
          </div>
          <div className="card-hover p-3 text-center">
            <span className="text-2xl font-bold text-blue-400">{stats.totalSize}</span>
            <p className="text-[10px] text-gray-500 mt-0.5">Compressed</p>
          </div>
          <div className="card-hover p-3 text-center">
            <span className="text-2xl font-bold text-green-400">{stats.compressedRatio > 0 ? `${(stats.compressedRatio * 100).toFixed(0)}%` : 'N/A'}</span>
            <p className="text-[10px] text-gray-500 mt-0.5">Compression</p>
          </div>
          <div className="card-hover p-3 text-center">
            <span className="text-2xl font-bold text-purple-400">{stats.totalOriginalSize}</span>
            <p className="text-[10px] text-gray-500 mt-0.5">Original Size</p>
          </div>
          <div className="card-hover p-3 text-center">
            <span className="text-2xl font-bold text-yellow-400">{stats.largestBackup}</span>
            <p className="text-[10px] text-gray-500 mt-0.5">Largest</p>
          </div>
          <div className="card-hover p-3 text-center">
            <span className="text-2xl font-bold text-gray-100">{stats.newestBackup ? new Date(stats.newestBackup).toLocaleDateString() : 'N/A'}</span>
            <p className="text-[10px] text-gray-500 mt-0.5">Latest</p>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      <details className="card group" open={showSettings} onToggle={(e) => setShowSettings(e.currentTarget.open)}>
        <summary className="flex items-center gap-2 p-4 cursor-pointer hover:bg-surface-800/30 transition-colors rounded-lg">
          <Settings size={16} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-200">Settings</span>
          <ChevronRight size={14} className="ml-auto text-gray-500 transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 pb-4 space-y-4 border-t border-surface-700/50 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* General Settings */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">General</h4>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={settings.customFolderEnabled} onChange={(e) => setSettings({ ...settings, customFolderEnabled: e.target.checked })} className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500" />
                <span className="text-sm text-gray-200">Custom Backup Folder</span>
              </label>
              {settings.customFolderEnabled && (
                <div className="flex items-center gap-2 ml-6">
                  <input type="text" value={settings.customFolder || ''} onChange={(e) => setSettings({ ...settings, customFolder: e.target.value })} placeholder="C:\\Backups\\MyServer" className="input flex-1 text-sm font-mono" />
                  <button onClick={async () => { if (window.electronAPI?.selectDirectory) { const dir = await window.electronAPI.selectDirectory(); if (dir) setSettings({ ...settings, customFolder: dir }); } }} className="btn-secondary text-sm whitespace-nowrap">
                    Browse
                  </button>
                </div>
              )}
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={settings.saveToBoth} onChange={(e) => setSettings({ ...settings, saveToBoth: e.target.checked })} className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500" />
                <div>
                  <span className="text-sm text-gray-200">Save to both locations</span>
                  <p className="text-xs text-gray-500">Backups go to default and custom folders</p>
                </div>
              </label>
            </div>
            {/* Auto-backup Triggers */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Auto-backup Triggers</h4>
              {[
                ['autoOnCreate', 'After server creation'],
                ['autoOnMigration', 'Before software migration'],
                ['autoOnVersionChange', 'Before version change'],
                ['autoOnWorldImport', 'Before world import'],
                ['autoOnRestore', 'Before restore operation'],
                ['autoOnWorldDelete', 'Before world deletion'],
                ['autoOnConfigChange', 'Before config change'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={(settings as any)[key] === true} onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })} className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500" />
                  <span className="text-sm text-gray-300">{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={handleRunCleanup} className="btn-secondary flex items-center gap-2 text-sm"><RefreshCw size={12} /> Run Cleanup Now</button>
            <button onClick={saveSettings} disabled={savingSettings} className="btn-primary flex items-center gap-2 text-sm">
              {savingSettings ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </details>

      {/* Schedule Panel */}
      <details className="card group" open={showSchedule} onToggle={(e) => setShowSchedule(e.currentTarget.open)}>
        <summary className="flex items-center gap-2 p-4 cursor-pointer hover:bg-surface-800/30 transition-colors rounded-lg">
          <Calendar size={16} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-200">Schedule</span>
          {schedule?.enabled ? <span className="badge-success text-xs">Active</span> : <span className="badge text-xs">Disabled</span>}
          <ChevronRight size={14} className="ml-auto text-gray-500 transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 pb-4 border-t border-surface-700/50 pt-4">
          {schedule && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <input type="checkbox" checked={schedule.enabled} onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })} className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500" />
                  <span className="text-sm text-gray-200">Enable scheduled backups</span>
                </label>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Frequency</label>
                  <select value={schedule.frequency} onChange={(e) => setSchedule({ ...schedule, frequency: e.target.value })} className="input text-sm">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Time of Day</label>
                <input type="time" value={schedule.time_of_day || '03:00'} onChange={(e) => setSchedule({ ...schedule, time_of_day: e.target.value })} className="input text-sm" />
                {schedule.frequency === 'weekly' && (
                  <div className="mt-3">
                    <label className="text-xs text-gray-400 mb-1 block">Day of Week</label>
                    <select value={schedule.day_of_week} onChange={(e) => setSchedule({ ...schedule, day_of_week: Number(e.target.value) })} className="input text-sm">
                      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                        <option key={i} value={i}>{d}</option>
                      ))}
                    </select>
                  </div>
                )}
                {schedule.frequency === 'monthly' && (
                  <div className="mt-3">
                    <label className="text-xs text-gray-400 mb-1 block">Day of Month</label>
                    <input type="number" min={1} max={28} value={schedule.day_of_month} onChange={(e) => setSchedule({ ...schedule, day_of_month: Number(e.target.value) })} className="input text-sm" />
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Max Backups (0 = unlimited)</label>
                <input type="number" min={0} value={schedule.max_backups} onChange={(e) => setSchedule({ ...schedule, max_backups: Number(e.target.value) })} className="input text-sm" />
                <label className="text-xs text-gray-400 mb-1 mt-3 block">Max Storage (MB, 0 = unlimited)</label>
                <input type="number" min={0} step={100} value={schedule.max_storage_mb} onChange={(e) => setSchedule({ ...schedule, max_storage_mb: Number(e.target.value) })} className="input text-sm" />
                <label className="text-xs text-gray-400 mb-1 mt-3 block">Max Age (days, 0 = unlimited)</label>
                <input type="number" min={0} value={schedule.max_age_days} onChange={(e) => setSchedule({ ...schedule, max_age_days: Number(e.target.value) })} className="input text-sm" />
              </div>
            </div>
          )}
          <div className="flex justify-end mt-4">
            <button onClick={saveSchedule} className="btn-primary flex items-center gap-2 text-sm"><Save size={14} /> Save Schedule</button>
          </div>
        </div>
      </details>

      {/* Create Backup Form */}
      {showCreate && (
        <div className="card p-5 animate-slide-in">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Backup Name</label>
                <input type="text" value={backupName} onChange={(e) => setBackupName(e.target.value)} className="input" placeholder={`Backup-${new Date().toISOString().slice(0, 10)}`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Reason</label>
                <input type="text" value={backupReason} onChange={(e) => setBackupReason(e.target.value)} className="input" placeholder="e.g., Before updating to 1.21" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400 mb-2 block">Include</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {( [
                  ['worlds', 'Worlds', Globe],
                  ['players', 'Player Data', Users],
                  ['plugins', 'Plugins', Puzzle],
                  ['mods', 'Mods', Box],
                  ['config', 'Config', Cog],
                  ['resourcepacks', 'Resource Packs', FileText],
                ] as [string, string, any][] ).map(([key, label, Icon]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer bg-surface-800 rounded p-2 border border-surface-700 hover:border-surface-500">
                    <input
                      type="checkbox" checked={(backupIncludes as any)[key]}
                      onChange={(e) => setBackupIncludes({ ...backupIncludes, [key]: e.target.checked })}
                      className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
                    />
                    <Icon size={12} className="text-gray-400" />
                    <span className="text-xs text-gray-300">{label as string}</span>
                  </label>
                ))}
              </div>
            </div>
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

      {/* Import Modal */}
      {showImport && (
        <div className="card p-5 animate-slide-in">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2"><Upload size={16} /> Import Backup</h3>
          <div className="space-y-4">
            <div className="border-2 border-dashed border-surface-600 rounded-lg p-6 text-center hover:border-minecraft-500/50 transition-colors">
              <input type="file" accept=".zip" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="hidden" id="import-file" />
              <label htmlFor="import-file" className="cursor-pointer">
                <Archive size={32} className="mx-auto text-gray-500 mb-2" />
                {importFile ? (
                  <p className="text-sm text-minecraft-400">{importFile.name} ({(importFile.size / 1024 / 1024).toFixed(1)} MB)</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-300">Click to select a backup ZIP</p>
                    <p className="text-xs text-gray-500 mt-1">Only MineControl OS backup files</p>
                  </>
                )}
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowImport(false); setImportFile(null); }} className="btn-secondary">Cancel</button>
              <button onClick={handleImport} disabled={!importFile || importing} className="btn-primary flex items-center gap-2">
                {importing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload size={14} />}
                {importing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search backups..." className="input pl-9 text-sm" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input text-sm w-auto">
          <option value="">All Types</option>
          <option value="manual">Manual</option>
          <option value="auto">Auto</option>
          <option value="scheduled">Scheduled</option>
          <option value="pre-restore">Pre-restore</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="input text-sm w-auto">
          <option value="created_at">Date</option>
          <option value="name">Name</option>
          <option value="size">Size</option>
          <option value="restore_count">Restores</option>
        </select>
        <button onClick={() => setSortOrder(sortOrder === 'DESC' ? 'ASC' : 'DESC')} className="btn-ghost p-2 text-xs text-gray-500">
          {sortOrder === 'DESC' ? 'Newest' : 'Oldest'}
        </button>
      </div>

      {/* Backup List */}
      <div className="space-y-2">
        {backups.map((backup) => (
          <div key={backup.id} className="card-hover flex items-center gap-3 py-3 px-4 cursor-pointer" onClick={() => setSelectedBackup(backup)}>
            <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0">
              <HardDrive className="w-5 h-5 text-minecraft-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-gray-200 truncate">{backup.name}</h3>
                {backup.type === 'auto' && <span className="badge-info text-[10px] px-1.5 py-0.5">Auto</span>}
                {backup.type === 'scheduled' && <span className="badge-info text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 border-blue-500/30">Scheduled</span>}
                {backup.type === 'pre-restore' && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full border border-yellow-500/30">Safety</span>}
                {backup.encrypted && <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">Encrypted</span>}
                {getIntegrityIcon(backup.integrity_status)}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 flex-wrap">
                <span>{backup.size}</span>
                <span className="flex items-center gap-1"><Clock size={10} />{new Date(backup.created_at).toLocaleDateString()} {new Date(backup.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {backup.reason && <span className="text-gray-400 italic">"{backup.reason}"</span>}
                {backup.restore_count > 0 && <span className="text-green-400/70">{backup.restore_count}x restored</span>}
                {backup.minecraft_version && <span className="text-[10px] bg-surface-800 px-1.5 py-0.5 rounded">{backup.minecraft_version}</span>}
                {backup.server_software && <span className="text-[10px] bg-surface-800 px-1.5 py-0.5 rounded">{backup.server_software}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => handleVerify(backup.id)} className="btn-ghost p-1.5 text-gray-500 hover:text-blue-400" title="Verify Integrity"><Shield size={14} /></button>
              <button onClick={() => handleExport(backup.id)} className="btn-ghost p-1.5 text-gray-500 hover:text-purple-400" title="Export"><Download size={14} /></button>
              <a href={api.downloadBackupUrl(backup.id)} download className="btn-ghost p-1.5 text-gray-500 hover:text-minecraft-400" title="Download"><Archive size={14} /></a>
              <button onClick={() => { setSelectedBackup(backup); setShowRestoreConfirm(true); }} className="btn-ghost p-1.5 text-gray-500 hover:text-green-400" title="Restore"><RotateCcw size={14} /></button>
              <button onClick={() => { setDeleteId(backup.id); setShowDeleteConfirm(true); }} className="btn-ghost p-1.5 text-gray-500 hover:text-red-400" title="Delete"><Trash2 size={14} /></button>
            </div>
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

      {/* Backup Detail Modal */}
      {selectedBackup && !showRestoreConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedBackup(null)}>
          <div className="bg-surface-900 rounded-xl border border-surface-700 max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-surface-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-100">{selectedBackup.name}</h3>
                <p className="text-xs text-gray-500 mt-1">{new Date(selectedBackup.created_at).toLocaleString()} · {selectedBackup.type}</p>
              </div>
              <button onClick={() => setSelectedBackup(null)} className="btn-ghost p-1 text-gray-500 hover:text-gray-300">✕</button>
            </div>
            <div className="p-5 space-y-5">
              {/* Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div className="bg-surface-800 rounded p-2.5">
                  <span className="text-gray-500 block">Size</span>
                  <span className="text-gray-100 font-medium">{selectedBackup.size}</span>
                </div>
                <div className="bg-surface-800 rounded p-2.5">
                  <span className="text-gray-500 block">Original</span>
                  <span className="text-gray-100 font-medium">{selectedBackup.original_size || 'N/A'}</span>
                </div>
                <div className="bg-surface-800 rounded p-2.5">
                  <span className="text-gray-500 block">Compression</span>
                  <span className="text-green-400 font-medium">{selectedBackup.compression_ratio ? `${(selectedBackup.compression_ratio * 100).toFixed(0)}%` : 'N/A'}</span>
                </div>
                <div className="bg-surface-800 rounded p-2.5">
                  <span className="text-gray-500 block">Version</span>
                  <span className="text-gray-100 font-medium">{selectedBackup.minecraft_version || 'N/A'}</span>
                </div>
                <div className="bg-surface-800 rounded p-2.5">
                  <span className="text-gray-500 block">Software</span>
                  <span className="text-gray-100 font-medium">{selectedBackup.server_software || 'N/A'}</span>
                </div>
                <div className="bg-surface-800 rounded p-2.5">
                  <span className="text-gray-500 block">Restored</span>
                  <span className="text-gray-100 font-medium">{selectedBackup.restore_count}x</span>
                </div>
                <div className="bg-surface-800 rounded p-2.5">
                  <span className="text-gray-500 block">Reason</span>
                  <span className="text-gray-100 font-medium">{selectedBackup.reason || 'Not specified'}</span>
                </div>
                <div className="bg-surface-800 rounded p-2.5">
                  <span className="text-gray-500 block">Created By</span>
                  <span className="text-gray-100 font-medium capitalize">{selectedBackup.created_by || 'system'}</span>
                </div>
                <div className="bg-surface-800 rounded p-2.5">
                  <span className="text-gray-500 block">Integrity</span>
                  <span className={`font-medium ${selectedBackup.integrity_status === 'passed' ? 'text-green-400' : selectedBackup.integrity_status === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>
                    {selectedBackup.integrity_status}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contents</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {([
                  ['Worlds', selectedBackup.includes_worlds, Globe],
                  ['Player Data', selectedBackup.includes_players, Users],
                  ['Plugins', selectedBackup.includes_plugins, Puzzle],
                  ['Mods', selectedBackup.includes_mods, Box],
                  ['Config', selectedBackup.includes_config, Cog],
                  ['Resource Packs', selectedBackup.includes_resourcepacks, FileText],
                ] as [string, number | boolean | undefined, any][]).map(([label, included, Icon]) => (
                  <div key={label} className="flex items-center gap-2 bg-surface-800 rounded p-2 border border-surface-700">
                    <Icon size={12} className={included ? 'text-green-400' : 'text-gray-600'} />
                    <span className={`text-xs ${included ? 'text-gray-200' : 'text-gray-600'}`}>{label}</span>
                  </div>
                ))}
                </div>
              </div>

              {/* Manifest */}
              {Object.keys(selectedBackup.content_manifest || {}).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Storage Breakdown</h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
                    {Object.entries(selectedBackup.content_manifest).map(([key, val]) => {
                      const bytes = typeof val === 'number' ? val : 0;
                      const sz = bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB';
                      const pct = stats?.totalOriginalSize ? ((bytes / parseSize(stats.totalOriginalSize)) * 100).toFixed(1) : 0;
                      return <div key={key} className="flex items-center justify-between bg-surface-800/50 rounded px-2.5 py-1.5">
                        <span className="text-gray-300">{key}</span>
                        <span className="text-gray-500">{sz} ({pct}%)</span>
                      </div>;
                    })}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 justify-end pt-2 border-t border-surface-700">
                <button onClick={() => handleVerify(selectedBackup.id)} className="btn-secondary text-xs flex items-center gap-1"><Shield size={12} /> Verify</button>
                <button onClick={() => handleExport(selectedBackup.id)} className="btn-secondary text-xs flex items-center gap-1"><Download size={12} /> Export</button>
                <a href={api.downloadBackupUrl(selectedBackup.id)} download className="btn-secondary text-xs flex items-center gap-1"><Archive size={12} /> Download</a>
                <button onClick={() => setShowRestoreConfirm(true)} className="btn-primary text-xs flex items-center gap-1"><RotateCcw size={12} /> Restore</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation */}
      {showRestoreConfirm && selectedBackup && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-900 rounded-xl border border-surface-700 max-w-md w-full p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <AlertTriangle size={20} className="text-yellow-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-100">Restore Backup</h3>
                <p className="text-xs text-gray-500">This action will overwrite current server data</p>
              </div>
            </div>
            <div className="bg-surface-800 rounded p-3 mb-4 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">Backup:</span><span className="text-gray-200">{selectedBackup.name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Created:</span><span className="text-gray-200">{new Date(selectedBackup.created_at).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Size:</span><span className="text-gray-200">{selectedBackup.size}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Version:</span><span className="text-gray-200">{selectedBackup.minecraft_version || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Contents:</span><span className="text-gray-200">{[
                selectedBackup.includes_worlds && 'Worlds',
                selectedBackup.includes_players && 'Players',
                selectedBackup.includes_plugins && 'Plugins',
                selectedBackup.includes_mods && 'Mods',
                selectedBackup.includes_config && 'Config',
              ].filter(Boolean).join(', ')}</span></div>
            </div>
            <p className="text-xs text-yellow-400/80 mb-4">
              A safety backup will be created automatically before restoring. The server must be restarted after restore.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowRestoreConfirm(false)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handleRestore} className="btn-primary text-sm bg-yellow-600 hover:bg-yellow-700 flex items-center gap-2">
                <RotateCcw size={14} /> Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-900 rounded-xl border border-surface-700 max-w-sm w-full p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-100">Delete Backup</h3>
                <p className="text-xs text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-300 mb-4">Are you sure you want to delete this backup permanently?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteId(null); }} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handleDelete} className="btn-primary text-sm bg-red-600 hover:bg-red-700 flex items-center gap-2">
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function parseSize(s: string): number {
  const m = s.match(/^([\d.]+)\s*(B|KB|MB|GB)$/);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  switch (m[2]) {
    case 'GB': return v * 1024 * 1024 * 1024;
    case 'MB': return v * 1024 * 1024;
    case 'KB': return v * 1024;
    default: return v;
  }
}
