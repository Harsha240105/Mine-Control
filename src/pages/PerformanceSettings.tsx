import { useEffect, useState } from 'react';
import { Zap, Cpu, Save, FileCode, RotateCw, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '../components/ui/stateful-button';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useActiveServer } from '../hooks/useActiveServer';
import toast from 'react-hot-toast';

interface Preset {
  id: string;
  name: string;
  description: string;
  jvmFlags: string[];
  viewDistance: number;
  simulationDistance: number;
}

interface TuneResult {
  preset: Preset;
  autoFlags: string[];
  recommendedViewDistance: number;
  recommendedSimulationDistance: number;
  systemRamGb: number;
  systemCpuCores: number;
  totalFlags: string[];
  current: {
    viewDistance: number;
    simulationDistance: number;
    jvmFlags: string;
    currentFlags: string[];
  };
}

export default function PerformanceSettings() {
  const { server: activeServer } = useActiveServer();
  const [loading, setLoading] = useState(true);
  const [tune, setTune] = useState<TuneResult | null>(null);
  const [presets, setPresets] = useState<any>({ presets: [], system: {} });
  const [selectedPreset, setSelectedPreset] = useState('');
  const [customFlags, setCustomFlags] = useState('');
  const [ymlGenerated, setYmlGenerated] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([loadTune(), loadPresets()]).finally(() => setLoading(false));
  }, [activeServer?.id]);

  const loadTune = async () => {
    if (!activeServer?.id) return;
    try {
      const data = await api.getPerformanceTune(activeServer.id);
      setTune(data);
      setCustomFlags(data.current?.jvmFlags || '');
    } catch {}
  };

  const loadPresets = async () => {
    try {
      setPresets(await api.getPerformancePresets());
    } catch {}
  };

  const applyPreset = async () => {
    if (!activeServer?.id || !selectedPreset) return;
    try {
      await api.applyPerformancePreset(activeServer.id, selectedPreset);
      toast.success('Preset applied');
      loadTune();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const saveJvmFlags = async () => {
    if (!activeServer?.id) return;
    try {
      await api.setJvmFlags(activeServer.id, customFlags);
      toast.success('JVM flags saved');
      loadTune();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const generateYml = async () => {
    if (!activeServer?.id) return;
    try {
      const res = await api.generateYmlOptimizations(activeServer.id);
      setYmlGenerated(res.generated || []);
      toast.success(`Generated ${res.generated?.length || 0} config file(s)`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-gray-100">Performance Tuning</h2>
        <p className="text-sm text-gray-500 mt-0.5">Optimize JVM flags, view distance, and server config files</p>
      </div>

      {tune && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <Zap size={16} className="text-minecraft-500" />
            System Information
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">System RAM</span>
              <p className="text-gray-200 font-medium">{tune.systemRamGb} GB</p>
            </div>
            <div>
              <span className="text-gray-500">CPU Cores</span>
              <p className="text-gray-200 font-medium">{tune.systemCpuCores}</p>
            </div>
            <div>
              <span className="text-gray-500">Recommended View Dist</span>
              <p className="text-gray-200 font-medium">{tune.recommendedViewDistance}</p>
            </div>
            <div>
              <span className="text-gray-500">Recommended Sim Dist</span>
              <p className="text-gray-200 font-medium">{tune.recommendedSimulationDistance}</p>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
          <Cpu size={16} className="text-minecraft-500" />
          Performance Presets
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {presets.presets?.map((p: Preset) => (
            <button
              key={p.id}
              onClick={() => setSelectedPreset(p.id)}
              className={`text-left p-4 rounded-lg border transition-colors ${
                selectedPreset === p.id
                  ? 'border-minecraft-500/40 bg-minecraft-500/10'
                  : 'border-surface-600 bg-surface-800 hover:border-surface-500'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${selectedPreset === p.id ? 'text-minecraft-400' : 'text-gray-500'}`}>
                  {selectedPreset === p.id ? <CheckCircle size={16} /> : <Cpu size={16} />}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-200">{p.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{p.description}</p>
                  <div className="flex gap-3 mt-2 text-xs text-gray-500">
                    <span>View: {p.viewDistance}</span>
                    <span>Sim: {p.simulationDistance}</span>
                    <span>{p.jvmFlags.length} flags</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
        <button
          onClick={applyPreset}
          disabled={!selectedPreset}
          className="btn-primary flex items-center gap-2 mt-4 disabled:opacity-40"
        >
          <RotateCw size={16} />
          Apply Preset
        </button>
      </div>

      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
          <FileCode size={16} className="text-minecraft-500" />
          Custom JVM Flags
        </h3>
        <p className="text-xs text-gray-500 mb-3">Leave empty to use auto-detected flags from the active preset.</p>
        <textarea
          value={customFlags}
          onChange={e => setCustomFlags(e.target.value)}
          placeholder={tune?.totalFlags?.join(' ') || '-XX:+UseG1GC ...'}
          rows={4}
          className="input font-mono text-xs w-full"
        />
        <div className="flex items-center justify-between mt-3">
          {tune?.current?.currentFlags && (
            <div className="text-xs text-gray-600">
              Current: <span className="text-gray-500">{tune.current.currentFlags.length} flags</span>
            </div>
          )}
          <Button variant="primary" onClick={saveJvmFlags}>
            <Save size={16} />
            Save Flags
          </Button>
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
          <FileCode size={16} className="text-minecraft-500" />
          Generate Optimized Config Files
        </h3>
        <p className="text-xs text-gray-500 mb-3">Generates paper.yml, bukkit.yml, spigot.yml, pufferfish.yml, purpur.yml with optimized settings for your server.</p>
        <Button variant="primary" onClick={generateYml}>
          <FileCode size={16} />
          Generate YML Files
        </Button>
        {ymlGenerated.length > 0 && (
          <div className="mt-3 space-y-1">
            {ymlGenerated.map(f => (
              <div key={f} className="flex items-center gap-2 text-xs text-minecraft-400">
                <CheckCircle size={12} /> {f}
              </div>
            ))}
          </div>
        )}
      </div>

      {tune?.totalFlags && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <Cpu size={16} className="text-minecraft-500" />
            Current Effective JVM Flags
          </h3>
          <div className="bg-surface-900 rounded-lg p-3 text-xs font-mono text-gray-400 break-all whitespace-pre-wrap">
            {tune.totalFlags.join(' \n')}
          </div>
        </div>
      )}
    </div>
  );
}
