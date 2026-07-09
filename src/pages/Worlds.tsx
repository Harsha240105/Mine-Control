import React, { useEffect, useState, useCallback } from 'react';
import {
  Globe, Plus, Trash2, Download, Copy, Upload, HardDrive, Server,
  RefreshCw, Settings, Wrench, FolderOpen, FileArchive, Database,
  Map, Layers, Users, Clock, Activity, CheckCircle, XCircle,
  AlertTriangle, MoreHorizontal, Edit3, X, Search, FileText,
  Zap, Shield, ChevronDown, ExternalLink, Save,
} from 'lucide-react';
import { Button } from '../components/ui/stateful-button';
import { api } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
import { useActiveServer } from '../hooks/useActiveServer';
import toast from 'react-hot-toast';

interface World {
  name: string;
  server_id: string | null;
  seed: string;
  gamemode: string;
  difficulty: string;
  size: string;
  regionSize?: string;
  playerdataSize?: string;
  statsSize?: string;
  last_backup: string | null;
  created_at: string;
  last_played: string | null;
  dimension_count: number;
  chunk_count: number;
  totalChunks?: number;
  totalRegions?: number;
  version: string;
  software: string;
  folder_path: string;
  optimization_status: string;
  repair_status: string;
  world_type: string;
  hardcore: number;
  generate_structures: number;
  bonus_chest: number;
  simulation_distance: number;
  view_distance: number;
  player_count: number;
  playerCount?: number;
  dimensions?: any[];
  levelData?: any;
  players?: any[];
  backups?: any[];
  scan?: any;
  lastBackup?: string | null;
  tracked?: boolean;
  exists?: boolean;
  onlinePlayers?: number;
}

export default function Worlds() {
  const { server: activeServer } = useActiveServer();
  const [worlds, setWorlds] = useState<World[]>([]);
  const [currentWorld, setCurrentWorld] = useState<World | null>(null);
  const [selectedWorld, setSelectedWorld] = useState<World | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImportZip, setShowImportZip] = useState(false);
  const [showImportFolder, setShowImportFolder] = useState(false);
  const [showRename, setShowRename] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState<string | null>(null);
  const [showOptimize, setShowOptimize] = useState<string | null>(null);
  const [showRepair, setShowRepair] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [worldStats, setWorldStats] = useState<any>(null);

  // Create form
  const [newName, setNewName] = useState('');
  const [newSeed, setNewSeed] = useState('');
  const [newGamemode, setNewGamemode] = useState('survival');
  const [newDifficulty, setNewDifficulty] = useState('normal');
  const [newWorldType, setNewWorldType] = useState('default');
  const [newHardcore, setNewHardcore] = useState(false);
  const [newGenStructures, setNewGenStructures] = useState(true);
  const [newBonusChest, setNewBonusChest] = useState(false);
  const [newSimDistance, setNewSimDistance] = useState(10);
  const [newViewDistance, setNewViewDistance] = useState(10);

  // Import
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importZipName, setImportZipName] = useState('');
  const [importFolderPath, setImportFolderPath] = useState('');
  const [importFolderName, setImportFolderName] = useState('');

  // Rename
  const [renameValue, setRenameValue] = useState('');

  const { socket } = useSocket();

  const fetchWorlds = useCallback(async () => {
    try {
      const data = await api.getWorlds();
      setWorlds(data);
    } catch {} finally { setLoading(false); }
  }, []);

  const fetchCurrentWorld = useCallback(async () => {
    try {
      const data = await api.getCurrentWorldInfo();
      setCurrentWorld(data);
    } catch {}
  }, []);

  const fetchWorldStats = useCallback(async () => {
    try { setWorldStats(await api.getWorldStats()); } catch {}
  }, []);

  useEffect(() => {
    fetchWorlds();
    fetchCurrentWorld();
    fetchWorldStats();
  }, [fetchWorlds, fetchCurrentWorld, fetchWorldStats]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => { fetchWorlds(); fetchCurrentWorld(); fetchWorldStats(); };
    socket.on('world:created', refresh);
    socket.on('world:deleted', refresh);
    socket.on('world:updated', refresh);
    socket.on('world:renamed', refresh);
    socket.on('world:cloned', refresh);
    socket.on('world:optimized', refresh);
    socket.on('world:repaired', refresh);
    socket.on('worlds:update', refresh);
    return () => {
      socket.off('world:created', refresh);
      socket.off('world:deleted', refresh);
      socket.off('world:updated', refresh);
      socket.off('world:renamed', refresh);
      socket.off('world:cloned', refresh);
      socket.off('world:optimized', refresh);
      socket.off('world:repaired', refresh);
      socket.off('worlds:update', refresh);
    };
  }, [socket, fetchWorlds, fetchCurrentWorld, fetchWorldStats]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createWorld({
        name: newName, seed: newSeed, gamemode: newGamemode, difficulty: newDifficulty,
        worldType: newWorldType, hardcore: newHardcore, generateStructures: newGenStructures,
        bonusChest: newBonusChest, simulationDistance: newSimDistance, viewDistance: newViewDistance,
      });
      toast.success(`World '${newName}' created`);
      setNewName('');
      setNewSeed('');
      setShowCreate(false);
      fetchWorlds();
      fetchWorldStats();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (name: string) => {
    try {
      await api.deleteWorld(name);
      toast.success(`World '${name}' deleted`);
      setShowDelete(null);
      fetchWorlds();
      fetchWorldStats();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleClone = async (name: string) => {
    const newName = `${name}-copy`;
    try {
      await api.cloneWorld(name, newName);
      toast.success(`Cloned as '${newName}'`);
      fetchWorlds();
      fetchWorldStats();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleRename = async (oldName: string) => {
    if (!renameValue.trim()) return;
    try {
      await api.renameWorld(oldName, renameValue);
      toast.success(`Renamed to '${renameValue}'`);
      setShowRename(null);
      fetchWorlds();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleOptimize = async (name: string) => {
    try {
      const result = await api.optimizeWorld(name);
      toast.success(result.message || 'World optimized');
      setShowOptimize(null);
      fetchWorlds();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleRepair = async (name: string) => {
    try {
      const result = await api.repairWorld(name);
      toast.success(result.message || 'World repaired');
      setShowRepair(null);
      fetchWorlds();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDetect = async () => {
    try {
      const result = await api.detectWorlds();
      toast.success(`Detected ${result.detected} new worlds`);
      fetchWorlds();
      fetchWorldStats();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDownloadWorld = async (name: string) => {
    try {
      const token = localStorage.getItem('mc_token');
      const url = api.downloadWorld(name);
      const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) { toast.error('Download failed'); return; }
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) { toast.error(err.message || 'Download failed'); }
  };

  const handleImportZip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) { toast.error('Select a ZIP file'); return; }
    try {
      const formData = new FormData();
      formData.append('worldFile', importFile);
      if (importZipName) formData.append('worldName', importZipName);
      const result = await api.importWorldZip(formData);
      toast.success(`Imported '${result.name}'`);
      setShowImportZip(false);
      setImportFile(null);
      setImportZipName('');
      fetchWorlds();
      fetchWorldStats();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleImportFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFolderPath) { toast.error('Enter a folder path'); return; }
    try {
      const result = await api.importWorldFolder(importFolderPath, importFolderName || undefined);
      toast.success(`Imported '${result.name}'`);
      setShowImportFolder(false);
      setImportFolderPath('');
      setImportFolderName('');
      fetchWorlds();
      fetchWorldStats();
    } catch (err: any) { toast.error(err.message); }
  };

  const openWorldDetail = async (name: string) => {
    try {
      const world = await api.getWorld(name);
      setSelectedWorld(world);
    } catch (err: any) { toast.error(err.message); }
  };

  const filteredWorlds = worlds.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase())
  );

  const difficultyColor = (d: string) => {
    switch (d) {
      case 'peaceful': return 'text-green-400';
      case 'easy': return 'text-blue-400';
      case 'normal': return 'text-yellow-400';
      case 'hard': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const worldTypeLabel = (t: string) => {
    switch (t) {
      case 'default': return 'Default';
      case 'flat': return 'Superflat';
      case 'largebiomes': return 'Large Biomes';
      case 'amplified': return 'Amplified';
      case 'single_biome_surface': return 'Single Biome';
      default: return t || 'Default';
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
          <p className="text-gray-600 text-xs">Select a server to manage its worlds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">World Manager</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {worlds.length} worlds
            {worldStats && ` · ${worldStats.totalSize} total`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleDetect} className="text-xs" title="Auto-detect worlds">
            <RefreshCw size={14} /> Detect
          </Button>
          <Button variant="secondary" onClick={() => setShowImportZip(true)} className="text-xs">
            <FileArchive size={14} /> Import ZIP
          </Button>
          <Button variant="secondary" onClick={() => setShowImportFolder(true)} className="text-xs">
            <FolderOpen size={14} /> Import Folder
          </Button>
          <Button variant="primary" onClick={() => setShowCreate(!showCreate)}>
            <Plus size={16} /> Create
          </Button>
        </div>
      </div>

      {/* Current World Card */}
      {currentWorld && currentWorld.tracked && (
        <div className="card border border-minecraft-500/20 bg-minecraft-500/5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-minecraft-500/10 text-minecraft-400">
              <Globe size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-200">Current World</span>
                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full border border-green-500/30 flex items-center gap-1">
                  <Activity size={10} /> Active
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
                <div className="bg-surface-800 rounded p-2">
                  <span className="text-gray-500 block">Name</span>
                  <span className="text-gray-200 font-medium">{currentWorld.name}</span>
                </div>
                <div className="bg-surface-800 rounded p-2">
                  <span className="text-gray-500 block">Size</span>
                  <span className="text-gray-200 font-medium">{currentWorld.size}</span>
                </div>
                <div className="bg-surface-800 rounded p-2">
                  <span className="text-gray-500 block">Chunks</span>
                  <span className="text-gray-200 font-medium">{currentWorld.totalChunks?.toLocaleString() || 0}</span>
                </div>
                <div className="bg-surface-800 rounded p-2">
                  <span className="text-gray-500 block">Players</span>
                  <span className="text-gray-200 font-medium">{currentWorld.onlinePlayers ?? 0} online</span>
                </div>
                <div className="bg-surface-800 rounded p-2">
                  <span className="text-gray-500 block">Seed</span>
                  <span className="text-gray-200 font-mono">{currentWorld.seed?.slice(0, 10) || 'N/A'}</span>
                </div>
                <div className="bg-surface-800 rounded p-2">
                  <span className="text-gray-500 block">Difficulty</span>
                  <span className={`font-medium ${difficultyColor(currentWorld.difficulty)}`}>
                    {currentWorld.difficulty?.charAt(0).toUpperCase() + currentWorld.difficulty?.slice(1) || 'Normal'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-10"
          placeholder="Search worlds..."
        />
      </div>

      {/* Create World Form */}
      {showCreate && (
        <div className="card p-5 animate-slide-in">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">World Name *</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="input" required placeholder="My World" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Seed (optional)</label>
                <input type="text" value={newSeed} onChange={(e) => setNewSeed(e.target.value)} className="input" placeholder="Random" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Gamemode</label>
                <select value={newGamemode} onChange={(e) => setNewGamemode(e.target.value)} className="select">
                  <option value="survival">Survival</option>
                  <option value="creative">Creative</option>
                  <option value="adventure">Adventure</option>
                  <option value="spectator">Spectator</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Difficulty</label>
                <select value={newDifficulty} onChange={(e) => setNewDifficulty(e.target.value)} className="select">
                  <option value="peaceful">Peaceful</option>
                  <option value="easy">Easy</option>
                  <option value="normal">Normal</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">World Type</label>
                <select value={newWorldType} onChange={(e) => setNewWorldType(e.target.value)} className="select">
                  <option value="default">Default</option>
                  <option value="flat">Superflat</option>
                  <option value="largebiomes">Large Biomes</option>
                  <option value="amplified">Amplified</option>
                  <option value="single_biome_surface">Single Biome</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">View Distance</label>
                <input type="number" min="2" max="32" value={newViewDistance} onChange={(e) => setNewViewDistance(parseInt(e.target.value) || 10)} className="input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Simulation Distance</label>
                <input type="number" min="2" max="32" value={newSimDistance} onChange={(e) => setNewSimDistance(parseInt(e.target.value) || 10)} className="input" />
              </div>
              <div className="flex items-center gap-4 pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newGenStructures} onChange={(e) => setNewGenStructures(e.target.checked)} className="checkbox" />
                  <span className="text-xs text-gray-300">Generate Structures</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newBonusChest} onChange={(e) => setNewBonusChest(e.target.checked)} className="checkbox" />
                  <span className="text-xs text-gray-300">Bonus Chest</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newHardcore} onChange={(e) => setNewHardcore(e.target.checked)} className="checkbox" />
                  <span className="text-xs text-gray-300">Hardcore</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Create World</Button>
            </div>
          </form>
        </div>
      )}

      {/* Import ZIP Form */}
      {showImportZip && (
        <div className="card p-5 animate-slide-in">
          <h3 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
            <FileArchive size={16} className="text-minecraft-400" /> Import World from ZIP
          </h3>
          <form onSubmit={handleImportZip} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">ZIP File</label>
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">World Name (optional, defaults to ZIP name)</label>
              <input type="text" value={importZipName} onChange={(e) => setImportZipName(e.target.value)} className="input" placeholder="Auto-detect from ZIP" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => { setShowImportZip(false); setImportFile(null); }}>Cancel</Button>
              <Button type="submit" variant="primary"><Upload size={14} /> Import</Button>
            </div>
          </form>
        </div>
      )}

      {/* Import Folder Form */}
      {showImportFolder && (
        <div className="card p-5 animate-slide-in">
          <h3 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
            <FolderOpen size={16} className="text-minecraft-400" /> Import World from Folder
          </h3>
          <form onSubmit={handleImportFolder} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Source Folder Path</label>
              <div className="flex gap-2">
                <input type="text" value={importFolderPath} onChange={(e) => setImportFolderPath(e.target.value)} className="input flex-1" placeholder="C:\Users\...\world" required />
                <Button type="button" variant="secondary" onClick={async () => { if (window.electronAPI) { const p = await window.electronAPI.selectDirectory(); if (p) setImportFolderPath(p); } }} className="px-3 py-2 text-xs shrink-0">
                  <FolderOpen size={14} /> Browse
                </Button>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Path to a Minecraft world folder containing level.dat and region/</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">World Name (optional)</label>
              <input type="text" value={importFolderName} onChange={(e) => setImportFolderName(e.target.value)} className="input" placeholder="Defaults to folder name" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowImportFolder(false)}>Cancel</Button>
              <Button type="submit" variant="primary"><Upload size={14} /> Import</Button>
            </div>
          </form>
        </div>
      )}

      {/* Worlds Grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWorlds.map((world) => (
            <div key={world.name} className="card-hover group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-minecraft-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-200">{world.name}</h3>
                    <p className="text-xs text-gray-500">{world.size}</p>
                  </div>
                </div>
                <div className="relative">
                  <Button variant="ghost" onClick={() => setSelectedWorld(selectedWorld?.name === world.name ? null : world)} className="p-1">
                    <MoreHorizontal size={14} />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-gray-400 mb-3">
                <div><span className="text-gray-500">Gamemode:</span> <span className="ml-1 capitalize">{world.gamemode}</span></div>
                <div><span className="text-gray-500">Difficulty:</span> <span className={`ml-1 capitalize ${difficultyColor(world.difficulty)}`}>{world.difficulty}</span></div>
                <div><span className="text-gray-500">Seed:</span> <span className="ml-1 font-mono">{world.seed?.slice(0, 8) || 'N/A'}</span></div>
                <div><span className="text-gray-500">Created:</span> <span className="ml-1">{world.created_at ? new Date(world.created_at).toLocaleDateString() : 'N/A'}</span></div>
                <div><span className="text-gray-500">Chunks:</span> <span className="ml-1">{world.chunk_count?.toLocaleString() || 0}</span></div>
                <div><span className="text-gray-500">Players:</span> <span className="ml-1">{world.playerCount ?? 0}</span></div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" onClick={() => openWorldDetail(world.name)} className="p-1.5 text-xs" title="Details">
                  <Map size={12} /> Details
                </Button>
                <Button variant="ghost" onClick={() => handleDownloadWorld(world.name)} className="p-1.5 text-xs" title="Download">
                  <Download size={12} /> Download
                </Button>
                <Button variant="ghost" onClick={() => handleClone(world.name)} className="p-1.5 text-xs" title="Clone">
                  <Copy size={12} /> Clone
                </Button>
                <Button variant="ghost" onClick={() => { setShowRename(world.name); setRenameValue(world.name); }} className="p-1.5 text-xs ml-auto" title="Rename">
                  <Edit3 size={12} /> Rename
                </Button>
                <Button variant="ghost" onClick={() => setShowDelete(world.name)} className="p-1.5 text-xs text-red-400" title="Delete">
                  <Trash2 size={12} /> Delete
                </Button>
              </div>
            </div>
          ))}

          {filteredWorlds.length === 0 && !loading && (
            <div className="col-span-full card p-8 text-center text-gray-500">
              <HardDrive size={40} className="mx-auto mb-3 opacity-30" />
              <p>No worlds yet</p>
              <p className="text-xs mt-1">Create a world, import one, or click Detect to scan for existing worlds</p>
            </div>
          )}
        </div>
      )}

      {/* Rename Modal */}
      {showRename && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-900 rounded-xl border border-surface-700 w-full max-w-md shadow-2xl p-6">
            <h3 className="text-lg font-bold text-gray-100 mb-4 flex items-center gap-2">
              <Edit3 size={18} className="text-minecraft-400" /> Rename World
            </h3>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-400 mb-1">New Name</label>
              <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="input w-full" autoFocus />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setShowRename(null)} className="text-sm">Cancel</Button>
              <Button variant="primary" onClick={() => handleRename(showRename)} className="text-sm">Rename</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-900 rounded-xl border border-surface-700 w-full max-w-md shadow-2xl p-6">
            <h3 className="text-lg font-bold text-red-400 mb-2 flex items-center gap-2">
              <AlertTriangle size={18} /> Delete World
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Are you sure you want to delete <strong className="text-gray-200">{showDelete}</strong>? This will permanently remove all world files and cannot be undone.
            </p>
            <p className="text-xs text-yellow-400 mb-4 flex items-center gap-1">
              <AlertTriangle size={12} /> Recommended: Create a backup before deleting.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setShowDelete(null)} className="text-sm">Cancel</Button>
              <Button variant="danger" onClick={() => handleDelete(showDelete)} className="text-sm">Delete Permanently</Button>
            </div>
          </div>
        </div>
      )}

      {/* Optimize Confirmation */}
      {showOptimize && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-900 rounded-xl border border-surface-700 w-full max-w-md shadow-2xl p-6">
            <h3 className="text-lg font-bold text-gray-100 mb-2 flex items-center gap-2">
              <Zap size={18} className="text-yellow-400" /> Optimize World
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Remove empty chunks from <strong className="text-gray-200">{showOptimize}</strong> to reduce file size. A backup will be recommended before proceeding.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setShowOptimize(null)} className="text-sm">Cancel</Button>
              <Button variant="primary" onClick={() => handleOptimize(showOptimize)} className="text-sm">
                <Zap size={14} /> Optimize
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Repair Confirmation */}
      {showRepair && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-900 rounded-xl border border-surface-700 w-full max-w-md shadow-2xl p-6">
            <h3 className="text-lg font-bold text-gray-100 mb-2 flex items-center gap-2">
              <Wrench size={18} className="text-yellow-400" /> Repair World
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Scan and repair <strong className="text-gray-200">{showRepair}</strong>. This will check for missing directories, corrupt region files, and regenerate level.dat if missing.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setShowRepair(null)} className="text-sm">Cancel</Button>
              <Button variant="primary" onClick={() => handleRepair(showRepair)} className="text-sm">
                <Wrench size={14} /> Repair
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* World Detail Modal */}
      {selectedWorld && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-900 rounded-xl border border-surface-700 w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-surface-700 flex items-center justify-between bg-surface-800/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-surface-800 flex items-center justify-center">
                  <Globe className="w-6 h-6 text-minecraft-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedWorld.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">{selectedWorld.size}</span>
                    <span className="text-xs text-gray-500">·</span>
                    <span className={`text-xs capitalize ${difficultyColor(selectedWorld.difficulty)}`}>{selectedWorld.difficulty}</span>
                    <span className="text-xs text-gray-500">·</span>
                    <span className="text-xs capitalize text-gray-300">{selectedWorld.gamemode}</span>
                    {selectedWorld.hardcore ? (
                      <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">Hardcore</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <Button variant="ghost" onClick={() => setSelectedWorld(null)} className="p-2">
                <X size={24} />
              </Button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
              {/* Quick stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-surface-800 p-3 rounded-lg border border-surface-700/50">
                  <div className="text-xs text-gray-500">Total Size</div>
                  <div className="text-lg font-bold text-gray-200">{selectedWorld.size}</div>
                </div>
                <div className="bg-surface-800 p-3 rounded-lg border border-surface-700/50">
                  <div className="text-xs text-gray-500">Regions</div>
                  <div className="text-lg font-bold text-gray-200">{selectedWorld.totalRegions?.toLocaleString() || 0}</div>
                </div>
                <div className="bg-surface-800 p-3 rounded-lg border border-surface-700/50">
                  <div className="text-xs text-gray-500">Chunks</div>
                  <div className="text-lg font-bold text-gray-200">{selectedWorld.totalChunks?.toLocaleString() || 0}</div>
                </div>
                <div className="bg-surface-800 p-3 rounded-lg border border-surface-700/50">
                  <div className="text-xs text-gray-500">Players</div>
                  <div className="text-lg font-bold text-minecraft-400">{selectedWorld.players?.length || 0}</div>
                </div>
              </div>

              {/* Size breakdown */}
              <div className="bg-surface-800 p-4 rounded-xl border border-surface-700">
                <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider flex items-center gap-2">
                  <HardDrive size={14} className="text-minecraft-400" /> Storage
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-surface-900 p-2.5 rounded-lg border border-surface-700/50">
                    <div className="text-xs text-gray-500">Region Files</div>
                    <div className="text-sm font-semibold text-gray-200">{selectedWorld.regionSize || '0 B'}</div>
                  </div>
                  <div className="bg-surface-900 p-2.5 rounded-lg border border-surface-700/50">
                    <div className="text-xs text-gray-500">Player Data</div>
                    <div className="text-sm font-semibold text-gray-200">{selectedWorld.playerdataSize || '0 B'}</div>
                  </div>
                  <div className="bg-surface-900 p-2.5 rounded-lg border border-surface-700/50">
                    <div className="text-xs text-gray-500">Statistics</div>
                    <div className="text-sm font-semibold text-gray-200">{selectedWorld.statsSize || '0 B'}</div>
                  </div>
                  <div className="bg-surface-900 p-2.5 rounded-lg border border-surface-700/50">
                    <div className="text-xs text-gray-500">Backups</div>
                    <div className="text-sm font-semibold text-gray-200">{selectedWorld.lastBackup ? new Date(selectedWorld.lastBackup).toLocaleDateString() : 'None'}</div>
                  </div>
                </div>
              </div>

              {/* Dimensions */}
              <div className="bg-surface-800 p-4 rounded-xl border border-surface-700">
                <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider flex items-center gap-2">
                  <Layers size={14} className="text-minecraft-400" /> Dimensions
                </h3>
                <div className="space-y-2">
                  {(selectedWorld.dimensions?.length ? selectedWorld.dimensions : [
                    { dimension_name: 'minecraft:overworld', display_name: 'Overworld', chunk_count: selectedWorld.totalChunks || 0, size: selectedWorld.size || '0 B' },
                  ]).map((dim: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-surface-900 p-3 rounded-lg border border-surface-700/50">
                      <div className="flex items-center gap-2">
                        <Map size={14} className="text-minecraft-400" />
                        <span className="text-sm text-gray-200">{dim.display_name || dim.dimension_name}</span>
                        <span className="text-xs text-gray-500 font-mono">{dim.dimension_name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-400">{dim.size || '0 B'}</span>
                        <span className="text-xs text-gray-400">{dim.chunk_count?.toLocaleString() || 0} chunks</span>
                        <span className="text-xs text-gray-500">{dim.player_count || 0} players</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-surface-800 p-4 rounded-xl border border-surface-700">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <Database size={14} className="text-minecraft-400" /> World Information
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-gray-500">Seed</span><span className="text-gray-200 font-mono">{selectedWorld.seed || 'N/A'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Version</span><span className="text-gray-200">{selectedWorld.version || selectedWorld.levelData?.version || 'Unknown'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">World Type</span><span className="text-gray-200 capitalize">{worldTypeLabel(selectedWorld.world_type)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Generate Structures</span><span className="text-gray-200">{selectedWorld.generate_structures ? 'Yes' : 'No'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Bonus Chest</span><span className="text-gray-200">{selectedWorld.bonus_chest ? 'Yes' : 'No'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Hardcore</span><span className="text-gray-200">{selectedWorld.hardcore ? 'Yes' : 'No'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">View Distance</span><span className="text-gray-200">{selectedWorld.view_distance}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Simulation Distance</span><span className="text-gray-200">{selectedWorld.simulation_distance}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Created</span><span className="text-gray-200">{selectedWorld.created_at ? new Date(selectedWorld.created_at).toLocaleString() : 'N/A'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Last Played</span><span className="text-gray-200">{selectedWorld.last_played ? new Date(selectedWorld.last_played).toLocaleString() : 'Never'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Optimization</span>
                      <span className={selectedWorld.optimization_status === 'completed' ? 'text-green-400' : 'text-gray-400'}>{selectedWorld.optimization_status || 'None'}</span>
                    </div>
                    <div className="flex justify-between"><span className="text-gray-500">Repair Status</span>
                      <span className={selectedWorld.repair_status === 'completed' ? 'text-green-400' : 'text-gray-400'}>{selectedWorld.repair_status || 'None'}</span>
                    </div>
                  </div>
                </div>

                {/* Players */}
                <div className="bg-surface-800 p-4 rounded-xl border border-surface-700">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <Users size={14} className="text-minecraft-400" /> Players in World
                  </h3>
                  {selectedWorld.players?.length ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                      {selectedWorld.players.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between bg-surface-900 p-2 rounded-lg border border-surface-700/50">
                          <span className="text-sm text-gray-200">{p.username}</span>
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${p.status === 'online' ? 'bg-green-400' : 'bg-gray-500'}`} />
                            <span className="text-xs text-gray-500">{p.dimension?.split(':').pop() || 'overworld'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-500 text-sm">No player data for this world</div>
                  )}
                </div>
              </div>

              {/* Recent Backups */}
              {selectedWorld.backups?.length ? (
                <div className="bg-surface-800 p-4 rounded-xl border border-surface-700">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <Save size={14} className="text-minecraft-400" /> Recent Backups
                  </h3>
                  <div className="space-y-1">
                    {selectedWorld.backups.map((b: any) => (
                      <div key={b.id} className="flex items-center justify-between bg-surface-900 p-2 rounded-lg border border-surface-700/50">
                        <div className="flex items-center gap-2">
                          <FileArchive size={14} className="text-blue-400" />
                          <span className="text-sm text-gray-200">{b.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{b.size}</span>
                          <span>{b.type}</span>
                          <span>{new Date(b.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Footer actions */}
            <div className="p-4 border-t border-surface-700 flex flex-wrap gap-2 bg-surface-800/50">
              <Button variant="secondary" onClick={() => { handleDownloadWorld(selectedWorld.name); }} className="text-xs py-1.5 px-3">
                <Download size={14} /> Export ZIP
              </Button>
              <Button variant="secondary" onClick={() => handleClone(selectedWorld.name)} className="text-xs py-1.5 px-3">
                <Copy size={14} /> Clone
              </Button>
              <Button variant="secondary" onClick={() => { setShowOptimize(selectedWorld.name); }} className="text-xs py-1.5 px-3">
                <Zap size={14} /> Optimize
              </Button>
              <Button variant="secondary" onClick={() => { setShowRepair(selectedWorld.name); }} className="text-xs py-1.5 px-3">
                <Wrench size={14} /> Repair
              </Button>
              <Button variant="secondary" onClick={() => { setShowRename(selectedWorld.name); setRenameValue(selectedWorld.name); }} className="text-xs py-1.5 px-3">
                <Edit3 size={14} /> Rename
              </Button>
              <Button variant="danger" onClick={() => setShowDelete(selectedWorld.name)} className="text-xs py-1.5 px-3 ml-auto">
                <Trash2 size={14} /> Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
