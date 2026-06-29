import React, { useEffect, useState } from 'react';
import { Puzzle, Plus, Trash2, Power, PowerOff, Download, Search, Loader2, Server, Globe } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import { useActiveServer } from '../hooks/useActiveServer';
import { useSocket } from '../hooks/useSocket';

interface ModItem {
  name: string;
  jarFile: string;
  version: string;
  enabled: boolean;
  description: string;
  author: string;
  source: string;
  side: string;
}

const MOD_SOURCES = [
  { name: 'Modrinth', url: 'https://modrinth.com/mods', desc: 'Modern open-source mod platform', badge: 'Popular' },
  { name: 'CurseForge', url: 'https://www.curseforge.com/minecraft/mc-mods', desc: 'Largest modding community', badge: 'Popular' },
];

export default function Mods() {
  const { server: activeServer } = useActiveServer();
  const { socket } = useSocket();
  const [mods, setMods] = useState<ModItem[]>([]);
  const [showInstall, setShowInstall] = useState(false);
  const [modName, setModName] = useState('');
  const [modUrl, setModUrl] = useState('');
  const [installing, setInstalling] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchMods();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('mod:installed', () => fetchMods());
    socket.on('mod:removed', () => fetchMods());
    socket.on('mod:toggled', () => fetchMods());
    return () => {
      socket.off('mod:installed');
      socket.off('mod:removed');
      socket.off('mod:toggled');
    };
  }, [socket]);

  const fetchMods = async () => {
    try {
      const data = await api.getMods();
      setMods(data);
    } catch {}
  };

  const handleInstall = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = modName || 'Custom Mod';
    const url = modUrl || undefined;
    if (installing.has(name)) return;
    setInstalling(prev => new Set(prev).add(name));
    try {
      await api.installMod(name, url);
      toast.success(`${name} installed! Restart the server for it to take effect.`);
      if (e) { setModName(''); setModUrl(''); setShowInstall(false); }
      await fetchMods();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setInstalling(prev => { const next = new Set(prev); next.delete(name); return next; });
    }
  };

  const handleRemove = async (name: string) => {
    try {
      await api.removeMod(name);
      toast.success(`Removed ${name}`);
      fetchMods();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggle = async (name: string) => {
    try {
      const result = await api.toggleMod(name);
      toast.success(`${name} ${result.enabled ? 'enabled' : 'disabled'}`);
      fetchMods();
    } catch (err: any) {
      toast.error(err.message);
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
          <p className="text-gray-600 text-xs">Select a server from the Server Library to manage mods.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Mod Manager</h2>
          <p className="text-sm text-gray-500 mt-0.5">{mods.length} mod{mods.length !== 1 ? 's' : ''} installed</p>
        </div>
        <button onClick={() => setShowInstall(!showInstall)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Install Mod
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {MOD_SOURCES.map(src => (
          <div key={src.name}
            className="flex items-center gap-2 p-3 rounded-lg bg-surface-800/50 border border-surface-700/50 cursor-default"
          >
            <Globe size={14} className="text-blue-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-200 truncate">{src.name}</p>
              <p className="text-[10px] text-gray-500 truncate">{src.desc}</p>
            </div>
            <span className="text-[10px] text-gray-600 bg-surface-800 px-1.5 py-0.5 rounded shrink-0">{src.badge}</span>
          </div>
        ))}
      </div>

      {showInstall && (
        <div className="card p-5 animate-slide-in">
          <form onSubmit={handleInstall} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Mod Name</label>
                <input type="text" value={modName} onChange={(e) => setModName(e.target.value)} className="input" required placeholder="e.g. JEI" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Download URL</label>
                <input type="url" value={modUrl} onChange={(e) => setModUrl(e.target.value)} className="input" placeholder="https://modrinth.com/mod/..." />
              </div>
            </div>
            <div className="text-xs text-gray-500">Supports Modrinth (modrinth:slug) and CurseForge (curseforge:projectId) URLs</div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowInstall(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Install</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mods.map((mod) => (
          <div key={mod.name} className={`card-hover ${!mod.enabled ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  mod.enabled ? 'bg-purple-600/20' : 'bg-surface-800'
                }`}>
                  <Puzzle className={`w-5 h-5 ${mod.enabled ? 'text-purple-500' : 'text-gray-500'}`} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-200">{mod.name}</h3>
                  <p className="text-xs text-gray-500">v{mod.version}</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle(mod.name)}
                className={`p-2 rounded-lg transition-colors ${
                  mod.enabled ? 'text-green-400 hover:bg-green-500/10' : 'text-gray-500 hover:bg-surface-700'
                }`}
                title={mod.enabled ? 'Disable' : 'Enable'}
              >
                {mod.enabled ? <Power size={16} /> : <PowerOff size={16} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 line-clamp-2 mb-3">{mod.description || 'No description'}</p>
            <div className="flex items-center justify-between text-xs">
              <div className="flex gap-2">
                <span className="text-gray-500">by {mod.author || 'Unknown'}</span>
                {mod.side && mod.side !== 'both' && (
                  <span className="text-gray-600 bg-surface-800 px-1.5 py-0.5 rounded">{mod.side}</span>
                )}
              </div>
              <button
                onClick={() => handleRemove(mod.name)}
                className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                title="Remove"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {mods.length === 0 && (
          <div className="col-span-full card p-8 text-center text-gray-500">
            <Puzzle size={40} className="mx-auto mb-3 opacity-30" />
            <p>No mods installed</p>
            <p className="text-xs mt-1">Install mods to add content and features</p>
          </div>
        )}
      </div>
    </div>
  );
}
