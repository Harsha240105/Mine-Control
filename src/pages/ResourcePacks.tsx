import React, { useEffect, useState, useRef } from 'react';
import { Package, Plus, Trash2, Power, PowerOff, Download, Upload, Loader2, Server } from 'lucide-react';
import { Button } from '../components/ui/stateful-button';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import { useActiveServer } from '../hooks/useActiveServer';
import { useSocket } from '../hooks/useSocket';

interface ResourcePackItem {
  name: string;
  fileName: string;
  version: string;
  enabled: boolean;
  description: string;
  author: string;
  source: string;
}

export default function ResourcePacks() {
  const { server: activeServer } = useActiveServer();
  const { socket } = useSocket();
  const [packs, setPacks] = useState<ResourcePackItem[]>([]);
  const [showInstall, setShowInstall] = useState(false);
  const [packName, setPackName] = useState('');
  const [packUrl, setPackUrl] = useState('');
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPacks();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('resourcepack:installed', () => fetchPacks());
    socket.on('resourcepack:removed', () => fetchPacks());
    socket.on('resourcepack:toggled', () => fetchPacks());
    return () => {
      socket.off('resourcepack:installed');
      socket.off('resourcepack:removed');
      socket.off('resourcepack:toggled');
    };
  }, [socket]);

  const fetchPacks = async () => {
    try {
      const data = await api.getResourcePacks();
      setPacks(data);
    } catch {}
  };

  const handleInstall = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = packName || 'Custom Pack';
    const url = packUrl || undefined;
    if (installing.has(name)) return;
    setInstalling(prev => new Set(prev).add(name));
    try {
      await api.installResourcePack(name, url);
      toast.success(`${name} installed! Enable it in Minecraft resource pack settings.`);
      if (e) { setPackName(''); setPackUrl(''); setShowInstall(false); }
      await fetchPacks();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setInstalling(prev => { const next = new Set(prev); next.delete(name); return next; });
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.replace(/\.zip$/i, '');
    if (installing.has(name)) return;
    setInstalling(prev => new Set(prev).add(name));
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name);
      await api.uploadResourcePack(formData);
      toast.success(`${name} uploaded! Enable it in Minecraft resource pack settings.`);
      await fetchPacks();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setInstalling(prev => { const next = new Set(prev); next.delete(name); return next; });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemove = async (name: string) => {
    try {
      await api.removeResourcePack(name);
      toast.success(`Removed ${name}`);
      fetchPacks();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggle = async (name: string) => {
    try {
      const result = await api.toggleResourcePack(name);
      toast.success(`${name} ${result.enabled ? 'enabled' : 'disabled'}`);
      fetchPacks();
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
          <p className="text-gray-600 text-xs">Select a server from the Server Library to manage resource packs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Resource Pack Manager</h2>
          <p className="text-sm text-gray-500 mt-0.5">{packs.length} pack{packs.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            accept=".zip"
            ref={fileInputRef}
            onChange={handleUpload}
            className="hidden"
          />
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            Upload
          </Button>
          <Button variant="primary" onClick={() => setShowInstall(!showInstall)}>
            <Plus size={16} />
            Install Pack
          </Button>
        </div>
      </div>

      {showInstall && (
        <div className="card p-5 animate-slide-in">
          <form onSubmit={handleInstall} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Pack Name</label>
                <input type="text" value={packName} onChange={(e) => setPackName(e.target.value)} className="input" required placeholder="e.g. Faithful" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Download URL</label>
                <input type="url" value={packUrl} onChange={(e) => setPackUrl(e.target.value)} className="input" placeholder="https://..." />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowInstall(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Install</Button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {packs.map((pack) => (
          <div key={pack.name} className={`card-hover ${!pack.enabled ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  pack.enabled ? 'bg-amber-600/20' : 'bg-surface-800'
                }`}>
                  <Package className={`w-5 h-5 ${pack.enabled ? 'text-amber-500' : 'text-gray-500'}`} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-200">{pack.name}</h3>
                  <p className="text-xs text-gray-500">v{pack.version}</p>
                </div>
              </div>
              <Button variant="ghost"
                onClick={() => handleToggle(pack.name)}
                className={`p-2 ${pack.enabled ? 'text-green-400' : 'text-gray-500'}`}
                title={pack.enabled ? 'Disable' : 'Enable'}
              >
                {pack.enabled ? <Power size={16} /> : <PowerOff size={16} />}
              </Button>
            </div>
            <p className="text-xs text-gray-400 line-clamp-2 mb-3">{pack.description || 'No description'}</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">by {pack.author || 'Unknown'}</span>
              <Button variant="ghost"
                onClick={() => handleRemove(pack.name)}
                className="p-1 text-gray-500 hover:text-red-400"
                title="Remove"
              >
                <Trash2 size={12} />
              </Button>
            </div>
          </div>
        ))}
        {packs.length === 0 && (
          <div className="col-span-full card p-8 text-center text-gray-500">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p>No resource packs installed</p>
            <p className="text-xs mt-1">Install or upload resource packs (.zip) to customize textures</p>
          </div>
        )}
      </div>
    </div>
  );
}
