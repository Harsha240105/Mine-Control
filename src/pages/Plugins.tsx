import React, { useEffect, useState } from 'react';
import { Puzzle, Plus, Trash2, Power, PowerOff, Download, ExternalLink, Search, Star, Shield, Wifi, Globe, BookOpen } from 'lucide-react';
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

const SAFE_PLUGIN_SOURCES = [
  {
    name: 'Hangar (PaperMC)', url: 'https://hangar.papermc.io', desc: 'Official PaperMC plugin repository',
    badge: 'Recommended', type: 'repository',
  },
  {
    name: 'Modrinth', url: 'https://modrinth.com/plugins', desc: 'Modern open-source mod & plugin platform',
    badge: 'Safe', type: 'repository',
  },
  {
    name: 'SpigotMC', url: 'https://www.spigotmc.org/resources/', desc: 'Largest Minecraft server plugin marketplace',
    badge: 'Popular', type: 'marketplace',
  },
  {
    name: 'BuiltByBit', url: 'https://builtbybit.com/resources/', desc: 'Premium plugin marketplace',
    badge: 'Premium', type: 'marketplace',
  },
];

const POPULAR_PLUGINS = [
  { name: 'LuckPerms', desc: 'Best permissions plugin', url: 'modrinth:luckperms', source: 'Modrinth', category: 'Admin Tools' },
  { name: 'EssentialsX', desc: 'Essential server commands & economy', url: 'modrinth:essentialsx', source: 'Modrinth', category: 'Admin Tools' },
  { name: 'WorldEdit', desc: 'Powerful in-game world editor', url: 'modrinth:worldedit', source: 'Modrinth', category: 'World Management' },
  { name: 'BlueMap', desc: '3D web map viewer', url: 'modrinth:bluemap', source: 'Modrinth', category: 'Map & Visualization' },
  { name: 'CoreProtect', desc: 'Block logging & rollback system', url: 'modrinth:coreprotect', source: 'Modrinth', category: 'Protection' },
  { name: 'Geyser', desc: 'Allow Bedrock players to join', url: 'modrinth:geyser', source: 'Modrinth', category: 'Cross-Platform' },
  { name: 'ViaVersion', desc: 'Cross-version protocol support', url: 'modrinth:viaversion', source: 'Modrinth', category: 'Compatibility' },
  { name: 'GriefPrevention', desc: 'Land claiming & grief protection', url: 'modrinth:griefprevention', source: 'Modrinth', category: 'Protection' },
  { name: 'Dynmap', desc: 'Classic web map viewer', url: 'modrinth:dynmap', source: 'Modrinth', category: 'Map & Visualization' },
  { name: 'Vault', desc: 'Economy & permissions API layer', url: 'modrinth:vault', source: 'Modrinth', category: 'API & Libraries' },
  { name: 'PlaceholderAPI', desc: 'Placeholder expansion system', url: 'modrinth:placeholderapi', source: 'Modrinth', category: 'API & Libraries' },
  { name: 'AuthMe', desc: 'Login & authentication system', url: 'modrinth:authmereloaded', source: 'Modrinth', category: 'Security' },
  { name: 'WorldGuard', desc: 'Region protection & management', url: 'modrinth:worldguard', source: 'Modrinth', category: 'Protection' },
  { name: 'Multiverse-Core', desc: 'Multi-world management', url: 'modrinth:multiverse', source: 'Modrinth', category: 'World Management' },
  { name: 'ProtocolLib', desc: 'Packet handling library', url: 'modrinth:protocollib', source: 'Modrinth', category: 'API & Libraries' },
];

const categories = [...new Set(POPULAR_PLUGINS.map(p => p.category))];

export default function Plugins() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [showInstall, setShowInstall] = useState(false);
  const [pluginName, setPluginName] = useState('');
  const [pluginUrl, setPluginUrl] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  
  // New State for Tabs
  const [activeTab, setActiveTab] = useState<'installed' | 'marketplace'>('installed');
  const [marketplaceSearch, setMarketplaceSearch] = useState('');
  const [modrinthResults, setModrinthResults] = useState<any[]>([]);
  const [loadingModrinth, setLoadingModrinth] = useState(false);

  useEffect(() => {
    fetchPlugins();
  }, []);

  const searchModrinth = async () => {
    if (!marketplaceSearch) return;
    setLoadingModrinth(true);
    try {
      const { data } = await api.get(`/marketplace/search?q=${encodeURIComponent(marketplaceSearch)}`);
      setModrinthResults(data.hits || []);
    } catch (err) {
      toast.error('Failed to search Modrinth');
    } finally {
      setLoadingModrinth(false);
    }
  };

  const fetchPlugins = async () => {
    try {
      const data = await api.getPlugins();
      setPlugins(data);
    } catch {}
  };

  const handleInstall = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = pluginName || 'Custom Plugin';
    const url = pluginUrl || undefined;
    try {
      await api.installPlugin(name, url);
      toast.success(`Installing ${name}...`);
      if (e) { setPluginName(''); setPluginUrl(''); setShowInstall(false); }
      setTimeout(fetchPlugins, 3000);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleQuickInstall = async (p: typeof POPULAR_PLUGINS[0]) => {
    try {
      await api.installPlugin(p.name, p.url);
      toast.success(`Installing ${p.name}...`);
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

  const filteredPopular = POPULAR_PLUGINS.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.desc.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCategory && p.category !== selectedCategory) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Plugin Manager</h2>
          <p className="text-sm text-gray-500 mt-0.5">{plugins.length} plugin{plugins.length !== 1 ? 's' : ''} installed</p>
        </div>
        <button onClick={() => setShowInstall(!showInstall)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Install Plugin
        </button>
      </div>

      {/* Safe Sources Info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {SAFE_PLUGIN_SOURCES.map(src => (
          <div key={src.name}
            className="flex items-center gap-2 p-3 rounded-lg bg-surface-800/50 border border-surface-700/50 cursor-default"
          >
            <Shield size={14} className="text-green-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-200 truncate">{src.name}</p>
              <p className="text-[10px] text-gray-500 truncate">{src.desc}</p>
            </div>
            <span className="text-[10px] text-gray-600 bg-surface-800 px-1.5 py-0.5 rounded shrink-0">{src.badge}</span>
          </div>
        ))}
      </div>

      <div className="flex border-b border-gray-700 mb-6">
        <button
          className={`py-2 px-4 border-b-2 font-medium text-sm ${activeTab === 'installed' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
          onClick={() => setActiveTab('installed')}
        >
          Installed Plugins
        </button>
        <button
          className={`py-2 px-4 border-b-2 font-medium text-sm ${activeTab === 'marketplace' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
          onClick={() => setActiveTab('marketplace')}
        >
          Modrinth Marketplace
        </button>
      </div>

      {activeTab === 'installed' && (
        <>

      {/* Install Form */}
      {showInstall && (
        <div className="card p-5 animate-slide-in">
          <form onSubmit={handleInstall} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Plugin Name</label>
                <input type="text" value={pluginName} onChange={(e) => setPluginName(e.target.value)} className="input" required placeholder="e.g. MyPlugin" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Download URL</label>
                <input type="url" value={pluginUrl} onChange={(e) => setPluginUrl(e.target.value)} className="input" placeholder="https://hangar.papermc.io/..." />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowInstall(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Install</button>
            </div>
          </form>
        </div>
      )}

      {/* Popular Plugins */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Star size={14} className="text-yellow-400" />
          <h3 className="text-sm font-medium text-gray-200">Popular Plugins (Safe Sources)</h3>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setSelectedCategory('')}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${!selectedCategory ? 'bg-minecraft-600/20 text-minecraft-400 border border-minecraft-500/20' : 'bg-surface-800 text-gray-400 border border-surface-700 hover:border-surface-600'}`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${cat === selectedCategory ? 'bg-minecraft-600/20 text-minecraft-400 border border-minecraft-500/20' : 'bg-surface-800 text-gray-400 border border-surface-700 hover:border-surface-600'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plugins..."
            className="input pl-9 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
          {filteredPopular.map(p => (
            <button
              key={p.name}
              onClick={() => handleQuickInstall(p)}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-800/30 border border-surface-700/30 hover:border-surface-600 hover:bg-surface-800/50 transition-all text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-minecraft-600/20 flex items-center justify-center shrink-0">
                <Download size={14} className="text-minecraft-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-200 truncate">{p.name}</p>
                <p className="text-[10px] text-gray-500 truncate">{p.desc}</p>
              </div>
              <span className="text-[10px] text-gray-600 bg-surface-800 px-1.5 py-0.5 rounded">{p.source}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Plugins downloaded from Modrinth. Always verify plugin sources for safety.
        </p>
      </div>

      {/* Installed Plugins */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plugins.map((plugin) => (
          <div key={plugin.name} className={`card-hover ${!plugin.enabled ? 'opacity-60' : ''}`}>
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
            <p className="text-xs text-gray-400 line-clamp-2 mb-3">{plugin.description || 'No description'}</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">by {plugin.author || 'Unknown'}</span>
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
        </>
      )}

      {activeTab === 'marketplace' && (
        <div className="card">
          <h3 className="text-lg font-medium text-gray-200 mb-4">Modrinth Plugins</h3>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={marketplaceSearch}
              onChange={(e) => setMarketplaceSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchModrinth()}
              placeholder="Search Modrinth..."
              className="input flex-1"
            />
            <button onClick={searchModrinth} className="btn-primary flex items-center gap-2">
              <Search size={16} /> Search
            </button>
          </div>

          {loadingModrinth ? (
            <div className="text-center text-gray-400 py-8">Searching...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {modrinthResults.map((mod) => (
                <div key={mod.project_id} className="card-hover p-4 border border-gray-700/50">
                  <div className="flex items-center gap-3 mb-2">
                    {mod.icon_url ? (
                      <img src={mod.icon_url} alt={mod.title} className="w-10 h-10 rounded" />
                    ) : (
                      <Puzzle className="w-10 h-10 text-gray-500" />
                    )}
                    <div>
                      <h4 className="text-sm font-medium text-gray-200 line-clamp-1">{mod.title}</h4>
                      <p className="text-xs text-gray-500 line-clamp-1">{mod.author}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2 mb-3 h-8">{mod.description}</p>
                  <button
                    onClick={async () => {
                      try {
                        await api.installPlugin(mod.title, `modrinth:${mod.slug || mod.project_id}`);
                        toast.success(`Installing ${mod.title}...`);
                      } catch (err: any) {
                        toast.error(err.message);
                      }
                    }}
                    className="w-full btn-secondary py-1 text-xs"
                  >
                    Download & Install
                  </button>
                </div>
              ))}
              {modrinthResults.length === 0 && marketplaceSearch && (
                <div className="col-span-full text-center text-gray-500 py-8">No results found</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}