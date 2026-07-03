import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings as SettingsIcon, Save, Key, Shield, Server, RefreshCw,
  Eye, EyeOff, Globe, Users, Wifi, Download, CheckCircle, AlertCircle,
  ChevronDown, ChevronRight, Search, Cpu, Trash2, Loader2, Github
} from 'lucide-react';
import pkg from '../../package.json';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useActiveServer } from '../hooks/useActiveServer';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user, isOwner } = useAuth();
  const { server: activeServer } = useActiveServer();
  const navigate = useNavigate();
  const [config, setConfig] = useState<any>({});
  const [props, setProps] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Version state
  const [versions, setVersions] = useState<any[]>([]);
  const [currentVersion, setCurrentVersion] = useState('');
  const [currentSource, setCurrentSource] = useState('');
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [switchingVersion, setSwitchingVersion] = useState<string | null>(null);
  const [versionSearch, setVersionSearch] = useState('');
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({
    'Release': true,
    'Snapshot': false,
    'Beta': false,
    'Alpha': false,
  });

  const [serverName, setServerName] = useState('');
  const [onlineMode, setOnlineMode] = useState(true);

  useEffect(() => {
    if (activeServer) {
      setServerName(activeServer.name);
      setOnlineMode(activeServer.onlineMode ?? true);
    }
  }, [activeServer]);

  useEffect(() => {
    if (!loading) fetchVersions();
  }, [loading]);

  const fetchConfig = async () => {
    try { setConfig(await api.getServerConfig()); } catch {}
  };

  const fetchProps = async () => {
    try { setProps(await api.getServerProperties()); } catch {}
  };

  useEffect(() => {
    Promise.all([fetchConfig(), fetchProps()]).finally(() => setLoading(false));
  }, []);

  const fetchVersions = async () => {
    setVersionsLoading(true);
    try {
      const data = await api.getAvailableVersions();
      setVersions(data.availableVersions || []);
      setCurrentVersion(data.currentVersion || '');
      setCurrentSource(data.currentSource || '');
    } catch {}
    setVersionsLoading(false);
  };

  const handleSave = async () => {
    let saved = false;
    try {
      if (activeServer?.id) {
        await api.put(`/servers/${activeServer?.id}`, {
          name: serverName,
          onlineMode,
        });
        saved = true;
      }
      await api.updateServerConfig(config);
      saved = true;
      try {
        await api.updateServerProperties({
          'online-mode': onlineMode ? 'true' : 'false',
          'level-seed': props['level-seed'],
          motd: props.motd || config.motd,
          'max-players': props['max-players'] || config.maxPlayers,
          difficulty: props.difficulty || config.difficulty,
          'view-distance': props['view-distance'] || config.viewDistance,
          pvp: props.pvp !== 'false' ? 'true' : 'false',
        });
      } catch (propsErr: any) {
        if (propsErr.message?.includes('server.properties not found')) {
          // Server not yet started — properties file will be generated on first start
        } else {
          throw propsErr;
        }
      }
      toast.success('Saved. Restart server for changes to take effect.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      setCurrentPassword(''); setNewPassword('');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSwitchVersion = async (version: string, source: string) => {
    if (switchingVersion) return;
    setSwitchingVersion(version);
    try {
      await api.setServerVersion(version, source);
      toast.success(`Switched to ${source === 'PaperMC' ? 'Paper' : 'Mojang Vanilla'} ${version}`);
      await fetchVersions();
      await fetchConfig();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSwitchingVersion(null);
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  const handleUninstallApp = async () => {
    const confirmed = window.confirm(
      'Uninstall MineControl OS?\n\nApp binaries will be removed. Your servers, worlds, and data will remain on this computer.'
    );
    if (!confirmed) return;
    try {
      const result = await window.electronAPI.uninstallAppOnly();
      if (!result.success) {
        toast.error(result.error || 'Failed to launch uninstaller');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to uninstall');
    }
  };

  const handleCompleteRemoval = async () => {
    const typed = window.prompt(
      'This will permanently delete ALL MineControl OS data including servers, worlds, backups, and settings.\n\nThis action cannot be undone.\n\nType "DELETE" to confirm:'
    );
    if (typed !== 'DELETE') {
      toast.error('You must type "DELETE" to confirm complete removal.');
      return;
    }
    try {
      const result = await window.electronAPI.uninstallCompleteRemoval();
      if (!result.success) {
        toast.error(result.error || 'Failed to launch uninstaller');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to uninstall');
    }
  };

  const handleDeleteServer = async () => {
    if (!activeServer?.id) return;
    if (deleteConfirmName !== serverName) {
      toast.error('Server name did not match. Deletion cancelled.');
      return;
    }
    
    try {
      await api.deleteServer(activeServer?.id);
      toast.success('Server deleted successfully.');
      window.location.href = '/';
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete server');
      setShowDeleteModal(false);
    }
  };

  const toggleType = (type: string) => {
    setExpandedTypes(prev => ({ ...prev, [type]: !prev[type] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const grouped = versions.reduce((acc: any, v: any) => {
    const type = v.type || 'Other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(v);
    return acc;
  }, {} as Record<string, any[]>);

  const typeOrder = ['Release', 'Snapshot', 'Beta', 'Alpha'];
  const sortedTypes = Object.keys(grouped).sort((a, b) => {
    const ia = typeOrder.indexOf(a);
    const ib = typeOrder.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const filteredVersions = versionSearch
    ? versions.filter(v => v.version.toLowerCase().includes(versionSearch.toLowerCase()))
    : null;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-gray-100">Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Configure your Minecraft server</p>
      </div>



      {/* Server Configuration */}
      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
          <Server size={16} className="text-minecraft-500" />
          Server Configuration
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Server Name</label>
            <input
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              className="input"
            />
            <p className="text-xs text-gray-500 mt-1">Name shown in the MineControl dashboard</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">MOTD</label>
            <input
              type="text"
              value={props.motd || config.motd || ''}
              onChange={(e) => setProps({ ...props, motd: e.target.value })}
              className="input"
            />
            <p className="text-xs text-gray-500 mt-1">Use § for color codes</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">World Seed</label>
            <input
              type="text"
              value={props['level-seed'] || ''}
              onChange={(e) => setProps({ ...props, 'level-seed': e.target.value })}
              className="input"
              placeholder="Leave empty for random"
            />
            <p className="text-xs text-gray-500 mt-1">Only applies to new worlds</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Max Players</label>
            <input
              type="number"
              value={props['max-players'] || config.maxPlayers || 4}
              onChange={(e) => setProps({ ...props, 'max-players': e.target.value })}
              className="input"
              min={1}
              max={20}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Difficulty</label>
            <select
              value={props.difficulty || config.difficulty || 'normal'}
              onChange={(e) => setProps({ ...props, difficulty: e.target.value })}
              className="select"
            >
              <option value="peaceful">Peaceful</option>
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Default Gamemode</label>
            <select
              value={config.gamemode || 'survival'}
              onChange={(e) => setConfig({ ...config, gamemode: e.target.value })}
              className="select"
            >
              <option value="survival">Survival</option>
              <option value="creative">Creative</option>
              <option value="adventure">Adventure</option>
              <option value="spectator">Spectator</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Server Port</label>
            <input
              type="number"
              value={config.port || 25565}
              onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 25565 })}
              className="input"
              min={1024}
              max={65535}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">View Distance</label>
            <input
              type="number"
              value={props['view-distance'] || config.viewDistance || 10}
              onChange={(e) => setProps({ ...props, 'view-distance': e.target.value })}
              className="input"
              min={3}
              max={128}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Min RAM</label>
            <input
              type="text"
              value={config.minRam || '2G'}
              onChange={(e) => setConfig({ ...config, minRam: e.target.value })}
              className="input"
              placeholder="2G"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Max RAM</label>
            <input
              type="text"
              value={config.maxRam || '8G'}
              onChange={(e) => setConfig({ ...config, maxRam: e.target.value })}
              className="input"
              placeholder="8G"
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={onlineMode}
              onChange={(e) => setOnlineMode(e.target.checked)}
              className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
            />
            <div>
              <span className="text-sm text-gray-200">Online Mode (Premium)</span>
              <p className="text-xs text-gray-500">Require players to have a paid Minecraft account</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={props.pvp !== 'false'}
              onChange={(e) => setProps({ ...props, pvp: e.target.checked ? 'true' : 'false' })}
              className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
            />
            <div>
              <span className="text-sm text-gray-200">PvP</span>
              <p className="text-xs text-gray-500">Allow player versus player combat</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.whitelistEnabled !== false}
              onChange={(e) => setConfig({ ...config, whitelistEnabled: e.target.checked })}
              className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
            />
            <div>
              <span className="text-sm text-gray-200">Whitelist</span>
              <p className="text-xs text-gray-500">Only whitelisted players can join</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoRestart !== false}
              onChange={(e) => setConfig({ ...config, autoRestart: e.target.checked })}
              className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
            />
            <div>
              <span className="text-sm text-gray-200">Auto Restart on Crash</span>
              <p className="text-xs text-gray-500">Automatically restart the server if it crashes</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoBackup !== false}
              onChange={(e) => setConfig({ ...config, autoBackup: e.target.checked })}
              className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500"
            />
            <div>
              <span className="text-sm text-gray-200">Auto Backup</span>
              <p className="text-xs text-gray-500">Automatically backup worlds every hour</p>
            </div>
          </label>
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={handleSave} className="btn-primary flex items-center gap-2">
            <Save size={16} />
            Save Settings
          </button>
        </div>
      </div>
      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
          <Shield size={16} className="text-minecraft-500" />
          Security
        </h3>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Current Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input pr-10"
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">New Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
              required
              minLength={6}
            />
          </div>
          <button type="submit" className="btn-primary flex items-center gap-2">
            <Key size={16} />
            Change Password
          </button>
        </form>
      </div>

      {/* Issue Tracker Config */}
      {activeServer?.id && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <Globe size={16} className="text-minecraft-500" />
            Issue Tracker Integration
          </h3>
          <IssueTrackerConfigForm serverId={activeServer.id} />
        </div>
      )}

        {/* GitHub Configuration Link */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <Github size={16} className="text-minecraft-500" />
            GitHub Integration
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Configure your GitHub repository for Feedback issue synchronization. Connect to
            automatically sync bug reports, feature requests, and other feedback to GitHub Issues.
          </p>
          <a
            href="/settings/github"
            className="inline-flex items-center gap-2 px-4 py-2 bg-minecraft-500/20 hover:bg-minecraft-500/30 text-minecraft-400 rounded-lg text-sm font-medium transition-colors"
          >
            <Github size={16} />
            Open GitHub Configuration
          </a>
        </div>

        {/* Update Preferences */}
      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
          <RefreshCw size={16} className="text-minecraft-500" />
          Update Preferences
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-200">Check on Startup</p>
              <p className="text-[10px] text-gray-500">Check for updates when the app starts</p>
            </div>
            <UpdateToggle prefKey="check_on_startup" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-200">Auto Download</p>
              <p className="text-[10px] text-gray-500">Download updates automatically when available</p>
            </div>
            <UpdateToggle prefKey="auto_download" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-200">Auto Install</p>
              <p className="text-[10px] text-gray-500">Install updates automatically after download</p>
            </div>
            <UpdateToggle prefKey="auto_install" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-200">Notify Before Install</p>
              <p className="text-[10px] text-gray-500">Show confirmation before installing updates</p>
            </div>
            <UpdateToggle prefKey="notify_before_install" />
          </div>
          <div className="pt-2 border-t border-surface-700">
            <a href="/updates" className="text-xs text-minecraft-500 hover:text-minecraft-400 transition-colors">
              Open Update Manager →
            </a>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-4">System Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Version:</span>
            <span className="ml-2 text-gray-300">MineControl OS v{pkg.version}</span>
          </div>
          <div>
            <span className="text-gray-500">User:</span>
            <span className="ml-2 text-gray-300">{user?.username} ({user?.role})</span>
          </div>
          <div>
            <span className="text-gray-500">Data Directory:</span>
            <span className="ml-2 text-gray-300 font-mono text-xs">./minecraft/</span>
          </div>
          <div>
            <span className="text-gray-500">Java:</span>
            <span className="ml-2 text-gray-300 font-mono text-xs">{config.javaPath || 'java'}</span>
          </div>
        </div>
      </div>

      {/* Security Health */}
      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
          <Shield size={16} className="text-minecraft-500" />
          Security Health
        </h3>
        <SecurityHealthCard serverId={activeServer?.id} />
      </div>

      <div className="card border border-red-500/20 bg-red-500/5">
        <h3 className="text-sm font-medium text-red-400 mb-4 flex items-center gap-2">
          <AlertCircle size={16} />
          Danger Zone
        </h3>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-medium text-gray-200">Delete Server</h4>
            <p className="text-xs text-gray-500 mt-1">Permanently delete this server and all its files.</p>
          </div>
          <button
            onClick={() => {
              setDeleteConfirmName('');
              setShowDeleteModal(true);
            }}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm transition-colors border border-red-500/20 flex items-center gap-2"
          >
            <Trash2 size={16} />
            Delete Server
          </button>
        </div>
        {window.electronAPI && (
          <>
            <div className="border-t border-red-500/10 my-3" />
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-medium text-gray-200">Uninstall App</h4>
                <p className="text-xs text-gray-500 mt-1">Remove application binaries only. Your servers, worlds, and data will remain.</p>
              </div>
              <button
                onClick={handleUninstallApp}
                className="px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-lg text-sm transition-colors border border-orange-500/20 flex items-center gap-2"
              >
                <Trash2 size={16} />
                Uninstall App
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-gray-200">Complete Removal</h4>
                <p className="text-xs text-gray-500 mt-1">Delete ALL MineControl OS data including servers, worlds, and backups. Cannot be undone.</p>
              </div>
              <button
                onClick={handleCompleteRemoval}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm transition-colors border border-red-500/20 flex items-center gap-2"
              >
                <Trash2 size={16} />
                Remove All Data
              </button>
            </div>
          </>
        )}
        <div className="border-t border-red-500/10 my-3" />
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-gray-200">Manage Uninstall & Restore</h4>
            <p className="text-xs text-gray-500 mt-1">View storage analysis, restore options, and uninstall history.</p>
          </div>
          <a
            href="/uninstall"
            className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-gray-300 rounded-lg text-sm transition-colors border border-surface-600 flex items-center gap-2"
          >
            Open Uninstall Manager
          </a>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0f172a] border border-red-500/30 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <AlertCircle size={24} />
              <h3 className="text-lg font-bold">Delete Server</h3>
            </div>
            <p className="text-sm text-gray-300 mb-4">
              Are you absolutely sure you want to delete this server? This will WIPE all world data, plugins, and settings permanently.
            </p>
            <div className="mb-6">
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Type <span className="font-bold text-white">"{serverName}"</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                className="w-full bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 placeholder-gray-600 transition-all"
                placeholder={serverName}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteServer}
                disabled={deleteConfirmName !== serverName}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                Yes, Delete Server
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IssueTrackerConfigForm({ serverId }: { serverId: string }) {
  const [config, setConfig] = useState<any>({ provider: 'github', url: '', api_token: '', repository: '', project_key: '', enabled: false, auto_sync: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const c = await api.getIssueTrackerConfig(serverId);
        if (c && c.id) setConfig(c);
      } catch {}
      setLoading(false);
    })();
  }, [serverId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveIssueTrackerConfig({ server_id: serverId, ...config });
      toast.success('Issue tracker config saved');
    } catch (err: any) { toast.error(err.message); }
    setSaving(false);
  };

  if (loading) return <div className="text-xs text-gray-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Provider</label>
          <select value={config.provider} onChange={(e) => setConfig((prev: any) => ({ ...prev, provider: e.target.value }))} className="input w-full text-xs">
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
            <option value="jira">Jira</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Repository / Tracker URL</label>
          <input type="text" value={config.url} onChange={(e) => setConfig((prev: any) => ({ ...prev, url: e.target.value }))} className="input w-full text-xs" placeholder="https://github.com/user/repo" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">API Token</label>
          <input type="password" value={config.api_token} onChange={(e) => setConfig((prev: any) => ({ ...prev, api_token: e.target.value }))} className="input w-full text-xs" placeholder="Optional: for auto-submit" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Project Key</label>
          <input type="text" value={config.project_key} onChange={(e) => setConfig((prev: any) => ({ ...prev, project_key: e.target.value }))} className="input w-full text-xs" placeholder="Optional: for Jira" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input type="checkbox" checked={config.enabled} onChange={(e) => setConfig((prev: any) => ({ ...prev, enabled: e.target.checked }))} className="rounded" />
          Enable Integration
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input type="checkbox" checked={config.auto_sync} onChange={(e) => setConfig((prev: any) => ({ ...prev, auto_sync: e.target.checked }))} className="rounded" />
          Auto-sync tickets
        </label>
      </div>
      <button onClick={handleSave} disabled={saving} className="btn-primary text-xs flex items-center gap-1">
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
        {saving ? 'Saving...' : 'Save Tracker Config'}
      </button>
    </div>
  );
}

function SecurityHealthCard({ serverId: _serverId }: { serverId?: string }) {
  const [health, setHealth] = useState<any>(null);
  const [prefs, setPrefs] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [h, p] = await Promise.all([
        api.getSecurityStatus(),
        api.getPrivacyPreferences(),
      ]);
      setHealth(h);
      setPrefs(p);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const runCheck = async () => {
    setRunning(true);
    try {
      await api.runSecurityCheck();
      await fetchAll();
      toast.success('Security check complete');
    } catch (e: any) {
      toast.error(e.message || 'Check failed');
    }
    setRunning(false);
  };

  if (loading) return <div className="text-xs text-gray-500">Loading security status...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`text-2xl font-bold ${
            !health ? 'text-gray-500' :
            health.score >= 80 ? 'text-green-400' :
            health.score >= 50 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {health?.score ?? '?'}<span className="text-sm text-gray-500 font-normal">/100</span>
          </div>
          {health && (
            <div className="flex gap-2 text-xs">
              <span className="text-green-400">{health.passCount ?? 0} pass</span>
              <span className="text-yellow-400">{health.warnCount ?? 0} warn</span>
              <span className="text-red-400">{health.failCount ?? 0} fail</span>
            </div>
          )}
        </div>
        <button
          onClick={runCheck}
          disabled={running}
          className="px-3 py-1.5 bg-minecraft-500/20 hover:bg-minecraft-500/30 text-minecraft-400 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 disabled:opacity-50"
        >
          {running ? (
            <>
              <RefreshCw size={12} className="animate-spin" />
              Running...
            </>
          ) : (
            <>
              <RefreshCw size={12} />
              Run Check
            </>
          )}
        </button>
      </div>

      {health?.warnings?.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 space-y-1">
          {health.warnings.map((w: string, i: number) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px] text-yellow-400">
              <AlertCircle size={10} />
              {w}
            </div>
          ))}
        </div>
      )}

      {health?.lastChecked && (
        <p className="text-[10px] text-gray-600">Last full check: {new Date(health.lastChecked).toLocaleString()}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-surface-800/50 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Privacy Settings</p>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between"><span className="text-gray-400">Analytics</span><span className={prefs?.collect_analytics ? 'text-green-400' : 'text-gray-600'}>{prefs?.collect_analytics ? 'Enabled' : 'Disabled'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Log Masking</span><span className={prefs?.mask_secrets_in_logs ? 'text-green-400' : 'text-gray-600'}>{prefs?.mask_secrets_in_logs ? 'Active' : 'Inactive'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">UI Masking</span><span className={prefs?.mask_secrets_in_ui ? 'text-green-400' : 'text-gray-600'}>{prefs?.mask_secrets_in_ui ? 'Active' : 'Inactive'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Log Retention</span><span className="text-gray-300">{prefs?.log_retention_days ?? 7}d</span></div>
          </div>
        </div>
        <div className="bg-surface-800/50 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Quick Actions</p>
          <div className="space-y-1.5">
            <button onClick={() => api.clearPrivacyLogs().then(() => toast.success('Logs cleared')).catch(() => toast.error('Failed'))} className="w-full text-left text-[11px] text-gray-400 hover:text-gray-200 transition-colors">
              Clear All Logs
            </button>
            <button onClick={() => api.clearPrivacyCache().then(() => toast.success('Cache cleared')).catch(() => toast.error('Failed'))} className="w-full text-left text-[11px] text-gray-400 hover:text-gray-200 transition-colors">
              Clear Cache
            </button>
            <button onClick={() => api.clearPrivacyFeedback().then(() => toast.success('Feedback queue cleared')).catch(() => toast.error('Failed'))} className="w-full text-left text-[11px] text-gray-400 hover:text-gray-200 transition-colors">
              Clear Feedback Queue
            </button>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-gray-600">
        <a href="/privacy" className="text-minecraft-500 hover:text-minecraft-400 transition-colors">Open Privacy & Security Center →</a>
      </p>
    </div>
  );
}

function UpdateToggle({ prefKey }: { prefKey: string }) {
  const [value, setValue] = useState<string>('true');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const prefs = await api.getUpdatePreferences();
        setValue(prefs[prefKey] ?? 'true');
      } catch {}
      setLoading(false);
    })();
  }, [prefKey]);

  const toggle = async () => {
    const newVal = value === 'true' ? 'false' : 'true';
    setValue(newVal);
    try {
      await api.setUpdatePreference(prefKey, newVal);
      toast.success('Preference updated');
    } catch {
      setValue(value);
      toast.error('Failed to update preference');
    }
  };

  if (loading) return <div className="w-8 h-5 bg-surface-700 rounded-full animate-pulse" />;
  return (
    <input
      type="checkbox"
      className="toggle"
      checked={value === 'true'}
      onChange={toggle}
    />
  );
}

function VersionRow({ version, currentVersion, switchingVersion, onSwitch }: {
  version: any;
  currentVersion: string;
  switchingVersion: string | null;
  onSwitch: (version: string, source: string) => void;
}) {
  const isCurrent = version.current || currentVersion === version.version;
  const isSwitching = switchingVersion === version.version;
  const isDownloaded = version.downloaded;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border-l-2 transition-all ${
      isCurrent
        ? 'bg-minecraft-500/10 border-l-green-500 border border-green-500/20'
        : 'bg-surface-800/30 border-l-transparent border border-transparent hover:bg-surface-800 hover:border-surface-600'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-mono ${
            isCurrent ? 'text-green-400 font-medium' : 'text-gray-300'
          }`}>
            {version.version}
          </span>
          {isCurrent && (
            <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-medium">
              CURRENT
            </span>
          )}
          {isDownloaded && !isCurrent && (
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-medium">
              DOWNLOADED
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[11px] px-1.5 py-0.5 rounded ${
            version.source === 'PaperMC'
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-orange-500/20 text-orange-400'
          }`}>
            {version.source === 'PaperMC' ? 'Paper' : 'Vanilla'}
          </span>
          <span className="text-xs text-gray-500">{version.type}</span>
        </div>
      </div>
      <button
        onClick={() => onSwitch(version.version, version.source)}
        disabled={isCurrent || isSwitching}
        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          isCurrent
            ? 'bg-green-500/10 text-green-400/50 cursor-default'
            : isSwitching
              ? 'bg-minecraft-500/20 text-minecraft-400 cursor-wait'
              : 'bg-minecraft-500/20 text-minecraft-400 hover:bg-minecraft-500/30 active:bg-minecraft-500/40'
        }`}
      >
        {isSwitching ? (
          <span className="flex items-center gap-1.5">
            <div className="w-3 h-3 border-2 border-minecraft-400 border-t-transparent rounded-full animate-spin" />
            Downloading...
          </span>
        ) : isCurrent ? (
          <span className="flex items-center gap-1.5">
            <CheckCircle size={13} />
            Active
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            {isDownloaded ? <CheckCircle size={13} /> : <Download size={13} />}
            {isDownloaded ? 'Switch' : 'Download'}
          </span>
        )}
      </button>
    </div>
  );
}