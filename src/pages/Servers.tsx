import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, Plus, Search, Settings, Play, Square, Trash2,
  Globe, Wifi, HardDrive, Calendar, Clock, Import, X, Save,
  CheckCircle, XCircle, Hash, Layers, Bookmark, Download, ChevronRight,
  AlertTriangle, Zap,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import toast from 'react-hot-toast';
import { useActiveServer } from '../hooks/useActiveServer';
import { Button } from '../components/ui/stateful-button';

interface ServerRecord {
  id: string;
  name: string;
  slug: string;
  port: number;
  directory: string;
  version: string;
  version_source: string;
  javaPath: string;
  jarFile: string;
  minRam: string;
  maxRam: string;
  motd: string;
  difficulty: string;
  gamemode: string;
  pvp: boolean;
  maxPlayers: number;
  viewDistance: number;
  onlineMode: boolean;
  autoRestart: boolean;
  autoBackup: boolean;
  whitelistEnabled: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ServerStatus {
  running: boolean;
  starting: boolean;
  onlinePlayers: number | null;
  maxPlayers: number;
  mcDirSize: number;
  serverVersion: string;
  serverSoftware: string;
}

interface CreateServerForm {
  name: string;
  port: number;
  software: string;
  version: string;
  minRam: number;
  maxRam: number;
  gamemode: string;
  difficulty: string;
  seed: string;
}

const SOFTWARE_OPTIONS = [
  { value: 'paper', label: 'Paper', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  { value: 'purpur', label: 'Purpur', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  { value: 'fabric', label: 'Fabric', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  { value: 'forge', label: 'Forge', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  { value: 'neoforge', label: 'NeoForge', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
  { value: 'quilt', label: 'Quilt', color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20' },
  { value: 'spigot', label: 'Spigot', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { value: 'folia', label: 'Folia', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { value: 'pufferfish', label: 'Pufferfish', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  { value: 'vanilla', label: 'Vanilla', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
];

const GAME_MODES = ['survival', 'creative', 'adventure', 'spectator'];
const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'];

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '---';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '---';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeTime(dateStr: string | undefined | null): string {
  if (!dateStr) return 'Never';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

export default function Servers() {
  const navigate = useNavigate();
  const { servers: contextServers, server: activeServer, loading, selectServer, refresh } = useActiveServer();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeStatus, setActiveStatus] = useState<ServerStatus | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState<CreateServerForm>({
    name: '', port: 25565, software: 'paper', version: '',
    minRam: 2, maxRam: 4, gamemode: 'survival', difficulty: 'easy', seed: '',
  });
  const [availableVersions, setAvailableVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [activeServer?.id]);

  const fetchStatus = async () => {
    if (!activeServer?.id) return;
    try {
      const status = await api.getServerStatus();
      setActiveStatus(status);
    } catch {}
  };

  useEffect(() => {
    if (!showCreate) return;
    const loadVersions = async () => {
      setLoadingVersions(true);
      try {
        const resp = await api.getAvailableVersions();
        const vList = resp?.availableVersions || (Array.isArray(resp) ? resp : []);
        if (Array.isArray(vList)) {
          const sourceMap: Record<string, string> = { paper: 'PaperMC', purpur: 'Purpur', fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt', spigot: 'Spigot', folia: 'Folia', pufferfish: 'Pufferfish', vanilla: 'Mojang' };
          const src = sourceMap[formData.software?.toLowerCase()] || '';
          const filtered = src ? vList.filter((v: any) => v.source === src) : vList;
          setAvailableVersions(filtered);
        } else {
          setAvailableVersions([]);
        }
      } catch {
        setAvailableVersions([]);
      }
      setLoadingVersions(false);
    };
    loadVersions();
  }, [showCreate, formData.software]);

  const handleSelect = async (id: string) => {
    if (id === activeServer?.id) return;
    const server = contextServers.find(s => s.id === id);
    if (!server) return;
    await selectServer(id);
  };

  const handleNavigateWithSelect = async (serverId: string, path: string) => {
    if (serverId !== activeServer?.id) {
      try {
        await api.selectServer(serverId);
        await refresh();
      } catch (err: any) {
        if (err instanceof ApiError && err.code && err.reason) {
          toast.error(err.reason || err.message, { duration: 5000 });
        } else {
          toast.error(err.message || 'Failed to select server');
        }
        return;
      }
    }
    navigate(path);
  };

  const handleServerAction = async (serverId: string, action: 'start' | 'stop') => {
    if (serverId !== activeServer?.id) {
      try {
        await api.selectServer(serverId);
        await refresh();
      } catch (err: any) {
        toast.error(err.message);
        return;
      }
    }
    try {
      if (action === 'start') {
        await api.startServer();
        toast.success('Server starting...');
      } else {
        await api.stopServer();
        toast.success('Server stopped');
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.code && err.reason) {
        toast.error(err.reason || 'Server operation failed', { duration: 6000 });
        if (err.repairAction) {
          setTimeout(() => toast(err.repairAction || '', { icon: '💡', duration: 8000 }), 100);
        }
      } else {
        toast.error(err.message || 'Server operation failed');
      }
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Server name is required');
      return;
    }
    setCreating(true);
    try {
      const result = await api.createServer({
        name: formData.name.trim(),
        port: formData.port,
        software: formData.software,
        version: formData.version || undefined,
        minRam: `${formData.minRam}G`,
        maxRam: `${formData.maxRam}G`,
        gamemode: formData.gamemode,
        difficulty: formData.difficulty,
        seed: formData.seed || undefined,
      });
      await refresh();
      setShowCreate(false);
      setFormData({
        name: '', port: 25565, software: 'paper', version: '',
        minRam: 2, maxRam: 4, gamemode: 'survival', difficulty: 'easy', seed: '',
      });
      toast.success(`Server "${result.server.name}" created!`);
    } catch (err: any) {
      if (err instanceof ApiError && err.reason) {
        toast.error(err.reason, { duration: 5000 });
      } else {
        toast.error(err.message || 'Failed to create server');
      }
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    const server = contextServers.find(s => s.id === id);
    if (!server) return;
    try {
      await api.deleteServer(id);
      await refresh();
      setDeleteConfirm(null);
      toast.success(`Server "${server.name}" deleted`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const filteredServers = contextServers.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSoftwareStyle = (source: string | undefined) =>
    SOFTWARE_OPTIONS.find(s => s.value === (source || '').toLowerCase()) || SOFTWARE_OPTIONS[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Three option cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Button
          variant="none"
          onClick={() => setShowCreate(true)}
          className="group relative p-6 rounded-2xl bg-gradient-to-br from-minecraft-600/20 to-minecraft-700/10 border-2 border-minecraft-500/30 hover:border-minecraft-500/60 hover:shadow-[0_0_30px_rgba(34,197,94,0.15)] transition-all duration-300 text-center flex-col"
        >
          <div className="w-12 h-12 mx-auto rounded-full bg-minecraft-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
            <Plus className="w-6 h-6 text-minecraft-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-100 mb-1">Create Server</h3>
          <p className="text-xs text-gray-400 leading-relaxed">Set up a brand new Minecraft server from scratch.</p>
        </Button>

        <Button
          variant="none"
          onClick={() => {
            if (contextServers.length > 0) {
              document.getElementById('server-grid')?.scrollIntoView({ behavior: 'smooth' });
            } else {
              setShowCreate(true);
            }
          }}
          className="group relative p-6 rounded-2xl bg-surface-800/50 border-2 border-surface-700/50 hover:border-surface-600 hover:bg-surface-800 transition-all duration-300 text-center flex-col"
        >
          <div className="w-12 h-12 mx-auto rounded-full bg-surface-700 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
            <Play className="w-6 h-6 text-gray-400 group-hover:text-white transition-colors" />
          </div>
          <h3 className="text-lg font-bold text-gray-100 mb-1">Open Existing Server</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            {contextServers.length > 0
              ? `Select from ${contextServers.length} ${contextServers.length === 1 ? 'server' : 'servers'} and pick up where you left off.`
              : 'No servers yet. Create one to get started.'}
          </p>
        </Button>

        <Button
          variant="none"
          onClick={() => navigate('/import')}
          className="group relative p-6 rounded-2xl bg-surface-800/50 border-2 border-surface-700/50 hover:border-surface-600 hover:bg-surface-800 transition-all duration-300 text-center flex-col"
        >
          <div className="w-12 h-12 mx-auto rounded-full bg-surface-700 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
            <Download className="w-6 h-6 text-gray-400 group-hover:text-white transition-colors" />
          </div>
          <h3 className="text-lg font-bold text-gray-100 mb-1">Import Server</h3>
          <p className="text-xs text-gray-400 leading-relaxed">Bring an existing server folder or ZIP into MineControl OS.</p>
        </Button>
      </div>

      {/* Restore Detection */}
      <DetectionBanner serverCount={contextServers.length} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Server Library</h1>
          <p className="text-sm text-gray-500 mt-1">
            {contextServers.length} {contextServers.length === 1 ? 'server' : 'servers'} configured
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => navigate('/import')}>
            <Import size={16} />
            Import
          </Button>
          <Button variant="primary" onClick={() => { setShowCreate(true); }}>
            <Plus size={16} />
            Create Server
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Search servers..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="input pl-10"
        />
      </div>

      {/* Empty State */}
      {filteredServers.length === 0 && (
        <div className="card text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-minecraft-500/10 flex items-center justify-center">
            <Server size={32} className="text-minecraft-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-200 mb-2">
            {searchQuery ? 'No Servers Found' : 'Welcome to MineControl OS'}
          </h2>
          <p className="text-sm text-gray-500 mb-8 max-w-md mx-auto">
            {searchQuery
              ? `No servers match "${searchQuery}". Try a different search.`
              : 'Your server library is empty. Create your first Minecraft server to get started.'}
          </p>
          {!searchQuery && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-4 justify-center">
                <Button
                  variant="primary"
                  onClick={() => navigate('/wizard')}
                  className="px-6 py-2.5"
                >
                  <Zap size={18} />
                  Guided Setup Wizard
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => { setShowCreate(true); }}
                  className="px-6 py-2.5"
                >
                  <Plus size={18} />
                  Quick Create
                </Button>
              </div>
              <Button
                variant="none"
                onClick={() => navigate('/import')}
                className="text-sm text-gray-500 hover:text-gray-300 gap-1.5 transition-colors"
              >
                <Import size={14} />
                Import Existing Server
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Server Grid */}
      {filteredServers.length > 0 && (
        <div id="server-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredServers.map(server => {
            const isActive = server.id === activeServer?.id;
            const sw = getSoftwareStyle(server.version_source);
            const showActiveStats = isActive && activeStatus;

            return (
              <div
                key={server.id}
                className={`card-hover relative overflow-hidden group ${
                  isActive ? 'ring-2 ring-minecraft-500/40' : ''
                }`}
              >
                {isActive && (
                  <div className="absolute top-0 right-0 z-10">
                    <div className="bg-minecraft-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">
                      ACTIVE
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-4 mb-4">
                  <div className={`p-3 rounded-xl ${
                    isActive ? 'bg-minecraft-500/10 text-minecraft-400' : 'bg-surface-800 text-gray-400'
                  }`}>
                    <Server size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-gray-100 truncate">{server.name}</h3>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{server.slug}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${sw.color} ${sw.bg} ${sw.border} border`}>
                    {server.version_source || 'Unknown'}
                  </span>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mb-4 text-xs">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Globe size={13} className="text-gray-500 shrink-0" />
                    <span className="truncate">Port {server.port}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Hash size={13} className="text-gray-500 shrink-0" />
                    <span className="truncate">{server.version || '?'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Wifi size={13} className="text-gray-500 shrink-0" />
                    <span className="truncate">
                      {showActiveStats
                        ? `${activeStatus.onlinePlayers ?? 0}/${server.maxPlayers} players`
                        : `0/${server.maxPlayers} players`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <HardDrive size={13} className="text-gray-500 shrink-0" />
                    <span className="truncate">{showActiveStats ? `${activeStatus.mcDirSize || 0} MB` : '---'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Calendar size={13} className="text-gray-500 shrink-0" />
                    <span className="truncate">{formatDate(server.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Clock size={13} className="text-gray-500 shrink-0" />
                    <span className="truncate">{formatRelativeTime(server.updated_at)}</span>
                  </div>
                </div>

                {/* Status & Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-surface-700/50">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      server.status === 'running' ? 'bg-green-500 shadow-sm shadow-green-500/50' :
                      server.status === 'starting' ? 'bg-yellow-500 animate-pulse' :
                      'bg-gray-500'
                    }`} />
                    <span className={`text-xs font-medium ${
                      server.status === 'running' ? 'text-green-400' :
                      server.status === 'starting' ? 'text-yellow-400' :
                      'text-gray-500'
                    }`}>
                      {server.status === 'running' ? 'Online' :
                       server.status === 'starting' ? 'Starting...' : 'Offline'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {server.status === 'running' ? (
                      <Button
                        variant="none"
                        onClick={() => handleServerAction(server.id, 'stop')}
                        className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                        title="Stop Server"
                      >
                        <Square size={14} />
                      </Button>
                    ) : (
                      <Button
                        variant="none"
                        onClick={() => handleServerAction(server.id, 'start')}
                        disabled={server.status === 'starting'}
                        className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
                        title="Start Server"
                      >
                        <Play size={14} />
                      </Button>
                    )}

                    <Button
                      variant="none"
                      onClick={() => handleNavigateWithSelect(server.id, '/dashboard')}
                      className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-colors"
                      title="Open Dashboard"
                    >
                      <Layers size={14} />
                    </Button>

                    <Button
                      variant="none"
                      onClick={() => handleNavigateWithSelect(server.id, '/settings')}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-700/50 transition-colors"
                      title="Settings"
                    >
                      <Settings size={14} />
                    </Button>

                    {deleteConfirm === server.id ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="none"
                          onClick={() => handleDelete(server.id)}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Confirm Delete"
                        >
                          <CheckCircle size={14} />
                        </Button>
                        <Button
                          variant="none"
                          onClick={() => setDeleteConfirm(null)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-surface-700/50 transition-colors"
                          title="Cancel"
                        >
                          <XCircle size={14} />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="none"
                        onClick={() => setDeleteConfirm(server.id)}
                        disabled={isActive}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isActive
                            ? 'text-gray-600 cursor-not-allowed'
                            : 'text-gray-500 hover:text-red-400 hover:bg-red-500/10'
                        }`}
                        title="Delete Server"
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Server Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { if (!creating) setShowCreate(false); }}
          />
          <div className="relative bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-surface-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-minecraft-500/10 text-minecraft-400">
                  <Server size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-100">Create New Server</h2>
                  <p className="text-xs text-gray-500">Configure your Minecraft server</p>
                </div>
              </div>
              <Button
                variant="none"
                onClick={() => { if (!creating) setShowCreate(false); }}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-800 transition-colors"
              >
                <X size={18} />
              </Button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Server Name *</label>
                <input
                  type="text"
                  placeholder="My Awesome Server"
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  className="input"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Port</label>
                <input
                  type="number"
                  placeholder="25565"
                  value={formData.port}
                  onChange={e => setFormData(p => ({ ...p, port: parseInt(e.target.value) || 25565 }))}
                  className="input"
                  min={1024}
                  max={65535}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Software</label>
                  <select
                    value={formData.software}
                    onChange={e => setFormData(p => ({ ...p, software: e.target.value, version: '' }))}
                    className="select"
                  >
                    {SOFTWARE_OPTIONS.map(sw => (
                      <option key={sw.value} value={sw.value}>{sw.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Version</label>
                  <select
                    value={formData.version}
                    onChange={e => setFormData(p => ({ ...p, version: e.target.value }))}
                    className="select"
                    disabled={loadingVersions}
                  >
                    {loadingVersions ? (
                      <option value="">Loading...</option>
                    ) : (
                      <>
                        <option value="">Latest</option>
                        {availableVersions.map((v: any) => (
                          <option key={v.version} value={v.version}>{v.version}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Min RAM: {formData.minRam}GB
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={16}
                    step={1}
                    value={formData.minRam}
                    onChange={e => setFormData(p => ({ ...p, minRam: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                    <span>1GB</span>
                    <span>16GB</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Max RAM: {formData.maxRam}GB
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={16}
                    step={1}
                    value={formData.maxRam}
                    onChange={e => setFormData(p => ({ ...p, maxRam: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                    <span>1GB</span>
                    <span>16GB</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Game Mode</label>
                  <select
                    value={formData.gamemode}
                    onChange={e => setFormData(p => ({ ...p, gamemode: e.target.value }))}
                    className="select"
                  >
                    {GAME_MODES.map(mode => (
                      <option key={mode} value={mode}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Difficulty</label>
                  <select
                    value={formData.difficulty}
                    onChange={e => setFormData(p => ({ ...p, difficulty: e.target.value }))}
                    className="select"
                  >
                    {DIFFICULTIES.map(diff => (
                      <option key={diff} value={diff}>{diff.charAt(0).toUpperCase() + diff.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Seed (optional)</label>
                <input
                  type="text"
                  placeholder="Leave empty for random seed"
                  value={formData.seed}
                  onChange={e => setFormData(p => ({ ...p, seed: e.target.value }))}
                  className="input"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-surface-700/50">
              <Button
                variant="ghost"
                onClick={() => setShowCreate(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreate}
                loading={creating}
                disabled={creating || !formData.name.trim()}
              >
                {creating ? 'Creating...' : <><Save size={16} /> Create Server</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetectionBanner({ serverCount }: { serverCount: number }) {
  const [detection, setDetection] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (serverCount > 0) { setLoading(false); return; }
    (async () => {
      try {
        const d = await api.detectExistingInstallation();
        setDetection(d);
      } catch {}
      setLoading(false);
    })();
  }, [serverCount]);

  if (loading || serverCount > 0 || !detection?.installationFound) return null;

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-yellow-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-medium text-yellow-400 mb-1">Existing Installation Detected</h4>
          <p className="text-xs text-gray-400">
            MineControl OS data was found in the local storage directory.
            You can restore your previous servers and settings.
          </p>
          <div className="flex gap-2 mt-3">
            <Button
              variant="none"
              onClick={async () => {
                setRestoring(true);
                try {
                  const result = await api.restoreInstallation();
                  if (result.success) {
                    toast.success(result.message);
                    window.location.reload();
                  } else {
                    toast.error(result.message);
                  }
                } catch (e: any) {
                  toast.error(e.message || 'Restore failed');
                }
                setRestoring(false);
              }}
              loading={restoring}
              disabled={restoring}
              className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-all"
            >
              Restore
            </Button>
            <Button
              variant="none"
              onClick={() => navigate('/uninstall')}
              className="px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-xs font-medium transition-all"
            >
              Manage Data
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
