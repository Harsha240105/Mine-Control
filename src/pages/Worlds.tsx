import React, { useEffect, useState } from 'react';
import { Globe, Plus, Trash2, Download, Copy, Upload, HardDrive } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

interface World {
  name: string;
  size: string;
  seed: string;
  gamemode: string;
  difficulty: string;
  last_backup: string | null;
  created_at: string;
}

export default function Worlds() {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSeed, setNewSeed] = useState('');
  const [newGamemode, setNewGamemode] = useState('survival');
  const [newDifficulty, setNewDifficulty] = useState('normal');
  const [cloneName, setCloneName] = useState('');

  useEffect(() => {
    fetchWorlds();
  }, []);

  const fetchWorlds = async () => {
    try {
      const data = await api.getWorlds();
      setWorlds(data);
    } catch {}
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createWorld({ name: newName, seed: newSeed, gamemode: newGamemode, difficulty: newDifficulty });
      toast.success(`World '${newName}' created`);
      setNewName(''); setNewSeed(''); setShowCreate(false);
      fetchWorlds();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await api.deleteWorld(name);
      toast.success(`World '${name}' deleted`);
      fetchWorlds();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleClone = async (name: string) => {
    const newName = `${name}-copy`;
    try {
      await api.cloneWorld(name, newName);
      toast.success(`World cloned as '${newName}'`);
      fetchWorlds();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDownloadWorld = async (name: string) => {
    try {
      const token = localStorage.getItem('mc_token');
      const resp = await fetch(`/api/worlds/${encodeURIComponent(name)}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) { toast.error('Download failed'); return; }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || 'Download failed');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">World Manager</h2>
          <p className="text-sm text-gray-500 mt-0.5">{worlds.length} worlds</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Create World
        </button>
      </div>

      {showCreate && (
        <div className="card p-5 animate-slide-in">
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">World Name</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="input" required />
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
            <div className="md:col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Create World</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {worlds.map((world) => (
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
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-gray-400 mb-3">
              <div>
                <span className="text-gray-500">Gamemode:</span>
                <span className="ml-1 capitalize">{world.gamemode}</span>
              </div>
              <div>
                <span className="text-gray-500">Difficulty:</span>
                <span className="ml-1 capitalize">{world.difficulty}</span>
              </div>
              <div>
                <span className="text-gray-500">Seed:</span>
                <span className="ml-1 font-mono">{world.seed?.slice(0, 8) || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Created:</span>
                <span className="ml-1">{world.created_at ? new Date(world.created_at).toLocaleDateString() : 'N/A'}</span>
              </div>
            </div>

            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleDownloadWorld(world.name)}
                className="btn-ghost p-1.5 text-xs flex items-center gap-1"
                title="Download"
              >
                <Download size={12} /> Download
              </button>
              <button onClick={() => handleClone(world.name)} className="btn-ghost p-1.5 text-xs flex items-center gap-1" title="Clone">
                <Copy size={12} /> Clone
              </button>
              <button onClick={() => handleDelete(world.name)} className="btn-ghost p-1.5 text-xs flex items-center gap-1 text-red-400 hover:text-red-300 ml-auto" title="Delete">
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        ))}

        {worlds.length === 0 && (
          <div className="col-span-full card p-8 text-center text-gray-500">
            <HardDrive size={40} className="mx-auto mb-3 opacity-30" />
            <p>No worlds yet</p>
            <p className="text-xs mt-1">Create a world or start the server to auto-generate one</p>
          </div>
        )}
      </div>
    </div>
  );
}
