import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings as SettingsIcon, Save, Key, Shield, Server, RefreshCw,
  Eye, EyeOff, Globe, Users, Wifi, Download, CheckCircle, AlertCircle,
  ChevronDown, ChevronRight, Search, Cpu, Trash2, MessageSquare
} from 'lucide-react';
import pkg from '../../package.json';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user, isOwner } = useAuth();
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

  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [serverName, setServerName] = useState('');
  const [onlineMode, setOnlineMode] = useState(true);

  useEffect(() => {
    Promise.all([fetchConfig(), fetchProps(), fetchActiveServer()]).finally(() => setLoading(false));
  }, []);

  const fetchActiveServer = async () => {
    try {
      const data = await api.getServers();
      setActiveServerId(data.activeServerId);
      const active = data.servers.find((s: any) => s.id === data.activeServerId);
      if (active) {
        setServerName(active.name);
        setOnlineMode(active.onlineMode);
      }
    } catch {}
  };

  useEffect(() => {
    if (!loading) fetchVersions();
  }, [loading]);

  const fetchConfig = async () => {
    try { setConfig(await api.getServerConfig()); } catch {}
  };

  const fetchProps = async () => {
    try { setProps(await api.getServerProperties()); } catch {}
  };

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
      if (activeServerId) {
        await api.put(`/servers/${activeServerId}`, {
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

  const handleDeleteServer = async () => {
    if (!activeServerId) return;
    if (deleteConfirmName !== serverName) {
      toast.error('Server name did not match. Deletion cancelled.');
      return;
    }
    
    try {
      await api.deleteServer(activeServerId);
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
        {/* Discord Integration */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <MessageSquare size={16} className="text-blue-500" />
            Discord Integration
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-full">
              <p className="text-xs text-gray-400 mb-4">
                Connect your server to a Discord bot to sync chat, track server status, and send logs. You must restart the MineControl backend for changes to take effect.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Bot Token</label>
              <input
                type="password"
                value={config.discordToken || ''}
                onChange={(e) => setConfig({ ...config, discordToken: e.target.value })}
                className="input"
                placeholder="ODk..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Channel ID</label>
              <input
                type="text"
                value={config.discordChannel || ''}
                onChange={(e) => setConfig({ ...config, discordChannel: e.target.value })}
                className="input"
                placeholder="1234567890"
              />
            </div>
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

      <div className="card border border-red-500/20 bg-red-500/5">
        <h3 className="text-sm font-medium text-red-400 mb-4 flex items-center gap-2">
          <AlertCircle size={16} />
          Danger Zone
        </h3>
        <div className="flex items-center justify-between">
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