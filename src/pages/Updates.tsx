import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, Download, RotateCcw, CheckCircle, AlertCircle, AlertTriangle,
  Clock, Save, Server, HardDrive, ArrowLeft, ArrowRight, Shield, BookOpen,
  ChevronDown, ChevronRight, Terminal, Database, FileText, Info, Loader2,
  History, Settings, Globe, Wifi, WifiOff, ExternalLink, Trash2
} from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

type TabId = 'overview' | 'release-notes' | 'history' | 'preferences' | 'checklist';

export default function Updates() {
  const [status, setStatus] = useState<any>(null);
  const [releaseNotes, setReleaseNotes] = useState<any[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [migrationHistory, setMigrationHistory] = useState<any[]>([]);
  const [prefs, setPrefs] = useState<any>({});
  const [checklist, setChecklist] = useState<any[]>([]);
  const [verification, setVerification] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  const fetchAll = useCallback(async () => {
    try {
      const [s, rn, h, mh, p, c, v] = await Promise.all([
        api.getUpdateStatus(),
        api.getReleaseNotes(),
        api.getUpdateHistory(),
        api.getMigrationHistory(),
        api.getUpdatePreferences(),
        api.getUpdateChecklist(),
        api.verifyDataPreservation(),
      ]);
      setStatus(s);
      setReleaseNotes(rn || []);
      setHistory(h || []);
      setMigrationHistory(mh || []);
      setPrefs(p || {});
      setChecklist(c || []);
      setVerification(v);
    } catch (e: any) {
      toast.error('Failed to load update data');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCheck = async () => {
    setChecking(true);
    try {
      const result = await api.checkForUpdates();
      toast.success(result.message || 'Check complete');
      await fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Check failed');
    }
    setChecking(false);
  };

  const handleDownload = async () => {
    if (status?.serverRunning) {
      toast.error('Cannot download update while a server is running');
      return;
    }
    setDownloading(true);
    try {
      const result = await api.downloadUpdate();
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      await fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Download failed');
    }
    setDownloading(false);
  };

  const handleInstall = async () => {
    if (status?.serverRunning) {
      toast.error('Cannot install update while a server is running');
      return;
    }
    const confirmed = window.confirm(
      'This will create a pre-update backup, run database migrations, and install the update.\n\nApplication data (servers, worlds, players, backups) will NOT be affected.\n\nContinue?'
    );
    if (!confirmed) return;
    setInstalling(true);
    try {
      const result = await api.installUpdate();
      if (result.success) {
        toast.success(result.message);
        if (result.migration) {
          toast(`Migration: ${result.migration.message}`, { icon: '🗄️' });
        }
      } else {
        toast.error(result.message);
      }
      await fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Install failed');
    }
    setInstalling(false);
  };

  const handleRollback = async () => {
    if (status?.serverRunning) {
      toast.error('Cannot rollback while a server is running');
      return;
    }
    const confirmed = window.confirm(
      'Rollback will restore the previous application version.\n\nIf the current version introduced new database features, they may not be available after rollback.\n\nContinue?'
    );
    if (!confirmed) return;
    setRollingBack(true);
    try {
      const result = await api.rollbackUpdate();
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      await fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Rollback failed');
    }
    setRollingBack(false);
  };

  const handlePrefChange = async (key: string, value: string) => {
    try {
      await api.setUpdatePreference(key, value);
      setPrefs((prev: any) => ({ ...prev, [key]: value }));
      toast.success('Preference saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save preference');
    }
  };

  const handleBackup = async () => {
    try {
      const result = await api.createPreUpdateBackup();
      if (result.success) {
        toast.success('Pre-update backup created');
      } else {
        toast.error(result.message);
      }
      await fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Backup failed');
    }
  };

  const toggleNotes = (version: string) => {
    setExpandedNotes((prev) => ({ ...prev, [version]: !prev[version] }));
    if (!selectedNotes || selectedNotes.version !== version) {
      loadNotesDetail(version);
    } else {
      setSelectedNotes(null);
    }
  };

  const loadNotesDetail = async (version: string) => {
    try {
      const notes = await api.getReleaseNotes(version);
      setSelectedNotes(notes);
    } catch {
      setSelectedNotes(null);
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
    { id: 'overview', label: 'Overview', icon: Terminal },
    { id: 'release-notes', label: 'Release Notes', icon: FileText },
    { id: 'history', label: 'History', icon: History },
    { id: 'preferences', label: 'Preferences', icon: Settings },
    { id: 'checklist', label: 'Checklist', icon: CheckCircle },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Updates & Version Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage MineControl OS updates and releases</p>
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
          {/* Version Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-hover">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Current Version</p>
              <p className="text-2xl font-bold text-gray-100">v{status?.currentVersion || '?'}</p>
            </div>
            <div className="card-hover">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Latest Version</p>
              <p className={`text-2xl font-bold ${status?.updateAvailable ? 'text-yellow-400' : 'text-green-400'}`}>
                v{status?.latestVersion || '?'}
              </p>
            </div>
            <div className="card-hover">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Last Checked</p>
              <p className="text-sm font-medium text-gray-300">
                {status?.lastChecked ? new Date(status.lastChecked).toLocaleDateString() : 'Never'}
              </p>
              {status?.lastChecked && (
                <p className="text-[10px] text-gray-600">{new Date(status.lastChecked).toLocaleTimeString()}</p>
              )}
            </div>
            <div className="card-hover">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Connection</p>
              <div className="flex items-center gap-2">
                <Wifi size={16} className="text-green-400" />
                <span className="text-sm text-gray-300">
                  {status?.connectionMode === 'electron' ? 'Electron' : 'Server'}
                </span>
              </div>
            </div>
          </div>

          {/* Update Status */}
          <div className="card">
            <h3 className="text-sm font-medium text-gray-200 mb-4">Update Status</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="bg-surface-800/50 rounded-lg p-3">
                <div className={`text-lg font-bold ${status?.downloadStatus === 'downloaded' ? 'text-green-400' : status?.downloadStatus === 'downloading' ? 'text-yellow-400' : 'text-gray-400'}`}>
                  {status?.downloadStatus === 'downloaded' ? '✓' : status?.downloadStatus === 'downloading' ? '⟳' : '○'}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Download</p>
                <p className="text-[10px] text-gray-600">{status?.downloadStatus || 'idle'}</p>
              </div>
              <div className="bg-surface-800/50 rounded-lg p-3">
                <div className={`text-lg font-bold ${status?.installStatus === 'completed' ? 'text-green-400' : status?.installStatus === 'installing' ? 'text-yellow-400' : 'text-gray-400'}`}>
                  {status?.installStatus === 'completed' ? '✓' : status?.installStatus === 'installing' ? '⟳' : '○'}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Install</p>
                <p className="text-[10px] text-gray-600">{status?.installStatus || 'idle'}</p>
              </div>
              <div className="bg-surface-800/50 rounded-lg p-3">
                <div className={`text-lg font-bold ${status?.migrationStatus === 'completed' ? 'text-green-400' : status?.migrationStatus === 'failed' ? 'text-red-400' : 'text-gray-400'}`}>
                  {status?.migrationStatus === 'completed' ? '✓' : status?.migrationStatus === 'failed' ? '✗' : '○'}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Migration</p>
                <p className="text-[10px] text-gray-600">{status?.migrationStatus || 'none'}</p>
              </div>
              <div className="bg-surface-800/50 rounded-lg p-3">
                <div className={`text-lg font-bold ${status?.rollbackAvailable ? 'text-green-400' : 'text-gray-400'}`}>
                  {status?.rollbackAvailable ? '✓' : '—'}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Rollback</p>
                <p className="text-[10px] text-gray-600">{status?.rollbackAvailable ? 'Ready' : 'N/A'}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mt-6">
              <button
                onClick={handleCheck}
                disabled={checking}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {checking ? 'Checking...' : 'Check for Updates'}
              </button>
              {status?.updateAvailable && (
                <button
                  onClick={handleDownload}
                  disabled={downloading || status?.serverRunning}
                  className="btn-primary text-xs flex items-center gap-1.5 bg-minecraft-500/20 text-minecraft-400 border border-minecraft-500/30"
                >
                  {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  {downloading ? 'Downloading...' : `Download Update${status?.updateSize ? ` (${status.updateSize} MB)` : ''}`}
                </button>
              )}
              {status?.downloadStatus === 'downloaded' && (
                <button
                  onClick={handleInstall}
                  disabled={installing || status?.serverRunning}
                  className="btn-primary text-xs flex items-center gap-1.5 bg-green-500/20 text-green-400 border border-green-500/30"
                >
                  {installing ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  {installing ? 'Installing...' : 'Install Update'}
                </button>
              )}
              {status?.rollbackAvailable && (
                <button
                  onClick={handleRollback}
                  disabled={rollingBack || status?.serverRunning}
                  className="btn-primary text-xs flex items-center gap-1.5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                >
                  {rollingBack ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeft size={14} />}
                  {rollingBack ? 'Rolling back...' : 'Rollback'}
                </button>
              )}
              <button
                onClick={handleBackup}
                className="btn-primary text-xs flex items-center gap-1.5 bg-surface-800 text-gray-300 border border-surface-600"
              >
                <Save size={14} />
                Create Pre-Update Backup
              </button>
            </div>

            {status?.serverRunning && (
              <div className="flex items-center gap-2 mt-4 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <AlertTriangle size={14} />
                A Minecraft server is currently running. Stop the server before downloading or installing updates.
              </div>
            )}
          </div>

          {/* Data Preservation Status */}
          {verification && (
            <div className="card">
              <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
                <Database size={16} className="text-minecraft-500" />
                Data Preservation
              </h3>
              <div className={`text-sm mb-4 ${verification.allPreserved ? 'text-green-400' : 'text-yellow-400'}`}>
                {verification.allPreserved
                  ? 'All user data verified — update-safe'
                  : 'Some data categories are missing or empty'}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(verification).filter(([k]) => k !== 'dataPath' && k !== 'allPreserved').map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2 bg-surface-800/50 rounded-lg px-3 py-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${val ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <span className="text-xs text-gray-400 capitalize">{key}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Release Notes Tab */}
      {activeTab === 'release-notes' && (
        <div className="space-y-4">
          {releaseNotes.length === 0 && (
            <div className="card-hover text-center py-8 text-gray-500 text-sm">
              No release notes available
            </div>
          )}
          {releaseNotes.map((notes: any) => (
            <div key={notes.version} className="card">
              <button
                onClick={() => toggleNotes(notes.version)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-minecraft-500/20 flex items-center justify-center">
                    <FileText size={18} className="text-minecraft-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-200">v{notes.version}</h3>
                    <p className="text-[10px] text-gray-500">{notes.releaseDate || 'Unknown date'}</p>
                  </div>
                </div>
                {expandedNotes[notes.version] ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
              </button>

              {expandedNotes[notes.version] && (
                <div className="mt-4 space-y-4 border-t border-surface-700 pt-4">
                  {notes.newFeatures?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-green-400 mb-2">New Features</h4>
                      <ul className="space-y-1">
                        {notes.newFeatures.map((f: string, i: number) => (
                          <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                            <span className="text-green-500 mt-0.5">+</span> {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {notes.bugFixes?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-blue-400 mb-2">Bug Fixes</h4>
                      <ul className="space-y-1">
                        {notes.bugFixes.map((f: string, i: number) => (
                          <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                            <span className="text-blue-500 mt-0.5">•</span> {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {notes.improvements?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-purple-400 mb-2">Improvements</h4>
                      <ul className="space-y-1">
                        {notes.improvements.map((f: string, i: number) => (
                          <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                            <span className="text-purple-500 mt-0.5">↑</span> {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {notes.breakingChanges?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-red-400 mb-2">Breaking Changes</h4>
                      <ul className="space-y-1">
                        {notes.breakingChanges.map((f: string, i: number) => (
                          <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                            <span className="text-red-500 mt-0.5">!</span> {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {notes.knownIssues?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-yellow-400 mb-2">Known Issues</h4>
                      <ul className="space-y-1">
                        {notes.knownIssues.map((f: string, i: number) => (
                          <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                            <span className="text-yellow-500 mt-0.5">⚠</span> {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {notes.upgradeNotes?.length > 0 && (
                    <div className="bg-minecraft-500/10 border border-minecraft-500/20 rounded-lg p-3">
                      <h4 className="text-xs font-medium text-minecraft-400 mb-2">Upgrade Notes</h4>
                      <ul className="space-y-1">
                        {notes.upgradeNotes.map((f: string, i: number) => (
                          <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                            <Info size={12} className="text-minecraft-400 mt-0.5 shrink-0" /> {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Update History */}
          <div className="card">
            <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
              <History size={16} className="text-minecraft-500" />
              Update History
            </h3>
            <div className="space-y-2">
              {history.length === 0 && <p className="text-xs text-gray-500">No update history recorded</p>}
              {history.map((h: any) => (
                <div key={h.id} className="flex items-center gap-3 bg-surface-800/30 rounded-lg px-3 py-2">
                  <div className={`w-2 h-2 rounded-full ${h.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-200">
                        {h.action === 'checked' && 'Check'}
                        {h.action === 'downloaded' && 'Download'}
                        {h.action === 'installed' && 'Install'}
                        {h.action === 'rolled_back' && 'Rollback'}
                        {h.action === 'pre-update-backup' && 'Pre-Update Backup'}
                        {h.action === 'preference_changed' && 'Preference Change'}
                        {h.action === 'migrated' && 'Migration'}
                      </span>
                      <span className="text-[10px] text-gray-500 font-mono">v{h.version}</span>
                      {h.previousVersion && (
                        <span className="text-[10px] text-gray-600">from v{h.previousVersion}</span>
                      )}
                    </div>
                    {h.details && <p className="text-[10px] text-gray-600 truncate">{h.details}</p>}
                  </div>
                  <span className="text-[10px] text-gray-600 shrink-0">{h.createdAt ? new Date(h.createdAt).toLocaleString() : ''}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Migration History */}
          {migrationHistory.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
                <Database size={16} className="text-minecraft-500" />
                Migration History
              </h3>
              <div className="space-y-2">
                {migrationHistory.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-3 bg-surface-800/30 rounded-lg px-3 py-2">
                    <div className={`w-2 h-2 rounded-full ${m.status === 'completed' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-200">
                          v{m.fromVersion} → v{m.toVersion}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          m.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {m.result || m.status}
                        </span>
                      </div>
                      {m.details && <p className="text-[10px] text-gray-600 truncate">{m.details}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preferences Tab */}
      {activeTab === 'preferences' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
              <Settings size={16} className="text-minecraft-500" />
              Update Preferences
            </h3>
            <div className="space-y-4">
              <label className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-200">Check for Updates on Startup</p>
                  <p className="text-[10px] text-gray-500">Automatically check when the application starts</p>
                </div>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={prefs.check_on_startup !== 'false'}
                  onChange={(e) => handlePrefChange('check_on_startup', e.target.checked ? 'true' : 'false')}
                />
              </label>

              <label className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-200">Automatic Download</p>
                  <p className="text-[10px] text-gray-500">Download updates automatically when available</p>
                </div>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={prefs.auto_download === 'true'}
                  onChange={(e) => handlePrefChange('auto_download', e.target.checked ? 'true' : 'false')}
                />
              </label>

              <label className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-200">Automatic Installation</p>
                  <p className="text-[10px] text-gray-500">Install updates automatically after download</p>
                </div>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={prefs.auto_install === 'true'}
                  onChange={(e) => handlePrefChange('auto_install', e.target.checked ? 'true' : 'false')}
                />
              </label>

              <label className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-200">Notify Before Installing</p>
                  <p className="text-[10px] text-gray-500">Show a confirmation prompt before installing</p>
                </div>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={prefs.notify_before_install !== 'false'}
                  onChange={(e) => handlePrefChange('notify_before_install', e.target.checked ? 'true' : 'false')}
                />
              </label>
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
              <Shield size={16} className="text-minecraft-500" />
              Privacy & Permissions
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Automatic updates are controlled by the <strong>auto_updates</strong> permission in the Privacy & Security Center.
            </p>
            <a href="/privacy" className="text-xs text-minecraft-500 hover:text-minecraft-400 transition-colors flex items-center gap-1">
              <ExternalLink size={12} />
              Open Privacy & Security Center
            </a>
          </div>
        </div>
      )}

      {/* Checklist Tab */}
      {activeTab === 'checklist' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
              <CheckCircle size={16} className="text-minecraft-500" />
              Update Readiness Checklist
            </h3>
            <div className="space-y-3">
              {checklist.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    item.status === 'pass' ? 'bg-green-500/20 text-green-400' :
                    item.status === 'warn' ? 'bg-yellow-500/20 text-yellow-400' :
                    item.status === 'fail' ? 'bg-red-500/20 text-red-400' :
                    'bg-surface-700 text-gray-500'
                  }`}>
                    {item.status === 'pass' ? '✓' : item.status === 'fail' ? '✗' : item.status === 'warn' ? '!' : '?'}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-200">{item.label}</p>
                    <p className="text-[10px] text-gray-500">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-medium text-gray-200 mb-4">Summary</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Version</span>
                <span className="text-xs text-gray-200 font-mono">v{status?.currentVersion}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Update Available</span>
                <span className={`text-xs font-medium ${status?.updateAvailable ? 'text-yellow-400' : 'text-green-400'}`}>
                  {status?.updateAvailable ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Download Status</span>
                <span className="text-xs text-gray-300 capitalize">{status?.downloadStatus || 'idle'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Install Status</span>
                <span className="text-xs text-gray-300 capitalize">{status?.installStatus || 'idle'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Server Running</span>
                <span className={`text-xs ${status?.serverRunning ? 'text-yellow-400' : 'text-green-400'}`}>
                  {status?.serverRunning ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
