import React, { useEffect, useState, useRef } from 'react';
import { Palette, Plus, Trash2, Power, PowerOff, Download, Upload, Loader2, Server } from 'lucide-react';
import { Button } from '../components/ui/stateful-button';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import { useActiveServer } from '../hooks/useActiveServer';
import { useSocket } from '../hooks/useSocket';

interface ShaderItem {
  name: string;
  fileName: string;
  version: string;
  enabled: boolean;
  description: string;
  author: string;
  source: string;
}

const SHADER_SOURCES = [
  { name: 'ComplementaryShaders', url: 'https://shaderlabs.org/complementary/', desc: 'Popular vibrant shader pack' },
  { name: 'BSL Shaders', url: 'https://bitslablab.com/bslshaders/', desc: 'Highly customizable shaders' },
  { name: 'Sildur\'s Shaders', url: 'https://sildurs-shaders.github.io/', desc: 'Performance-friendly shaders' },
  { name: 'SEUS', url: 'https://sonicether.com/seus/', desc: 'Cinematic shading & lighting' },
];

export default function Shaders() {
  const { server: activeServer } = useActiveServer();
  const { socket } = useSocket();
  const [shaders, setShaders] = useState<ShaderItem[]>([]);
  const [showInstall, setShowInstall] = useState(false);
  const [shaderName, setShaderName] = useState('');
  const [shaderUrl, setShaderUrl] = useState('');
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchShaders();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('shader:installed', () => fetchShaders());
    socket.on('shader:removed', () => fetchShaders());
    socket.on('shader:toggled', () => fetchShaders());
    return () => {
      socket.off('shader:installed');
      socket.off('shader:removed');
      socket.off('shader:toggled');
    };
  }, [socket]);

  const fetchShaders = async () => {
    try {
      const data = await api.getShaders();
      setShaders(data);
    } catch {}
  };

  const handleInstall = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = shaderName || 'Custom Shader';
    const url = shaderUrl || undefined;
    if (installing.has(name)) return;
    setInstalling(prev => new Set(prev).add(name));
    try {
      await api.installShader(name, url);
      toast.success(`${name} installed! Enable it in Minecraft video settings.`);
      if (e) { setShaderName(''); setShaderUrl(''); setShowInstall(false); }
      await fetchShaders();
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
      const result = await api.installShader(name);
      toast.success(`${name} uploaded! Enable it in Minecraft video settings.`);
      await fetchShaders();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setInstalling(prev => { const next = new Set(prev); next.delete(name); return next; });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemove = async (name: string) => {
    try {
      await api.removeShader(name);
      toast.success(`Removed ${name}`);
      fetchShaders();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggle = async (name: string) => {
    try {
      const result = await api.toggleShader(name);
      toast.success(`${name} ${result.enabled ? 'enabled' : 'disabled'}`);
      fetchShaders();
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
          <p className="text-gray-600 text-xs">Select a server from the Server Library to manage shaders.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Shader Manager</h2>
          <p className="text-sm text-gray-500 mt-0.5">{shaders.length} shader pack{shaders.length !== 1 ? 's' : ''}</p>
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
            Install Shader
          </Button>
        </div>
      </div>

      {showInstall && (
        <div className="card p-5 animate-slide-in">
          <form onSubmit={handleInstall} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Shader Name</label>
                <input type="text" value={shaderName} onChange={(e) => setShaderName(e.target.value)} className="input" required placeholder="e.g. BSL Shaders" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Download URL</label>
                <input type="url" value={shaderUrl} onChange={(e) => setShaderUrl(e.target.value)} className="input" placeholder="https://..." />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowInstall(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Install</Button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Palette size={14} className="text-purple-400" />
          <h3 className="text-sm font-medium text-gray-200">Recommended Shaders</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {SHADER_SOURCES.map(s => (
            <div key={s.name} className="p-3 rounded-lg bg-surface-800/30 border border-surface-700/30">
              <p className="text-xs font-medium text-gray-200 truncate">{s.name}</p>
              <p className="text-[10px] text-gray-500 truncate">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {shaders.map((shader) => (
          <div key={shader.name} className={`card-hover ${!shader.enabled ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  shader.enabled ? 'bg-purple-600/20' : 'bg-surface-800'
                }`}>
                  <Palette className={`w-5 h-5 ${shader.enabled ? 'text-purple-500' : 'text-gray-500'}`} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-200">{shader.name}</h3>
                  <p className="text-xs text-gray-500">v{shader.version}</p>
                </div>
              </div>
              <Button variant="ghost"
                onClick={() => handleToggle(shader.name)}
                className={`p-2 ${shader.enabled ? 'text-green-400' : 'text-gray-500'}`}
                title={shader.enabled ? 'Disable' : 'Enable'}
              >
                {shader.enabled ? <Power size={16} /> : <PowerOff size={16} />}
              </Button>
            </div>
            <p className="text-xs text-gray-400 line-clamp-2 mb-3">{shader.description || 'No description'}</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">by {shader.author || 'Unknown'}</span>
              <Button variant="ghost"
                onClick={() => handleRemove(shader.name)}
                className="p-1 text-gray-500 hover:text-red-400"
                title="Remove"
              >
                <Trash2 size={12} />
              </Button>
            </div>
          </div>
        ))}
        {shaders.length === 0 && (
          <div className="col-span-full card p-8 text-center text-gray-500">
            <Palette size={40} className="mx-auto mb-3 opacity-30" />
            <p>No shader packs installed</p>
            <p className="text-xs mt-1">Install or upload shader packs (.zip) to enhance visuals</p>
          </div>
        )}
      </div>
    </div>
  );
}
