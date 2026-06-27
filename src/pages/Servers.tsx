import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, Plus, Search, Settings, Play, Square, Trash2,
  Globe, Wifi, HardDrive, Calendar, Clock, Import, X, Save,
  CheckCircle, XCircle, Hash, Layers, Bookmark,
} from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

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

function formatDate(dateStr: string): string {
  if (!dateStr) return '---';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeTime(dateStr: string): string {
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
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeStatus, setActiveStatus] = useState<ServerStatus | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState<CreateServerForm>({
    name: '', port: 25565, software: 'paper', version: '',
    minRam: 2, maxRam: 4, gamemode: 'survival', difficulty: 'easy', seed: '',
  });
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [activeId]);

  const fetchServers = async () => {
    try {
      const data = await api.getServers();
      setServers(data.servers);
      setActiveId(data.activeServerId);
    } catch {}
    setLoading(false);
  };

  const fetchStatus = async () => {
    if (!activeId) return;
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
          const sourceMap: Record<string, string> = { paper: 'PaperMC', purpur: 'Purpur', fabric: 'Fabric', forge: 'Forge', vanilla: 'Mojang', neoforge: 'NeoForge' };
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
    if (id === activeId) return;
    const server = servers.find(s => s.id === id);
    if (!server) return;
    try {
      await api.selectServer(id);
      setActiveId(id);
      toast.success(`Switched to ${server.name}`);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleNavigateWithSelect = async (serverId: string, path: string) => {
    if (serverId !== activeId) {
      try {
        await api.selectServer(serverId);
        setActiveId(serverId);
      } catch (err: any) {
        toast.error(err.message);
        return;
      }
    }
    navigate(path);
  };

  const handleServerAction = async (serverId: string, action: 'start' | 'stop') => {
    if (serverId !== activeId) {
      try {
        await api.selectServer(serverId);
        setActiveId(serverId);
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
      toast.error(err.message);
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
      setServers(prev => [...prev, result.server]);
      setShowCreate(false);
      setFormData({
        name: '', port: 25565, software: 'paper', version: '',
        minRam: 2, maxRam: 4, gamemode: 'survival', difficulty: 'easy', seed: '',
      });
      toast.success(`Server "${result.server.name}" created!`);
    } catch (err: any) {
      toast.error(err.message);
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    const server = servers.find(s => s.id === id);
    if (!server) return;
    try {
      await api.deleteServer(id);
      setServers(prev => prev.filter(s => s.id !== id));
      setDeleteConfirm(null);
      toast.success(`Server "${server.name}" deleted`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const filteredServers = servers.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSoftwareStyle = (source: string) =>
    SOFTWARE_OPTIONS.find(s => s.value === source?.toLowerCase()) || SOFTWARE_OPTIONS[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Server Library</h1>
          <p className="text-sm text-gray-500 mt-1">
            {servers.length} {servers.length === 1 ? 'server' : 'servers'} configured
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/import')}
            className="btn-secondary flex items-center gap-2"
          >
            <Import size={16} />
            Import
          </button>
          <button
            onClick={() => { setShowCreate(true); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={16} />
            Create Server
          </button>
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
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => { setShowCreate(true); }}
                className="btn-primary flex items-center gap-2 px-6 py-2.5"
              >
                <Plus size={18} />
                Create Your First Server
              </button>
              <button
                onClick={() => navigate('/import')}
                className="btn-secondary flex items-center gap-2 px-6 py-2.5"
              >
                <Import size={18} />
                Import Existing Server
              </button>
            </div>
          )}
        </div>
      )}

      {/* Server Grid */}
      {filteredServers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredServers.map(server => {
            const isActive = server.id === activeId;
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
                      <button
                        onClick={() => handleServerAction(server.id, 'stop')}
                        className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                        title="Stop Server"
                      >
                        <Square size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleServerAction(server.id, 'start')}
                        disabled={server.status === 'starting'}
                        className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
                        title="Start Server"
                      >
                        <Play size={14} />
                      </button>
                    )}

                    <button
                      onClick={() => handleNavigateWithSelect(server.id, '/dashboard')}
                      className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-colors"
                      title="Open Dashboard"
                    >
                      <Layers size={14} />
                    </button>

                    <button
                      onClick={() => handleNavigateWithSelect(server.id, '/settings')}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-700/50 transition-colors"
                      title="Settings"
                    >
                      <Settings size={14} />
                    </button>

                    {deleteConfirm === server.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(server.id)}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Confirm Delete"
                        >
                          <CheckCircle size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-surface-700/50 transition-colors"
                          title="Cancel"
                        >
                          <XCircle size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
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
                      </button>
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
              <button
                onClick={() => { if (!creating) setShowCreate(false); }}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-800 transition-colors"
              >
                <X size={18} />
              </button>
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
                        {availableVersions.map(v => (
                          <option key={v} value={v}>{v}</option>
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
              <button
                onClick={() => setShowCreate(false)}
                disabled={creating}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !formData.name.trim()}
                className="btn-primary flex items-center gap-2"
              >
                {creating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Create Server
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
