import React, { useEffect, useState } from 'react';
import { Puzzle, Plus, Trash2, Power, PowerOff, Download, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

interface Plugin {
  name: string;
  jarFile: string;
  version: string;
  enabled: boolean;
  description: string;
  author: string;
  main: string;
}

const POPULAR_PLUGINS = [
  { name: 'LuckPerms', url: 'https://download.luckperms.net/latest/bukkit/loader/LuckPerms-Bukkit.jar' },
  { name: 'EssentialsX', url: 'https://ci.ender.zone/job/EssentialsX/lastSuccessfulBuild/artifact/jars/EssentialsX-2.20.1.jar' },
  { name: 'WorldEdit', url: 'https://dev.bukkit.org/projects/worldedit/files/latest' },
  { name: 'Vault', url: 'https://github.com/MilkBowl/Vault/releases/download/1.7.3/Vault.jar' },
  { name: 'ClearLag', url: 'https://github.com/galaxydevelopment/clearlag/releases/latest' },
  { name: 'CoreProtect', url: 'https://www.coreprotect.de/downloads/' },
];

export default function Plugins() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [showInstall, setShowInstall] = useState(false);
  const [pluginName, setPluginName] = useState('');
  const [pluginUrl, setPluginUrl] = useState('');

  useEffect(() => {
    fetchPlugins();
  }, []);

  const fetchPlugins = async () => {
    try {
      const data = await api.getPlugins();
      setPlugins(data);
    } catch {}
  };

  const handleInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.installPlugin(pluginName, pluginUrl || undefined);
      toast.success(`Installing ${pluginName}...`);
      setPluginName(''); setPluginUrl(''); setShowInstall(false);
      setTimeout(fetchPlugins, 3000);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRemove = async (name: string) => {
    try {
      await api.removePlugin(name);
      toast.success(`Removed ${name}`);
      fetchPlugins();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggle = async (name: string) => {
    try {
      const result = await api.togglePlugin(name);
      toast.success(`${name} ${result.enabled ? 'enabled' : 'disabled'}`);
      fetchPlugins();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Plugin Manager</h2>
          <p className="text-sm text-gray-500 mt-0.5">{plugins.length} plugins</p>
        </div>
        <button onClick={() => setShowInstall(!showInstall)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Install Plugin
        </button>
      </div>

      {showInstall && (
        <div className="card p-5 animate-slide-in">
          <form onSubmit={handleInstall} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Plugin Name</label>
                <input type="text" value={pluginName} onChange={(e) => setPluginName(e.target.value)} className="input" required placeholder="e.g. MyPlugin" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Download URL (optional)</label>
                <input type="url" value={pluginUrl} onChange={(e) => setPluginUrl(e.target.value)} className="input" placeholder="https://example.com/plugin.jar" />
              </div>
            </div>

            {/* Quick Install */}
            <div>
              <p className="text-xs font-medium text-gray-400 mb-2">Quick Install Popular Plugins:</p>
              <div className="flex flex-wrap gap-2">
                {POPULAR_PLUGINS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => { setPluginName(p.name); setPluginUrl(p.url); }}
                    className="text-xs px-3 py-1.5 bg-surface-800 hover:bg-surface-700 border border-surface-700 rounded-lg text-gray-300 transition-colors"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowInstall(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Install</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plugins.map((plugin) => (
          <div
            key={plugin.name}
            className={`card-hover ${!plugin.enabled ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  plugin.enabled ? 'bg-minecraft-600/20' : 'bg-surface-800'
                }`}>
                  <Puzzle className={`w-5 h-5 ${plugin.enabled ? 'text-minecraft-500' : 'text-gray-500'}`} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-200">{plugin.name}</h3>
                  <p className="text-xs text-gray-500">v{plugin.version}</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle(plugin.name)}
                className={`p-2 rounded-lg transition-colors ${
                  plugin.enabled
                    ? 'text-green-400 hover:bg-green-500/10'
                    : 'text-gray-500 hover:bg-surface-700'
                }`}
                title={plugin.enabled ? 'Disable' : 'Enable'}
              >
                {plugin.enabled ? <Power size={16} /> : <PowerOff size={16} />}
              </button>
            </div>

            <p className="text-xs text-gray-400 line-clamp-2 mb-3">{plugin.description}</p>

            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">by {plugin.author}</span>
              <button
                onClick={() => handleRemove(plugin.name)}
                className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                title="Remove"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}

        {plugins.length === 0 && (
          <div className="col-span-full card p-8 text-center text-gray-500">
            <Puzzle size={40} className="mx-auto mb-3 opacity-30" />
            <p>No plugins installed</p>
            <p className="text-xs mt-1">Install plugins to extend server functionality</p>
          </div>
        )}
      </div>
    </div>
  );
}
