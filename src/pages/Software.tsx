import { useEffect, useState, useMemo } from 'react';
import { Cpu, Download, CheckCircle2, ChevronRight, Server, Globe, ShieldCheck, Wifi, Search, ArrowUpDown, Filter } from 'lucide-react';
import { Button } from '../components/ui/stateful-button';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

interface VersionEntry {
  version: string;
  type: string;
  source: string;
  downloaded: boolean;
  current: boolean;
  stable?: boolean;
  releaseTime?: string;
}

interface SoftwareVersions {
  [source: string]: VersionEntry[];
}

interface VersionsData {
  currentVersion: string;
  currentSource: string;
  downloadedJars: string[];
  availableVersions: VersionEntry[];
  software?: SoftwareVersions;
  errors?: Record<string, string>;
}

const SOFTWARE_TYPES = [
  { id: 'PaperMC', name: 'Paper', description: 'High performance fork of Spigot. Recommended for most servers.', icon: <Cpu className="w-8 h-8 text-emerald-400" />, color: 'bg-emerald-500/10 border-emerald-500/30', hover: 'hover:border-emerald-500/60', popular: true },
  { id: 'Purpur', name: 'Purpur', description: 'Drop-in replacement for Paper with more configuration options.', icon: <Cpu className="w-8 h-8 text-purple-400" />, color: 'bg-purple-500/10 border-purple-500/30', hover: 'hover:border-purple-500/60', popular: false },
  { id: 'NeoForge', name: 'NeoForge', description: 'A modern fork of Forge with improved performance and features.', icon: <ShieldCheck className="w-8 h-8 text-green-400" />, color: 'bg-green-500/10 border-green-500/30', hover: 'hover:border-green-500/60', popular: false },
  { id: 'Quilt', name: 'Quilt', description: 'A modern modding platform focused on stability and ease of use.', icon: <Server className="w-8 h-8 text-indigo-400" />, color: 'bg-indigo-500/10 border-indigo-500/30', hover: 'hover:border-indigo-500/60', popular: false },
  { id: 'Bedrock', name: 'Bedrock', description: 'The official Bedrock Edition server allowing cross-platform play.', icon: <Globe className="w-8 h-8 text-blue-400" />, color: 'bg-blue-500/10 border-blue-500/30', hover: 'hover:border-blue-500/60', popular: false, disabled: true },
  { id: 'Pocketmine', name: 'Pocketmine-MP', description: 'Custom server software for Minecraft: Bedrock Edition.', icon: <Server className="w-8 h-8 text-pink-400" />, color: 'bg-pink-500/10 border-pink-500/30', hover: 'hover:border-pink-500/60', popular: false, disabled: true },
  { id: 'Mojang', name: 'Vanilla', description: 'The original Minecraft server software provided by Mojang.', icon: <Globe className="w-8 h-8 text-gray-400" />, color: 'bg-surface-800 border-surface-700', hover: 'hover:border-gray-500/60', popular: false },
  { id: 'Fabric', name: 'Fabric', description: 'Lightweight, experimental modding toolchain.', icon: <Server className="w-8 h-8 text-orange-400" />, color: 'bg-orange-500/10 border-orange-500/30', hover: 'hover:border-orange-500/60', popular: false },
  { id: 'Forge', name: 'Forge', description: 'Extensive modding API for complex modpacks.', icon: <ShieldCheck className="w-8 h-8 text-red-400" />, color: 'bg-red-500/10 border-red-500/30', hover: 'hover:border-red-500/60', popular: false },
  { id: 'Spigot', name: 'Spigot', description: 'The most widely used server software with Bukkit plugin support.', icon: <Cpu className="w-8 h-8 text-yellow-400" />, color: 'bg-yellow-500/10 border-yellow-500/30', hover: 'hover:border-yellow-500/60', popular: false },
  { id: 'Folia', name: 'Folia', description: 'Paper fork with multi-threaded region-based ticking for large servers.', icon: <Cpu className="w-8 h-8 text-cyan-400" />, color: 'bg-cyan-500/10 border-cyan-500/30', hover: 'hover:border-cyan-500/60', popular: false },
  { id: 'Pufferfish', name: 'Pufferfish', description: 'Paper fork optimized for performance with low latency.', icon: <Cpu className="w-8 h-8 text-pink-300" />, color: 'bg-pink-500/10 border-pink-500/30', hover: 'hover:border-pink-500/60', popular: false },
  { id: 'Velocity', name: 'Velocity', description: 'High-performance Minecraft proxy for server networks.', icon: <Wifi className="w-8 h-8 text-sky-400" />, color: 'bg-sky-500/10 border-sky-500/30', hover: 'hover:border-sky-500/60', popular: false, disabled: true },
  { id: 'Waterfall', name: 'Waterfall', description: 'Fork of BungeeCord with improved performance and features.', icon: <Wifi className="w-8 h-8 text-blue-400" />, color: 'bg-blue-500/10 border-blue-500/30', hover: 'hover:border-blue-500/60', popular: false, disabled: true },
  { id: 'BungeeCord', name: 'BungeeCord', description: 'The original proxy software for linking multiple Minecraft servers.', icon: <Wifi className="w-8 h-8 text-indigo-400" />, color: 'bg-indigo-500/10 border-indigo-500/30', hover: 'hover:border-indigo-500/60', popular: false, disabled: true },
];

type SortMode = 'newest' | 'oldest' | 'mcversion-desc' | 'mcversion-asc';
type FilterMode = 'all' | 'release' | 'snapshot' | 'stable' | 'recommended';

export default function Software() {
  const [data, setData] = useState<VersionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [selectedSoftware, setSelectedSoftware] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  useEffect(() => {
    fetchVersions();
  }, []);

  const fetchVersions = async () => {
    try {
      setLoading(true);
      const versions = await api.getAvailableVersions();
      setData(versions);
    } catch (err: any) {
      toast.error('Failed to load software versions: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (version: string, source?: string) => {
    setInstalling(true);
    const softSource = source || selectedSoftware || '';
    const promise = api.setServerVersion(version, softSource);
    toast.promise(promise, {
      loading: `Downloading ${softSource} ${version}...`,
      success: `Successfully installed ${softSource} ${version}`,
      error: (err) => `Failed: ${err.message}`
    });

    try {
      await promise;
      await fetchVersions();
      setSelectedSoftware(null);
    } catch {} finally {
      setInstalling(false);
    }
  };

  // Get versions for selected software
  const softwareVersions = useMemo(() => {
    if (!data || !selectedSoftware) return [];
    const source = data.software?.[selectedSoftware];
    if (source && source.length > 0) return source;

    return (data.availableVersions || []).filter(v => {
      if (selectedSoftware === 'Mojang' && v.source === 'Mojang') return true;
      return v.source === selectedSoftware;
    });
  }, [data, selectedSoftware]);

  // Apply search, filter, sort
  const filteredVersions = useMemo(() => {
    let list = [...softwareVersions];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(v => v.version.toLowerCase().includes(q));
    }

    if (filterMode === 'release') {
      list = list.filter(v => v.type?.toLowerCase() === 'release' || v.stable === true);
    } else if (filterMode === 'snapshot') {
      list = list.filter(v => v.type?.toLowerCase() === 'snapshot' || v.stable === false);
    } else if (filterMode === 'stable') {
      list = list.filter(v => v.stable === true || v.type?.toLowerCase() === 'release');
    }

    list.sort((a, b) => {
      if (sortMode === 'oldest') {
        return a.version.localeCompare(b.version, undefined, { numeric: true });
      }
      if (sortMode === 'mcversion-asc') {
        return a.version.localeCompare(b.version, undefined, { numeric: true });
      }
      if (sortMode === 'mcversion-desc') {
        return b.version.localeCompare(a.version, undefined, { numeric: true });
      }
      return b.version.localeCompare(a.version, undefined, { numeric: true });
    });

    return list;
  }, [softwareVersions, search, sortMode, filterMode]);

  const currentVersionsForSoftware = useMemo(() => {
    if (!data || !selectedSoftware) return { current: null, latest: null };
    const list = softwareVersions;
    const current = list.find(v => v.current) || null;
    const latest = list.length > 0 ? list[0] : null;
    return { current, latest };
  }, [data, selectedSoftware, softwareVersions]);

  const software = SOFTWARE_TYPES.find(s => s.id === selectedSoftware);

  if (loading || !data) {
    return <div className="p-8 text-center text-gray-400 animate-pulse">Loading software catalog...</div>;
  }

  // Software Category Grid
  if (!selectedSoftware) {
    return (
      <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Software</h2>
          <p className="text-gray-400 mt-1">Choose the server software that runs your Minecraft world.</p>
        </div>

        {data.errors && Object.keys(data.errors).length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-300">
            Some providers are unavailable. Cached versions may be shown.
            {Object.entries(data.errors).slice(0, 3).map(([k, v]) => (
              <div key={k} className="text-xs text-yellow-400/70 mt-1">{k}: {v}</div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SOFTWARE_TYPES.map(soft => {
            const hasVersions = (data.software?.[soft.id]?.length ?? 0) > 0 ||
              !!data.availableVersions?.some(v => v.source === soft.id);
            return (
              <Button
                key={soft.id}
                variant="none"
                onClick={() => !soft.disabled && setSelectedSoftware(soft.id)}
                disabled={soft.disabled || !hasVersions}
                className={`items-start gap-4 p-5 rounded-xl border text-left transition-all
                  ${soft.color} ${soft.hover} ${soft.disabled || !hasVersions ? 'opacity-50 cursor-not-allowed grayscale' : 'cursor-pointer group'}`}
              >
                <div className="p-3 bg-surface-900 rounded-lg shadow-inner shrink-0">
                  {soft.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg font-bold text-gray-100">{soft.name}</h3>
                    {data.currentSource === soft.id && (
                      <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                        <CheckCircle2 size={12} /> Active
                      </span>
                    )}
                    {data.currentSource !== soft.id && data.availableVersions?.some(v => v.source === soft.id && v.downloaded) && (
                      <span className="flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                        <Download size={10} /> Downloaded
                      </span>
                    )}
                    {!soft.disabled && !data.availableVersions?.some(v => v.source === soft.id && v.downloaded) && data.currentSource !== soft.id && (
                      <span className="text-xs text-gray-500 bg-surface-800 px-2 py-0.5 rounded border border-surface-700">
                        {hasVersions ? 'Not Installed' : 'No Versions'}
                      </span>
                    )}
                    {soft.disabled && (
                      <span className="text-xs text-gray-500 bg-surface-800 px-2 py-0.5 rounded border border-surface-700">
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 leading-snug">{soft.description}</p>
                </div>
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  // Version Detail View
  const { current, latest } = currentVersionsForSoftware;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" onClick={() => setSelectedSoftware(null)} className="text-sm">
          Software
        </Button>
        <ChevronRight size={14} className="text-gray-600" />
        <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
          {software?.icon} {software?.name}
        </h2>
      </div>

      {/* Software Info */}
      <div className="flex items-center gap-4 bg-surface-800/50 rounded-xl p-4 border border-surface-700/50">
        <div className="p-3 bg-surface-900 rounded-xl shadow-inner shrink-0">
          {software?.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-gray-100">{software?.name}</h3>
          <p className="text-sm text-gray-400">{software?.description}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span>Latest: <span className="text-gray-300 font-medium">{latest?.version || 'N/A'}</span></span>
            {current && (
              <span className="text-green-400">Active: {current.version}</span>
            )}
            <span>{filteredVersions.length} version{filteredVersions.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search versions... (e.g. 1.21)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
          />
        </div>

        <div className="flex gap-2 items-center">
          <Filter size={14} className="text-gray-500" />
          {(['all', 'release', 'snapshot'] as FilterMode[]).map(m => (
            <Button
              key={m}
              variant="none"
              onClick={() => setFilterMode(m)}
              className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                filterMode === m
                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                  : 'bg-surface-800 border-surface-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              {m === 'all' ? 'All' : m.charAt(0).toUpperCase() + m.slice(1)}
            </Button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <ArrowUpDown size={14} className="text-gray-500" />
          {(['newest', 'oldest'] as SortMode[]).map(m => (
            <Button
              key={m}
              variant="none"
              onClick={() => setSortMode(m)}
              className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                sortMode === m
                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                  : 'bg-surface-800 border-surface-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              {m === 'newest' ? 'Newest' : 'Oldest'}
            </Button>
          ))}
        </div>
      </div>

      {/* Version List */}
      <div className="card">
        {filteredVersions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {search ? `No versions matching "${search}"` : 'No versions available for this software.'}
            {search && (
              <Button variant="ghost" onClick={() => setSearch('')} className="block mx-auto mt-2 text-xs">
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto pr-1 divide-y divide-surface-700/30">
            {filteredVersions.map(v => {
              const isCurrent = data.currentSource === v.source && data.currentVersion === v.version;
              const isLatest = latest?.version === v.version;
              return (
                <div key={`${v.source}-${v.version}`} className="flex items-center justify-between p-3 hover:bg-surface-800/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`font-mono text-sm ${isCurrent ? 'text-green-300' : 'text-gray-200'}`}>
                      {v.version}
                    </span>
                    {v.type && v.type !== 'Release' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                        v.type === 'Snapshot' ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10' :
                        'text-orange-300 border-orange-500/30 bg-orange-500/10'
                      }`}>
                        {v.type}
                      </span>
                    )}
                    {isCurrent && (
                      <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                        <CheckCircle2 size={10} /> Active
                      </span>
                    )}
                    {v.downloaded && !isCurrent && (
                      <span className="flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                        <Download size={10} /> Downloaded
                      </span>
                    )}
                    {isLatest && !isCurrent && (
                      <span className="text-[10px] text-blue-400/70 bg-blue-500/5 px-1.5 py-0.5 rounded border border-blue-500/20">
                        Latest
                      </span>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => handleInstall(v.version, v.source)}
                    disabled={installing || isCurrent}
                    className={`text-sm shrink-0 ${
                      isCurrent ? 'opacity-50 cursor-not-allowed' :
                      v.downloaded ? 'border-blue-500/30 text-blue-300' : ''
                    }`}
                  >
                    <Download size={14} />
                    {isCurrent ? 'Active' : installing ? 'Installing...' : v.downloaded ? 'Switch' : 'Install'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}