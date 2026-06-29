import { useEffect, useState } from 'react';
import {
  Trash2, Shield, ShieldOff, HardDrive, Database, Server, FolderOpen,
  AlertTriangle, AlertCircle, CheckCircle, XCircle, RefreshCw, Loader2,
  ChevronDown, ChevronRight, History, Download, Save, ArrowLeft, Info,
  Globe, Wifi, BookOpen, FileText, Settings, Clock, Activity
} from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

type TabId = 'overview' | 'uninstall' | 'restore' | 'storage' | 'history';

export default function Uninstall() {
  const [storage, setStorage] = useState<any>(null);
  const [restoreStatus, setRestoreStatus] = useState<any>(null);
  const [detection, setDetection] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const fetchAll = async () => {
    try {
      const [s, rs, d, h] = await Promise.all([
        api.getStorageAnalysis(),
        api.getRestoreStatus(),
        api.detectExistingInstallation(),
        api.getUninstallHistory(),
      ]);
      setStorage(s);
      setRestoreStatus(rs);
      setDetection(d);
      setHistory(h || []);
    } catch (e: any) {
      toast.error('Failed to load data');
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleUninstallKeepData = async () => {
    const confirmed = window.confirm(
      'Remove Application (Keep My Data)\n\n' +
      'This will remove the MineControl OS application.\n\n' +
      'Your servers, worlds, players, backups, and all settings will be preserved at:\n' +
      (storage?.basePath || '~/.config/MineControl OS') + '\n\n' +
      'When you reinstall MineControl OS, your data will be automatically detected and restored.\n\n' +
      'Continue?'
    );
    if (!confirmed) return;
    setUninstalling('keep-data');
    try {
      const result = await api.uninstallKeepData();
      if (result.success) {
        toast.success('Application ready for uninstall. Data preserved.');
        // Try to launch the electron uninstaller
        if ((window as any).electronAPI?.uninstallAppOnly) {
          toast('Launching uninstaller...');
          await (window as any).electronAPI.uninstallAppOnly();
        } else {
          toast('Uninstaller not available (dev mode). Data is preserved at ' + result.dataPath, { icon: '📁' });
        }
      } else {
        toast.error(result.message);
      }
      await fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Uninstall failed');
    }
    setUninstalling(null);
  };

  const handleUninstallDeleteAll = async () => {
    const confirm1 = window.confirm(
      '⚠️ DELETE EVERYTHING ⚠️\n\n' +
      'This will permanently delete ALL MineControl OS data:\n\n' +
      '• All servers and worlds\n' +
      '• All players and their data\n' +
      '• All backups\n' +
      '• All settings, configurations, and preferences\n' +
      '• All plugins, mods, shaders, and resource packs\n' +
      '• All feedback, diagnostics, and logs\n' +
      '• All Discord, connection, and privacy settings\n' +
      '• Update history and release notes cache\n\n' +
      'This action CANNOT be undone.\n\n' +
      'Proceed?'
    );
    if (!confirm1) return;
    const confirm2 = window.prompt(
      'Type "DELETE EVERYTHING" to confirm complete removal:'
    );
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
          toast('Launching uninstaller...');
          await (window as any).electronAPI.uninstallCompleteRemoval();
        } else {
          toast('Uninstaller not available (dev mode). Data cleared from ' + result.dataPath, { icon: '🗑️' });
        }
      } else {
        toast.error(result.message);
      }
      await fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Operation failed');
    }
    setUninstalling(null);
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await api.restoreInstallation();
      if (result.success) {
        toast.success(result.message);
        window.location.href = '/dashboard';
      } else {
        toast.error(result.message);
      }
      await fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Restore failed');
    }
    setRestoring(false);
  };

  const handleStartFresh = async () => {
    const confirmed = window.confirm(
      'Start Fresh\n\n' +
      'This will delete all existing MineControl OS data and let you start fresh.\n\n' +
      'This action cannot be undone.\n\n' +
      'Continue?'
    );
    if (!confirmed) return;
    setRestoring(true);
    try {
      const result = await api.startFreshInstallation();
      if (result.success) {
        toast.success('Ready for fresh start.');
        window.location.href = '/wizard';
      } else {
        toast.error(result.message);
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    }
    setRestoring(false);
  };

  const handleDeleteResidual = async () => {
    const confirmed = window.confirm(
      'Delete Residual Data\n\n' +
      'This will delete any remaining MineControl OS data files.\n\n' +
      'Continue?'
    );
    if (!confirmed) return;
    try {
      const result = await api.deleteExistingData();
      if (result.success) {
        toast.success('Residual data deleted.');
      } else {
        toast.error(result.message);
      }
      await fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'storage', label: 'Storage', icon: HardDrive },
    { id: 'uninstall', label: 'Uninstall', icon: Trash2 },
    { id: 'restore', label: 'Restore', icon: Save },
    { id: 'history', label: 'History', icon: History },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Uninstall & Restore</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage application removal and data recovery</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-surface-700 overflow-x-auto pb-px">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-all whitespace-nowrap border-b-2 ${
              activeTab === t.id
                ? 'text-minecraft-400 border-minecraft-500'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-hover">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Installation</p>
              <div className="flex items-center gap-2">
                {detection?.installationFound ? (
                  <CheckCircle size={16} className="text-green-400" />
                ) : (
                  <XCircle size={16} className="text-red-400" />
                )}
                <span className="text-sm text-gray-300">
                  {detection?.installationFound ? 'Found' : 'Not Found'}
                </span>
              </div>
              <p className="text-[10px] text-gray-600 mt-1">{detection?.basePath || ''}</p>
            </div>
            <div className="card-hover">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Servers</p>
              <p className="text-2xl font-bold text-gray-100">{restoreStatus?.serverCount ?? detection?.serverCount ?? 0}</p>
              {restoreStatus?.activeServer && (
                <p className="text-[10px] text-minecraft-400 truncate">{restoreStatus.activeServer}</p>
              )}
            </div>
            <div className="card-hover">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Storage</p>
              <p className="text-2xl font-bold text-blue-400">{storage?.total?.formatted || '0 B'}</p>
              <p className="text-[10px] text-gray-600">Servers: {storage?.servers?.formatted || '0 B'}</p>
            </div>
            <div className="card-hover">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Restore</p>
              <div className="flex items-center gap-2">
                {restoreStatus?.restoreCompleted ? (
                  <CheckCircle size={16} className="text-green-400" />
                ) : (
                  <Clock size={16} className="text-gray-500" />
                )}
                <span className="text-sm text-gray-300">
                  {restoreStatus?.restoreCompleted ? 'Completed' : 'Pending'}
                </span>
              </div>
              {restoreStatus?.lastRestore && (
                <p className="text-[10px] text-gray-600 mt-1">{new Date(restoreStatus.lastRestore).toLocaleDateString()}</p>
              )}
            </div>
          </div>

          {/* Detection Alert */}
          {detection?.installationFound && !restoreStatus?.hasServers && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <AlertTriangle size={24} className="text-yellow-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-yellow-400 mb-2">Existing Installation Detected</h3>
                  <p className="text-xs text-gray-300 mb-4">
                    MineControl OS data was found at <code className="text-yellow-300">{storage?.basePath}</code>.
                    You can restore your previous installation or start fresh.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleRestore}
                      disabled={restoring}
                      className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                    >
                      {restoring ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Restore Existing Installation
                    </button>
                    <button
                      onClick={handleStartFresh}
                      disabled={restoring}
                      className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                    >
                      <Trash2 size={14} />
                      Start Fresh
                    </button>
                    <button
                      onClick={handleDeleteResidual}
                      className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                    >
                      <XCircle size={14} />
                      Delete Residual Data
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* All Good */}
          {restoreStatus?.hasServers && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <CheckCircle size={20} className="text-green-400" />
                <div>
                  <p className="text-sm text-green-400 font-medium">All systems operational</p>
                  <p className="text-xs text-gray-400">
                    {restoreStatus.serverCount} server(s) active. Storage: {storage?.total?.formatted}
                    {restoreStatus.restoreCompleted ? ' | Restored from existing data' : ''}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Storage Tab */}
      {activeTab === 'storage' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-hover">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive size={14} className="text-blue-400" />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Total</span>
              </div>
              <p className="text-2xl font-bold text-blue-400">{storage?.total?.formatted || '0 B'}</p>
            </div>
            <div className="card-hover">
              <div className="flex items-center gap-2 mb-2">
                <Server size={14} className="text-green-400" />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Servers</span>
              </div>
              <p className="text-2xl font-bold text-green-400">{storage?.servers?.formatted || '0 B'}</p>
              <p className="text-[10px] text-gray-600">{storage?.servers?.count || 0} server(s)</p>
            </div>
            <div className="card-hover">
              <div className="flex items-center gap-2 mb-2">
                <Database size={14} className="text-purple-400" />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Database</span>
              </div>
              <p className="text-2xl font-bold text-purple-400">{storage?.database?.formatted || '0 B'}</p>
            </div>
            <div className="card-hover">
              <div className="flex items-center gap-2 mb-2">
                <FolderOpen size={14} className="text-yellow-400" />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Cache</span>
              </div>
              <p className="text-2xl font-bold text-yellow-400">{storage?.cache?.formatted || '0 B'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card-hover">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Downloads</p>
              <p className="text-lg font-bold text-gray-300">{storage?.downloads?.formatted || '0 B'}</p>
            </div>
            <div className="card-hover">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Java Runtimes</p>
              <p className="text-lg font-bold text-gray-300">{storage?.java?.formatted || '0 B'}</p>
            </div>
            <div className="card-hover">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Logs</p>
              <p className="text-lg font-bold text-gray-300">{storage?.logs?.formatted || '0 B'}</p>
            </div>
          </div>

          {/* Server Details */}
          {storage?.servers?.details?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-medium text-gray-200 mb-4">Server Storage Breakdown</h3>
              <div className="space-y-2">
                {storage.servers.details.map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-surface-800/30 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-300 truncate">{s.name}</span>
                    <span className="text-xs text-gray-500 font-mono">{s.sizeFormatted}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
              <Info size={16} className="text-minecraft-500" />
              Data Location
            </h3>
            <p className="text-xs text-gray-400 font-mono bg-surface-800/50 rounded-lg p-3">
              {storage?.basePath || 'Unknown'}
            </p>
            <p className="text-[10px] text-gray-600 mt-2">
              All MineControl OS data is stored here. Back up this directory to preserve your installation.
            </p>
          </div>
        </div>
      )}

      {/* Uninstall Tab */}
      {activeTab === 'uninstall' && (
        <div className="space-y-6">
          {/* Option 1: Keep Data */}
          <div className="card border border-green-500/20">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
                <Shield size={24} className="text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-medium text-green-400 mb-1">Option 1: Remove Application (Keep My Data)</h3>
                <p className="text-xs text-gray-400 mb-4">
                  Remove MineControl OS but keep all your servers, worlds, players, backups, and settings.
                  Your data will be automatically detected when you reinstall.
                </p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div>
                    <p className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Will Be Removed</p>
                    <ul className="space-y-1">
                      <li className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <XCircle size={10} className="text-red-400" /> App executable & binaries
                      </li>
                      <li className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <XCircle size={10} className="text-red-400" /> Electron framework files
                      </li>
                      <li className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <XCircle size={10} className="text-red-400" /> Shortcuts & temp files
                      </li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] text-green-400 uppercase tracking-wider mb-1">Will Be Kept</p>
                    <ul className="space-y-1">
                      <li className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <CheckCircle size={10} className="text-green-400" /> All servers & worlds
                      </li>
                      <li className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <CheckCircle size={10} className="text-green-400" /> Database & settings
                      </li>
                      <li className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <CheckCircle size={10} className="text-green-400" /> All configurations
                      </li>
                    </ul>
                  </div>
                </div>
                <button
                  onClick={handleUninstallKeepData}
                  disabled={uninstalling !== null}
                  className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {uninstalling === 'keep-data' ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                  {uninstalling === 'keep-data' ? 'Processing...' : 'Uninstall & Keep My Data'}
                </button>
              </div>
            </div>
          </div>

          {/* Option 2: Delete Everything */}
          <div className="card border border-red-500/20 bg-red-500/5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                <ShieldOff size={24} className="text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-medium text-red-400 mb-1">Option 2: Remove Everything</h3>
                <p className="text-xs text-gray-400 mb-4">
                  Permanently delete ALL MineControl OS data including servers, worlds, players, backups,
                  and all settings. This action cannot be undone.
                </p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div>
                    <p className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Will Be Deleted</p>
                    <ul className="space-y-1">
                      <li className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <XCircle size={10} className="text-red-400" /> All servers & worlds
                      </li>
                      <li className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <XCircle size={10} className="text-red-400" /> All backups & settings
                      </li>
                      <li className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <XCircle size={10} className="text-red-400" /> All configurations & data
                      </li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Will Remain</p>
                    <ul className="space-y-1">
                      <li className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <AlertCircle size={10} className="text-red-400" /> Nothing
                      </li>
                    </ul>
                  </div>
                </div>
                <button
                  onClick={handleUninstallDeleteAll}
                  disabled={uninstalling !== null}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 disabled:opacity-50 border border-red-500/30"
                >
                  {uninstalling === 'delete-all' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {uninstalling === 'delete-all' ? 'Processing...' : 'Remove Everything'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restore Tab */}
      {activeTab === 'restore' && (
        <div className="space-y-6">
          {detection?.installationFound ? (
            <div className="card">
              <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
                <Save size={16} className="text-minecraft-500" />
                Restore Options
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                Existing MineControl OS data was found at:
              </p>
              <p className="text-xs text-gray-300 font-mono bg-surface-800/50 rounded-lg p-3 mb-4">
                {storage?.basePath}
              </p>

              <div className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-green-400 mb-2">Restore Existing Installation</h4>
                  <p className="text-xs text-gray-400 mb-3">
                    Recover all your servers, worlds, settings, and configurations from the existing data directory.
                  </p>
                  <button
                    onClick={handleRestore}
                    disabled={restoring}
                    className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                  >
                    {restoring ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Restore Installation
                  </button>
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-yellow-400 mb-2">Start Fresh</h4>
                  <p className="text-xs text-gray-400 mb-3">
                    Delete all existing data and create a new installation from scratch.
                  </p>
                  <button
                    onClick={handleStartFresh}
                    disabled={restoring}
                    className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                  >
                    <Trash2 size={14} />
                    Start Fresh
                  </button>
                </div>

                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-red-400 mb-2">Delete Existing Data</h4>
                  <p className="text-xs text-gray-400 mb-3">
                    Permanently remove all residual data without reinstalling.
                  </p>
                  <button
                    onClick={handleDeleteResidual}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                  >
                    <XCircle size={14} />
                    Delete Residual Data
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card-hover text-center py-12">
              <div className="text-4xl mb-4 opacity-30">📂</div>
              <p className="text-sm text-gray-500">No existing installation detected</p>
              <p className="text-xs text-gray-600 mt-1">Data will be scanned on startup</p>
            </div>
          )}

          <div className="card">
            <h3 className="text-sm font-medium text-gray-200 mb-4">What Gets Restored</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {['SQLite Database', 'Servers', 'Worlds', 'Players', 'Plugins', 'Mods', 'Backups', 'Settings', 'Discord Config', 'Connection Settings', 'Privacy Preferences', 'Feedback History'].map((item) => (
                <div key={item} className="flex items-center gap-2 bg-surface-800/30 rounded-lg px-3 py-2">
                  <CheckCircle size={12} className="text-green-500" />
                  <span className="text-xs text-gray-400">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <History size={16} className="text-minecraft-500" />
            Uninstall & Restore History
          </h3>
          <div className="space-y-2">
            {history.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-8">No history recorded</p>
            )}
            {history.map((h: any) => (
              <div key={h.id} className="flex items-center gap-3 bg-surface-800/30 rounded-lg px-3 py-2">
                <div className={`w-2 h-2 rounded-full ${h.status === 'completed' ? 'bg-green-500' : h.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-200">
                      {h.action === 'uninstall_keep_data' && 'Uninstall (Keep Data)'}
                      {h.action === 'uninstall_delete_all' && 'Uninstall (Delete All)'}
                      {h.action === 'restore' && 'Restore'}
                      {h.action === 'start_fresh' && 'Start Fresh'}
                      {h.action === 'delete_residual' && 'Delete Residual Data'}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      h.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      h.status === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {h.status}
                    </span>
                  </div>
                  {h.details && <p className="text-[10px] text-gray-600 truncate">{h.details}</p>}
                </div>
                <span className="text-[10px] text-gray-600 shrink-0">
                  {h.createdAt ? new Date(h.createdAt).toLocaleString() : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
