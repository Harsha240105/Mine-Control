import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, ArrowLeft, ArrowRight, Check, ChevronRight, Search,
  Monitor, Wifi, Layers, Cpu, Puzzle, Globe, BarChart3,
  Download, HardDrive, Gamepad2, Zap, Shield, BookOpen, Star,
  EyeOff, Eye, Users, Map, ExternalLink, Copy, CheckCircle,
  Loader2, Sparkles, Play,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STEPS = [
  'Identification', 'Software', 'Version', 'World', 'Settings', 'Java',
  'Plugins', 'Summary', 'Create',
];

const SERVER_SOFTWARE = [
  {
    id: 'paper', name: 'Paper', desc: 'High-performance fork of Spigot',
    best: 'Plugins & Performance', badge: 'Most Popular',
    color: 'from-yellow-500/20 to-yellow-600/10', icon: '🟡',
  },
  {
    id: 'purpur', name: 'Purpur', desc: 'Unparalleled customization options',
    best: 'Customization & Performance', badge: 'Best Performance',
    color: 'from-purple-500/20 to-purple-600/10', icon: '🟣',
  },
  {
    id: 'fabric', name: 'Fabric', desc: 'Lightweight mod loader for modern versions',
    best: 'Mods & Lightweight', badge: 'Best for Mods',
    color: 'from-orange-500/20 to-orange-600/10', icon: '🟠',
  },
  {
    id: 'forge', name: 'Forge', desc: 'The original modding platform',
    best: 'Heavy Modpacks', badge: 'Popular for Mods',
    color: 'from-blue-500/20 to-blue-600/10', icon: '🔵',
  },
  {
    id: 'neoforge', name: 'NeoForge', desc: 'Modern fork of Forge',
    best: 'Mods & Modern', badge: 'Modern',
    color: 'from-green-500/20 to-green-600/10', icon: '🟢',
  },
  {
    id: 'vanilla', name: 'Vanilla', desc: 'The official Minecraft server',
    best: 'Pure Minecraft Experience', badge: 'Official',
    color: 'from-gray-500/20 to-gray-600/10', icon: '⬜',
  },
  {
    id: 'spigot', name: 'Spigot', desc: 'Most widely used server software',
    best: 'Plugins & Compatibility', badge: '',
    color: 'from-amber-500/20 to-amber-600/10', icon: '🟤',
  },
  {
    id: 'bukkit', name: 'Bukkit', desc: 'Original plugin API',
    best: 'Plugin Development', badge: '',
    color: 'from-red-500/20 to-red-600/10', icon: '🔴',
  },
];

const POPULAR_PLUGINS = [
  { name: 'LuckPerms', desc: 'Permissions management', category: 'Essentials', url: '' },
  { name: 'EssentialsX', desc: 'Essential server commands', category: 'Essentials', url: '' },
  { name: 'WorldEdit', desc: 'In-game world editing', category: 'Tools', url: '' },
  { name: 'BlueMap', desc: '3D web map viewer', category: 'Map', url: '' },
  { name: 'CoreProtect', desc: 'Block logging & rollback', category: 'Protection', url: '' },
  { name: 'Geyser', desc: 'Bedrock edition support', category: 'Crossplay', url: '' },
  { name: 'ViaVersion', desc: 'Cross-version support', category: 'Compatibility', url: '' },
  { name: 'Dynmap', desc: 'Classic web map viewer', category: 'Map', url: '' },
  { name: 'GriefPrevention', desc: 'Land claiming system', category: 'Protection', url: '' },
  { name: 'Vault', desc: 'Economy & permissions API', category: 'API', url: '' },
];

const RECOMMENDED_PLUGINS_BY_SOFTWARE: Record<string, string[]> = {
  paper: ['LuckPerms', 'EssentialsX', 'WorldEdit', 'BlueMap', 'CoreProtect', 'Geyser', 'ViaVersion', 'GriefPrevention'],
  purpur: ['LuckPerms', 'EssentialsX', 'WorldEdit', 'BlueMap', 'CoreProtect'],
  spigot: ['LuckPerms', 'EssentialsX', 'WorldEdit', 'Dynmap', 'Vault'],
  bukkit: ['LuckPerms', 'WorldEdit', 'Vault'],
};

const VERSION_TYPES = ['release', 'snapshot', 'old_beta', 'beta', 'old_alpha', 'alpha'];

type WizardData = {
  name: string;
  path: string;
  software: string;
  version: string;
  gamemode: string;
  difficulty: string;
  seed: string;
  maxPlayers: number;
  viewDistance: number;
  port: number;
  onlineMode: boolean;
  whitelist: boolean;
  pvp: boolean;
  commandBlocks: boolean;
  javaPath: string;
  minRam: string;
  maxRam: string;
  plugins: string[];
  network: 'local' | 'lan' | 'internet' | 'tunnel';
};

export default function Wizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [versions, setVersions] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [versionSearch, setVersionSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState(0);
  const [createStatus, setCreateStatus] = useState('');
  const [ramSlider, setRamSlider] = useState(4);
  const [showPassword, setShowPassword] = useState(false);

  const [data, setData] = useState<WizardData>({
    name: '',
    path: './minecraft',
    software: 'paper',
    version: '',
    gamemode: 'survival',
    difficulty: 'normal',
    seed: '',
    maxPlayers: 20,
    viewDistance: 10,
    port: 25565,
    onlineMode: true,
    whitelist: false,
    pvp: true,
    commandBlocks: true,
    javaPath: 'java',
    minRam: '2G',
    maxRam: '4G',
    plugins: [],
    network: 'local',
  });

  useEffect(() => {
    fetchVersions();
  }, []);

  const fetchVersions = async () => {
    setVersionsLoading(true);
    try {
      const { api } = await import('../lib/api');
      const res = await api.getAvailableVersions();
      setVersions(res.availableVersions || []);
      if (res.availableVersions?.length > 0) {
        setData(d => ({ ...d, version: res.availableVersions[0].version }));
      }
    } catch {}
    setVersionsLoading(false);
  };

  const update = (partial: Partial<WizardData>) => setData(d => ({ ...d, ...partial }));

  const togglePlugin = (name: string) => {
    setData(d => ({
      ...d,
      plugins: d.plugins.includes(name)
        ? d.plugins.filter(p => p !== name)
        : [...d.plugins, name],
    }));
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
  };
  const prev = () => {
    if (step > 0) setStep(s => s - 1);
  };

  const canNext = (): boolean => {
    switch (step) {
      case 0: return data.name.trim().length > 0;
      case 1: return data.software.length > 0;
      case 2: return data.version.length > 0;
      default: return true;
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    setCreateProgress(0);

    const statuses = [
      'Preparing Server...', 'Saving Configuration...', 'Readying Dashboard...'
    ];

    try {
      for (let i = 0; i <= 100; i += 25) {
        setCreateProgress(i);
        const idx = Math.min(Math.floor(i / 34), statuses.length - 1);
        setCreateStatus(statuses[idx]);
        await new Promise(r => setTimeout(r, 100));
      }

      const { api } = await import('../lib/api');
      const res = await api.createServer({
        name: data.name,
        port: data.port,
        javaPath: data.javaPath,
        minRam: data.minRam,
        maxRam: data.maxRam,
        gamemode: data.gamemode,
        difficulty: data.difficulty,
        maxPlayers: data.maxPlayers,
        viewDistance: data.viewDistance,
        onlineMode: data.onlineMode,
        software: data.software,
        version: data.version,
        seed: data.seed,
        network: data.network,
        pvp: data.pvp,
      });

      if (res.server?.id) {
        await api.selectServer(res.server.id);
      }

      setCreateProgress(100);
      setCreateStatus('Server Ready!');
      await new Promise(r => setTimeout(r, 500));

      toast.success('Server created successfully!');
      localStorage.setItem('mc_wizard_complete', 'true');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create server');
      setCreating(false);
    }
  };

  const progressPercent = Math.round(((step + 1) / STEPS.length) * 100);

  if (creating) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-minecraft-500/10 rounded-full blur-3xl animate-pulse" />
        </div>
        <div className="relative z-10 text-center max-w-md w-full px-6">
          <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-minecraft-600/20 border border-minecraft-500/30 flex items-center justify-center">
            {createProgress < 100 ? (
              <Loader2 className="w-12 h-12 text-minecraft-400 animate-spin" />
            ) : (
              <CheckCircle className="w-12 h-12 text-green-400" />
            )}
          </div>
          <div className="mb-2">
            <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-minecraft-500 to-green-500 rounded-full transition-all duration-300"
                style={{ width: `${createProgress}%` }}
              />
            </div>
          </div>
          <p className="text-sm text-gray-300 font-medium">{createStatus}</p>
          <p className="text-xs text-gray-500 mt-1">{createProgress}%</p>
          {createProgress >= 100 && (
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-6 btn-primary flex items-center gap-2 mx-auto"
            >
              <Play size={16} />
              Open Dashboard
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      {/* Progress Bar */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="h-1 bg-surface-800">
          <div
            className="h-full bg-gradient-to-r from-minecraft-500 to-blue-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
        <div className="flex items-center gap-3">
          <Server className="w-5 h-5 text-minecraft-500" />
          <span className="text-sm font-medium text-gray-200">Create New Server</span>
          <span className="text-xs text-gray-500">Step {step + 1} of {STEPS.length}</span>
        </div>
        <button onClick={() => navigate('/')} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
          Cancel
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Step navigation sidebar */}
        <div className="hidden md:flex flex-col w-56 border-r border-surface-800 p-4 bg-surface-900/50">
          {STEPS.map((s, i) => (
            <button
              key={s}
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all mb-0.5 ${
                i === step
                  ? 'bg-minecraft-600/20 text-minecraft-400 border border-minecraft-500/20'
                  : i < step
                  ? 'text-green-400 hover:bg-surface-800'
                  : 'text-gray-500'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                i === step ? 'bg-minecraft-600/30 text-minecraft-400' :
                i < step ? 'bg-green-500/20 text-green-400' :
                'bg-surface-800 text-gray-500'
              }`}>
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span>{s}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto p-6 lg:p-10">
            <StepContent
              step={step}
              data={data}
              update={update}
              versions={versions}
              versionsLoading={versionsLoading}
              versionSearch={versionSearch}
              setVersionSearch={setVersionSearch}
              ramSlider={ramSlider}
              setRamSlider={setRamSlider}
              togglePlugin={togglePlugin}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-surface-800 bg-surface-900/50">
        <button
          onClick={step === 0 ? () => navigate('/') : prev}
          className="btn-ghost flex items-center gap-2 text-sm"
        >
          <ArrowLeft size={14} />
          {step === 0 ? 'Exit' : 'Back'}
        </button>

        <div className="flex items-center gap-2 text-xs text-gray-600">
          {STEPS.map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-colors ${
              i === step ? 'bg-minecraft-500' : i < step ? 'bg-green-500' : 'bg-surface-700'
            }`} />
          ))}
        </div>

        <button
          onClick={step === STEPS.length - 1 ? handleCreate : next}
          disabled={!canNext()}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          {step === STEPS.length - 1 ? (
            <><Sparkles size={14} /> Create Server</>
          ) : (
            <><span>Next</span> <ArrowRight size={14} /></>
          )}
        </button>
      </div>
    </div>
  );
}

function StepContent({
  step, data, update, versions, versionsLoading, versionSearch,
  setVersionSearch, ramSlider, setRamSlider, togglePlugin, showPassword, setShowPassword,
}: {
  step: number; data: WizardData; update: (p: Partial<WizardData>) => void;
  versions: any[]; versionsLoading: boolean; versionSearch: string;
  setVersionSearch: (s: string) => void; ramSlider: number; setRamSlider: (n: number) => void;
  togglePlugin: (n: string) => void; showPassword: boolean; setShowPassword: (b: boolean) => void;
}) {
  switch (step) {
    case 0: return <StepIdentification data={data} update={update} />;
    case 1: return <StepSoftware data={data} update={update} />;
    case 2: return <StepVersion data={data} update={update} versions={versions} loading={versionsLoading} search={versionSearch} setSearch={setVersionSearch} />;
    case 3: return <StepWorld data={data} update={update} />;
    case 4: return <StepSettings data={data} update={update} />;
    case 5: return <StepJava data={data} update={update} ramSlider={ramSlider} setRamSlider={setRamSlider} />;
    case 6: return <StepPlugins data={data} update={update} togglePlugin={togglePlugin} />;
    case 7: return <StepSummary data={data} />;
    case 8: return <StepCreate data={data} />;
    default: return null;
  }
}

function StepIdentification({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  const options: { id: string; label: string; desc: string; icon: any; badge?: string }[] = [
    { id: 'local', label: 'Local Only', desc: 'Play on the same computer', icon: Monitor },
    { id: 'lan', label: 'LAN', desc: 'Play on your local network', icon: Wifi },
    { id: 'internet', label: 'Internet', desc: 'Public IP with port forwarding', icon: Globe },
    { id: 'tunnel', label: 'Playit Tunnel', desc: 'No port forwarding needed', icon: Shield, badge: 'Recommended' },
  ];

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-gray-100 mb-2">Identify Your Server</h2>
      <p className="text-gray-500 mb-8">Choose a name and how players will connect.</p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Server Name</label>
          <div className="relative">
            <Server size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={data.name}
              onChange={(e) => update({ name: e.target.value })}
              className="input pl-10 text-lg py-3"
              placeholder="e.g. My Awesome Server"
              autoFocus
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Network Preference</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map(opt => {
              const selected = data.network === opt.id;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  onClick={() => update({ network: opt.id as any })}
                  className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                    selected
                      ? 'border-minecraft-500 bg-minecraft-600/10'
                      : 'border-surface-700 bg-surface-800/50 hover:border-surface-600'
                  }`}
                >
                  {opt.badge && (
                    <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-minecraft-500/20 text-minecraft-400 font-medium">
                      {opt.badge}
                    </span>
                  )}
                  <Icon className={`w-5 h-5 mb-2 ${selected ? 'text-minecraft-400' : 'text-gray-400'}`} />
                  <h3 className="text-sm font-semibold text-gray-200">{opt.label}</h3>
                  <p className="text-xs text-gray-500 mt-1">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepSoftware({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-gray-100 mb-2">Select Server Software</h2>
      <p className="text-gray-500 mb-6">Choose the platform your server will run on.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {SERVER_SOFTWARE.map((sw) => (
          <button
            key={sw.id}
            onClick={() => update({ software: sw.id })}
            className={`relative p-4 rounded-xl border-2 text-left transition-all ${
              data.software === sw.id
                ? 'border-minecraft-500 bg-minecraft-600/10'
                : 'border-surface-700 bg-surface-800/50 hover:border-surface-600'
            }`}
          >
            {sw.badge && (
              <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                data.software === sw.id
                  ? 'bg-minecraft-500/20 text-minecraft-400'
                  : 'bg-minecraft-500/10 text-minecraft-400'
              }`}>
                {sw.badge}
              </span>
            )}
            <div className="text-2xl mb-2">{sw.icon}</div>
            <h3 className="text-sm font-semibold text-gray-200">{sw.name}</h3>
            <p className="text-xs text-gray-400 mt-1">{sw.desc}</p>
            <p className="text-[11px] text-gray-500 mt-1.5">
              <span className="text-gray-400">Best for:</span> {sw.best}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepVersion({ data, update, versions, loading, search, setSearch }: {
  data: WizardData; update: (p: Partial<WizardData>) => void;
  versions: any[]; loading: boolean; search: string; setSearch: (s: string) => void;
}) {
  const filteredBySearch = search
    ? versions.filter(v => v.version.toLowerCase().includes(search.toLowerCase()))
    : versions;
    
  const filtered = filteredBySearch.filter(v => {
    if (data.software === 'paper') return v.source === 'PaperMC';
    if (data.software === 'vanilla') return v.source === 'Mojang';
    return true; 
  });

  const releases = filtered.filter(v => v.type.toLowerCase() === 'release');
  const snapshots = filtered.filter(v => v.type.toLowerCase() === 'snapshot');
  const old = filtered.filter(v => v.type.toLowerCase() !== 'release' && v.type.toLowerCase() !== 'snapshot');

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-gray-100 mb-2">Select Minecraft Version</h2>
      <p className="text-gray-500 mb-6">Choose the version your server will run.</p>

      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-9 text-sm"
          placeholder="Search versions..."
        />
      </div>

      <div className="max-h-96 overflow-y-auto space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8"><div className="w-5 h-5 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            {releases.length > 0 && (
              <div>
                <p className="text-xs font-medium text-green-400 mb-1.5">Latest Releases</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {releases.slice(0, 12).map(v => (
                    <VersionCard key={v.version} v={v} selected={data.version} onSelect={() => update({ version: v.version })} />
                  ))}
                </div>
              </div>
            )}
            {snapshots.length > 0 && (
              <div>
                <p className="text-xs font-medium text-yellow-400 mb-1.5">Snapshots & Preview</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {snapshots.slice(0, 6).map(v => (
                    <VersionCard key={v.version} v={v} selected={data.version} onSelect={() => update({ version: v.version })} />
                  ))}
                </div>
              </div>
            )}
            {old.length > 0 && (
              <div>
                <p className="text-xs font-medium text-orange-400 mb-1.5">Older Versions</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {old.slice(0, 18).map(v => (
                    <VersionCard key={v.version} v={v} selected={data.version} onSelect={() => update({ version: v.version })} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function VersionCard({ v, selected, onSelect }: { v: any; selected: string; onSelect: () => void }) {
  const isSelected = v.version === selected;
  return (
    <button
      onClick={onSelect}
      className={`p-2.5 rounded-lg border text-left text-sm transition-all ${
        isSelected
          ? 'border-minecraft-500 bg-minecraft-600/15 text-minecraft-400 font-medium'
          : 'border-surface-700 bg-surface-800/50 text-gray-300 hover:border-surface-600'
      }`}
    >
      <span className="font-mono text-xs">{v.version}</span>
      <span className={`block text-[10px] mt-0.5 ${isSelected ? 'text-minecraft-400/70' : 'text-gray-600'}`}>
        {v.source === 'PaperMC' ? 'Paper' : 'Vanilla'}
      </span>
    </button>
  );
}

function StepSettings({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-gray-100 mb-2">Server Settings</h2>
      <p className="text-gray-500 mb-6">Configure your game rules and world settings.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Default Gamemode</label>
          <select value={data.gamemode} onChange={(e) => update({ gamemode: e.target.value })} className="select text-sm">
            <option value="survival">Survival</option>
            <option value="creative">Creative</option>
            <option value="adventure">Adventure</option>
            <option value="spectator">Spectator</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Difficulty</label>
          <select value={data.difficulty} onChange={(e) => update({ difficulty: e.target.value })} className="select text-sm">
            <option value="peaceful">Peaceful</option>
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">World Type</label>
          <select className="select text-sm">
            <option value="default">Default</option>
            <option value="flat">Superflat</option>
            <option value="largebiomes">Large Biomes</option>
            <option value="amplified">Amplified</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Max Players</label>
          <input type="number" value={data.maxPlayers} onChange={(e) => update({ maxPlayers: parseInt(e.target.value) || 20 })} className="input text-sm" min={1} max={100} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Server Port</label>
          <input type="number" value={data.port} onChange={(e) => update({ port: parseInt(e.target.value) || 25565 })} className="input text-sm" min={1024} max={65535} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">View Distance</label>
          <input type="number" value={data.viewDistance} onChange={(e) => update({ viewDistance: parseInt(e.target.value) || 10 })} className="input text-sm" min={3} max={32} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Connection Mode</label>
          <div className="flex gap-2">
            <button onClick={() => update({ onlineMode: true })} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${data.onlineMode ? 'bg-green-500/20 border border-green-500/50 text-green-400' : 'bg-surface-800 border border-surface-600 text-gray-400'}`}>
              Premium
            </button>
            <button onClick={() => update({ onlineMode: false })} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${!data.onlineMode ? 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-400' : 'bg-surface-800 border border-surface-600 text-gray-400'}`}>
              Offline
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={data.whitelist} onChange={(e) => update({ whitelist: e.target.checked })} className="rounded bg-surface-800 border-surface-600 text-minecraft-500" />
          <div><span className="text-sm text-gray-200">Whitelist</span><p className="text-xs text-gray-500">Only whitelisted players can join</p></div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={data.pvp} onChange={(e) => update({ pvp: e.target.checked })} className="rounded bg-surface-800 border-surface-600 text-minecraft-500" />
          <div><span className="text-sm text-gray-200">PvP</span><p className="text-xs text-gray-500">Allow player versus player combat</p></div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={data.commandBlocks} onChange={(e) => update({ commandBlocks: e.target.checked })} className="rounded bg-surface-800 border-surface-600 text-minecraft-500" />
          <div><span className="text-sm text-gray-200">Command Blocks</span><p className="text-xs text-gray-500">Enable command blocks for advanced mechanics</p></div>
        </label>
      </div>
    </div>
  );
}

function StepJava({ data, update, ramSlider, setRamSlider }: {
  data: WizardData; update: (p: Partial<WizardData>) => void;
  ramSlider: number; setRamSlider: (n: number) => void;
}) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-gray-100 mb-2">Java Settings</h2>
      <p className="text-gray-500 mb-6">Configure memory allocation and Java path.</p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Java Path</label>
          <input type="text" value={data.javaPath} onChange={(e) => update({ javaPath: e.target.value })} className="input" placeholder="java" />
          <p className="text-xs text-gray-500 mt-1">Default: <code className="text-minecraft-400 bg-surface-800 px-1 rounded">java</code> (uses system default)</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">Memory (RAM)</label>
            <span className="text-sm text-minecraft-400 font-mono font-medium">{ramSlider} GB</span>
          </div>
          <input
            type="range"
            min={1}
            max={32}
            value={ramSlider}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              setRamSlider(val);
              update({ minRam: `${Math.min(val, 2)}G`, maxRam: `${val}G` });
            }}
            className="w-full h-2 bg-surface-800 rounded-full appearance-none cursor-pointer accent-minecraft-500"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>1 GB</span><span>16 GB</span><span>32 GB</span>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Min RAM</label>
              <input type="text" value={data.minRam} onChange={(e) => update({ minRam: e.target.value })} className="input text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Max RAM</label>
              <input type="text" value={data.maxRam} onChange={(e) => update({ maxRam: e.target.value })} className="input text-sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepPlugins({ data, togglePlugin }: { data: WizardData; update: (p: Partial<WizardData>) => void; togglePlugin: (n: string) => void }) {
  const recommended = RECOMMENDED_PLUGINS_BY_SOFTWARE[data.software] || [];
  const displayPlugins = POPULAR_PLUGINS.filter(p => recommended.includes(p.name));

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-gray-100 mb-2">Plugins & Mods</h2>
      <p className="text-gray-500 mb-6">Install essential plugins to enhance your server.</p>

      {displayPlugins.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {displayPlugins.map(p => {
            const selected = data.plugins.includes(p.name);
            return (
              <button
                key={p.name}
                onClick={() => togglePlugin(p.name)}
                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                  selected
                    ? 'border-minecraft-500/50 bg-minecraft-600/10'
                    : 'border-surface-700 bg-surface-800/50 hover:border-surface-600'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                  selected ? 'bg-minecraft-600/30 text-minecraft-400' : 'bg-surface-700 text-gray-400'
                }`}>
                  <Puzzle size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${selected ? 'text-minecraft-400' : 'text-gray-200'}`}>{p.name}</p>
                  <p className="text-xs text-gray-500">{p.desc}</p>
                </div>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                  selected ? 'bg-minecraft-500 border-minecraft-500' : 'border-surface-500'
                }`}>
                  {selected && <Check size={12} className="text-white" />}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No specific recommendations for this software. You can install plugins later from the Plugin Manager.</p>
      )}

      <p className="text-xs text-gray-500 mt-4">You can always install more plugins later from the Plugin Manager.</p>
    </div>
  );
}

function StepWorld({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-gray-100 mb-2">World Generation</h2>
      <p className="text-gray-500 mb-6">Set up your world seed.</p>

      <div className="max-w-md">
        <label className="block text-sm font-medium text-gray-300 mb-2">World Seed (optional)</label>
        <div className="relative">
          <Map size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={data.seed}
            onChange={(e) => update({ seed: e.target.value })}
            className="input pl-10"
            placeholder="e.g. 123456789 or custom text"
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">Leave blank for a random seed.</p>
      </div>
    </div>
  );
}

function StepSummary({ data }: { data: WizardData }) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-gray-100 mb-2">Summary</h2>
      <p className="text-gray-500 mb-6">Review your configuration before creating the server.</p>

      <div className="space-y-3">
        <SummaryRow label="Server Name" value={data.name} />
        <SummaryRow label="Software" value={data.software.charAt(0).toUpperCase() + data.software.slice(1)} />
        <SummaryRow label="Version" value={data.version} />
        <SummaryRow label="Gamemode" value={data.gamemode.charAt(0).toUpperCase() + data.gamemode.slice(1)} />
        <SummaryRow label="Difficulty" value={data.difficulty.charAt(0).toUpperCase() + data.difficulty.slice(1)} />
        <SummaryRow label="Max Players" value={String(data.maxPlayers)} />
        <SummaryRow label="RAM" value={`${data.minRam} - ${data.maxRam}`} />
        <SummaryRow label="Network" value={data.network.charAt(0).toUpperCase() + data.network.slice(1)} />
        {data.plugins.length > 0 && (
          <SummaryRow label="Plugins" value={data.plugins.join(', ')} />
        )}
      </div>

      <div className="mt-6 p-4 rounded-lg bg-surface-800/50 border border-surface-700/50">
        <div className="flex items-center gap-4 text-sm">
          <div>
            <p className="text-gray-400">Estimated Download Size</p>
            <p className="text-gray-200 font-medium">~550 MB</p>
          </div>
          <div className="w-px h-8 bg-surface-700" />
          <div>
            <p className="text-gray-400">Estimated Setup Time</p>
            <p className="text-gray-200 font-medium">~2-5 minutes</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-surface-800 last:border-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm text-gray-200 font-medium">{value}</span>
    </div>
  );
}

function StepCreate({ data }: { data: WizardData }) {
  return (
    <div className="animate-fade-in text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-minecraft-600/30 to-green-600/20 border border-minecraft-500/30 flex items-center justify-center">
        <Sparkles className="w-10 h-10 text-minecraft-400" />
      </div>
      <h2 className="text-2xl font-bold text-gray-100 mb-2">Ready to Create!</h2>
      <p className="text-gray-500 mb-4">Your server "{data.name}" is ready to be built.</p>

      <div className="max-w-sm mx-auto space-y-3 text-left">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/50 border border-surface-700/50">
          <CheckCircle size={16} className="text-green-400 shrink-0" />
          <span className="text-sm text-gray-300">Server configured</span>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/50 border border-surface-700/50">
          <CheckCircle size={16} className="text-green-400 shrink-0" />
          <span className="text-sm text-gray-300">Version selected</span>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/50 border border-surface-700/50">
          <CheckCircle size={16} className="text-green-400 shrink-0" />
          <span className="text-sm text-gray-300">Plugins ready to install</span>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-700/50 border border-surface-600/50">
          <Loader2 size={16} className="text-yellow-400 animate-spin shrink-0" />
          <span className="text-sm text-gray-300">Click "Create Server" to begin</span>
        </div>
      </div>
    </div>
  );
}