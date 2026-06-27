import React, { useEffect, useState } from 'react';
import { Cpu, Download, CheckCircle2, ChevronRight, Server, Globe, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

interface VersionEntry {
  version: string;
  type: string;
  source: string;
  downloaded: boolean;
  current: boolean;
}

interface VersionsData {
  currentVersion: string;
  currentSource: string;
  downloadedJars: string[];
  availableVersions: VersionEntry[];
}

const SOFTWARE_TYPES = [
  {
    id: 'PaperMC',
    name: 'Paper',
    description: 'High performance fork of Spigot. Recommended for most servers.',
    icon: <Cpu className="w-8 h-8 text-emerald-400" />,
    color: 'bg-emerald-500/10 border-emerald-500/30',
    hover: 'hover:border-emerald-500/60',
    popular: true
  },
  {
    id: 'Purpur',
    name: 'Purpur',
    description: 'Drop-in replacement for Paper with more configuration options.',
    icon: <Cpu className="w-8 h-8 text-purple-400" />,
    color: 'bg-purple-500/10 border-purple-500/30',
    hover: 'hover:border-purple-500/60',
    popular: false
  },
  {
    id: 'NeoForge',
    name: 'NeoForge',
    description: 'A modern fork of Forge with improved performance and features.',
    icon: <ShieldCheck className="w-8 h-8 text-green-400" />,
    color: 'bg-green-500/10 border-green-500/30',
    hover: 'hover:border-green-500/60',
    popular: false,
    disabled: false
  },
  {
    id: 'Quilt',
    name: 'Quilt',
    description: 'A modern modding platform focused on stability and ease of use.',
    icon: <Server className="w-8 h-8 text-indigo-400" />,
    color: 'bg-indigo-500/10 border-indigo-500/30',
    hover: 'hover:border-indigo-500/60',
    popular: false,
    disabled: false
  },
  {
    id: 'Bedrock',
    name: 'Bedrock',
    description: 'The official Bedrock Edition server allowing cross-platform play.',
    icon: <Globe className="w-8 h-8 text-blue-400" />,
    color: 'bg-blue-500/10 border-blue-500/30',
    hover: 'hover:border-blue-500/60',
    popular: false,
    disabled: false
  },
  {
    id: 'Pocketmine',
    name: 'Pocketmine-MP',
    description: 'Custom server software for Minecraft: Bedrock Edition with enhanced features.',
    icon: <Server className="w-8 h-8 text-pink-400" />,
    color: 'bg-pink-500/10 border-pink-500/30',
    hover: 'hover:border-pink-500/60',
    popular: false,
    disabled: false
  },
  {
    id: 'Mojang',
    name: 'Vanilla',
    description: 'The original Minecraft server software provided by Mojang.',
    icon: <Globe className="w-8 h-8 text-gray-400" />,
    color: 'bg-surface-800 border-surface-700',
    hover: 'hover:border-gray-500/60',
    popular: false
  },
  {
    id: 'Fabric',
    name: 'Fabric',
    description: 'Lightweight, experimental modding toolchain.',
    icon: <Server className="w-8 h-8 text-orange-400" />,
    color: 'bg-orange-500/10 border-orange-500/30',
    hover: 'hover:border-orange-500/60',
    popular: false
  },
  {
    id: 'Forge',
    name: 'Forge',
    description: 'Extensive modding API for complex modpacks.',
    icon: <ShieldCheck className="w-8 h-8 text-red-400" />,
    color: 'bg-red-500/10 border-red-500/30',
    hover: 'hover:border-red-500/60',
    popular: false
  },
];

export default function Software() {
  const [data, setData] = useState<VersionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [selectedSoftware, setSelectedSoftware] = useState<string | null>(null);

  useEffect(() => {
    fetchVersions();
  }, []);

  const fetchVersions = async () => {
    try {
      const versions = await api.getAvailableVersions();
      setData(versions);
    } catch (err: any) {
      toast.error('Failed to load software versions');
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (version: string) => {
    if (!selectedSoftware) return;
    setInstalling(true);
    const promise = api.setServerVersion(version, selectedSoftware);
    toast.promise(promise, {
      loading: `Installing ${selectedSoftware} ${version}...`,
      success: `Successfully installed ${selectedSoftware} ${version}`,
      error: (err) => `Failed to install: ${err.message}`
    });
    
    try {
      await promise;
      await fetchVersions();
      setSelectedSoftware(null);
    } catch {} finally {
      setInstalling(false);
    }
  };

  if (loading || !data) {
    return <div className="p-8 text-center text-gray-400">Loading software catalog...</div>;
  }

  // Display Software Categories
  if (!selectedSoftware) {
    return (
      <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Software</h2>
          <p className="text-gray-400 mt-1">Choose the server software that runs your Minecraft world.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SOFTWARE_TYPES.map(soft => (
            <button
              key={soft.id}
              onClick={() => !soft.disabled && setSelectedSoftware(soft.id)}
              disabled={soft.disabled}
              className={`flex items-start gap-4 p-5 rounded-xl border text-left transition-all
                ${soft.color} ${soft.hover} ${soft.disabled ? 'opacity-50 cursor-not-allowed grayscale' : 'cursor-pointer group'}`}
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
                  {data.currentSource !== soft.id && !data.availableVersions?.some(v => v.source === soft.id && v.downloaded) && !soft.popular && !soft.disabled && (
                    <span className="text-xs text-gray-500 bg-surface-800 px-2 py-0.5 rounded border border-surface-700">
                      Not Installed
                    </span>
                  )}
                  {soft.popular && data.currentSource !== soft.id && !data.availableVersions?.some(v => v.source === soft.id && v.downloaded) && (
                    <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                      Popular
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
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Display Versions for Selected Software
  const software = SOFTWARE_TYPES.find(s => s.id === selectedSoftware);
  let filteredVersions: VersionEntry[] = [];
  if (data?.availableVersions) {
    filteredVersions = data.availableVersions
      .filter(v => v.source === selectedSoftware);
  }

  const grouped = {
    'Stable Releases': filteredVersions.filter(v => v.type.toLowerCase() === 'release'),
    'Snapshots': filteredVersions.filter(v => v.type.toLowerCase() === 'snapshot'),
    'Beta': filteredVersions.filter(v => v.type.toLowerCase() === 'beta' || v.type.toLowerCase() === 'old_beta'),
    'Alpha': filteredVersions.filter(v => v.type.toLowerCase() === 'alpha' || v.type.toLowerCase() === 'old_alpha'),
    'Old': filteredVersions.filter(v => {
      const t = v.type.toLowerCase();
      return t !== 'release' && t !== 'snapshot' && t !== 'beta' && t !== 'old_beta' && t !== 'alpha' && t !== 'old_alpha';
    }),
  };

  const VersionRow = ({ v }: { v: VersionEntry }) => {
    const isCurrent = data.currentSource === selectedSoftware && data.currentVersion === v.version;
    const isDownloaded = data.availableVersions?.some(av => av.source === selectedSoftware && av.version === v.version && av.downloaded);
    return (
      <div className="flex items-center justify-between p-4 hover:bg-surface-800/30 transition-colors">
        <div className="flex items-center gap-3">
          <span className="font-medium text-gray-200">{v.version}</span>
          {isCurrent && (
            <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
              <CheckCircle2 size={12} /> Active
            </span>
          )}
          {isDownloaded && !isCurrent && (
            <span className="flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
              <Download size={10} /> Downloaded
            </span>
          )}
        </div>
        <button
          onClick={() => handleInstall(v.version)}
          disabled={installing || isCurrent}
          className={`btn-secondary flex items-center gap-2 text-sm ${isCurrent ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Download size={14} />
          {isCurrent ? 'Active' : installing ? 'Installing...' : 'Install'}
        </button>
      </div>
    );
  };

  const groupColors: Record<string, string> = {
    'Stable Releases': 'text-green-400',
    'Snapshots': 'text-yellow-400',
    'Beta': 'text-orange-400',
    'Alpha': 'text-red-400',
    'Old': 'text-gray-400',
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setSelectedSoftware(null)} className="text-gray-400 hover:text-white transition-colors">
          Software
        </button>
        <ChevronRight size={16} className="text-gray-600" />
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          {software?.icon} {software?.name}
        </h2>
      </div>

      <div className="card">
        <div className="max-h-[600px] overflow-y-auto pr-2 space-y-1">
          {Object.entries(grouped).map(([groupName, items]) => {
            if (items.length === 0) return null;
            return (
              <details key={groupName} className="group" open={groupName === 'Stable Releases'}>
                <summary className="sticky top-0 bg-surface-900/95 backdrop-blur-sm z-10 flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-surface-800/50 transition-colors text-sm font-medium border-b border-surface-700/50">
                  <span className={groupColors[groupName]}>{groupName}</span>
                  <span className="text-xs text-gray-500 ml-1">({items.length})</span>
                  <ChevronRight size={14} className="ml-auto text-gray-500 transition-transform group-open:rotate-90" />
                </summary>
                <div className="divide-y divide-surface-700/50">
                  {items.map(v => <VersionRow key={v.version} v={v} />)}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}
