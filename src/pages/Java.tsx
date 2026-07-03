import { useEffect, useState } from 'react';
import { Coffee, Download, Trash2, RefreshCw, CheckCircle, XCircle, AlertTriangle, ExternalLink, Cpu, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

interface JavaVersion {
  path: string;
  version: string;
  majorVersion: number;
  vendor: string;
  arch: string;
  is64bit: boolean;
  javaHome: string;
  source: string;
}

export default function JavaManager() {
  const [installed, setInstalled] = useState<JavaVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [serverConfig, setServerConfig] = useState<any>(null);
  const [requiredJava, setRequiredJava] = useState<number | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    loadJava();
    loadConfig();
  }, []);

  const loadJava = async () => {
    setLoading(true);
    try {
      const data = await api.getJavaScan();
      setInstalled(data || []);
    } catch (err: any) {
      toast.error('Failed to scan Java installations');
    } finally {
      setLoading(false);
    }
  };

  const loadConfig = async () => {
    try {
      const config = await api.getServerConfig();
      setServerConfig(config);
      // Compute required Java from jar name
      const jf = config.jarFile || '';
      const m = jf.match(/(?:paper|vanilla|fabric|forge|neoforge|quilt|purpur|spigot|folia|pufferfish)-(.+)\.jar$/i);
      if (m) {
        const ver = m[1];
        const src = jf.match(/^(paper|vanilla|fabric|forge|neoforge|quilt|purpur|spigot|folia|pufferfish)/i)?.[1]?.toLowerCase() || 'paper';
        try {
          const resp = await fetch(`/api/server/java/resolve-required?version=${encodeURIComponent(ver)}&source=${encodeURIComponent(src)}`);
          const data = await resp.json();
          setRequiredJava(data.required);
        } catch {}
      }
    } catch {}
  };

  const handleDownload = async (majorVersion: number) => {
    setDownloading(majorVersion);
    setDownloadProgress(0);
    try {
      const result = await api.installJava(String(majorVersion), 'paper');
      if (result.success) {
        toast.success(`Java ${majorVersion} installed successfully`);
        await loadJava();
      } else {
        toast.error(result.message || 'Installation failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Download failed');
    } finally {
      setDownloading(null);
      setDownloadProgress(0);
    }
  };

  const handleRemove = async (j: JavaVersion) => {
    if (!j.path.includes('.minecontrol')) {
      toast.error('Can only remove MineControl-managed Java installations');
      return;
    }
    setRemoving(j.path);
    try {
      await api.removeJava(j.path);
      toast.success(`Java ${j.majorVersion} removed`);
      await loadJava();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove');
    } finally {
      setRemoving(null);
    }
  };

  const handleAutoDetect = async () => {
    await loadJava();
    toast.success(`Found ${installed.length} Java installation(s)`);
  };

  const handleSelectDefault = async (j: JavaVersion) => {
    try {
      await api.updateServerConfig({ javaPath: j.path, javaVersion: j.version, javaVendor: j.vendor, javaHome: j.javaHome });
      toast.success(`Default Java set to ${j.vendor} Java ${j.majorVersion}`);
      await loadConfig();
    } catch (err: any) {
      toast.error('Failed to set default Java');
    }
  };

  const isSelected = (j: JavaVersion) => {
    return serverConfig?.javaPath === j.path || serverConfig?.javaExecutable === j.path;
  };

  const isCompatible = (j: JavaVersion) => {
    if (!requiredJava) return true;
    return j.majorVersion >= requiredJava;
  };

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      PATH: 'System PATH',
      JAVA_HOME: 'JAVA_HOME',
      REGISTRY: 'Windows Registry',
      INSTALL_DIR: 'Install Directory',
      WHERE_COMMAND: 'where java',
      MANAGED: 'MineControl Managed',
      KNOWN_PATH: 'Known Path',
    };
    return labels[source] || source;
  };

  const getSourceColor = (source: string) => {
    const colors: Record<string, string> = {
      MANAGED: 'text-green-400 bg-green-400/10',
      JAVA_HOME: 'text-blue-400 bg-blue-400/10',
      PATH: 'text-yellow-400 bg-yellow-400/10',
      REGISTRY: 'text-purple-400 bg-purple-400/10',
    };
    return colors[source] || 'text-gray-400 bg-gray-400/10';
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
            <Coffee className="text-minecraft-400" size={24} />
            Java Manager
          </h1>
          <p className="text-gray-500 mt-1">Manage Java runtimes for Minecraft servers</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleAutoDetect} className="btn-ghost px-3 py-2 text-sm flex items-center gap-1.5">
            <RefreshCw size={14} />
            Rescan
          </button>
        </div>
      </div>

      {serverConfig && (
        <div className="bg-surface-800/50 border border-surface-700 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <Cpu size={20} className="text-blue-400" />
            <div className="flex-1">
              <p className="text-sm text-gray-300">
                Default Server Java:{' '}
                <span className="font-mono text-minecraft-400">
                  {serverConfig.javaExecutable && serverConfig.javaExecutable !== 'java'
                    ? `${serverConfig.javaVendor || ''} Java ${serverConfig.javaVersion || ''}`
                    : 'Auto-detected on launch'}
                </span>
              </p>
              {serverConfig.javaExecutable && serverConfig.javaExecutable !== 'java' && (
                <p className="text-xs text-gray-500 font-mono mt-0.5">{serverConfig.javaExecutable}</p>
              )}
            </div>
            {requiredJava && (
              <div className="text-right">
                <p className="text-xs text-gray-500">Required Java</p>
                <p className="text-sm font-bold text-minecraft-400">{requiredJava}+</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-surface-800/50 border border-surface-700 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <CheckCircle size={18} className="text-green-400" />
          Installed Java Versions
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : installed.length === 0 ? (
          <div className="text-center py-12">
            <Coffee size={40} className="mx-auto text-gray-600 mb-3" />
            <p className="text-gray-400 mb-2">No Java installations detected</p>
            <p className="text-gray-500 text-sm mb-4">Download Java to get started</p>
            <button onClick={() => handleDownload(21)} className="btn-primary px-4 py-2 text-sm">
              <Download size={14} className="inline mr-1.5" />
              Download Java 21 (Recommended)
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {installed.map((j, idx) => {
              const compat = isCompatible(j);
              return (
                <div key={idx} className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  isSelected(j) ? 'bg-minecraft-500/10 border-minecraft-500/30' :
                  !compat ? 'bg-surface-800 border-red-500/20' :
                  'bg-surface-800 border-surface-700 hover:border-surface-600'
                }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${
                      j.majorVersion >= 21 ? 'bg-green-500/20 text-green-400' :
                      j.majorVersion >= 17 ? 'bg-blue-500/20 text-blue-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {j.majorVersion}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-200">{j.vendor}</span>
                        <span className="text-xs text-gray-500">Java {j.version}</span>
                        {j.is64bit && <span className="text-[10px] text-gray-500 bg-surface-700 px-1.5 py-0.5 rounded">64-bit</span>}
                        {isSelected(j) && <span className="text-[10px] text-minecraft-400 bg-minecraft-500/10 px-1.5 py-0.5 rounded">Active</span>}
                        {!compat && requiredJava && <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Needs Java {requiredJava}+</span>}
                      </div>
                      <p className="text-xs text-gray-500 font-mono truncate max-w-md mt-0.5">{j.path}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${getSourceColor(j.source)}`}>
                          {getSourceLabel(j.source)}
                        </span>
                        {j.javaHome && <span className="text-[10px] text-gray-600">Home: {j.javaHome}</span>}
                        {j.arch && <span className="text-[10px] text-gray-600">{j.arch}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isSelected(j) && (
                      <button
                        onClick={() => handleSelectDefault(j)}
                        className="btn-ghost text-xs px-2.5 py-1.5"
                        title="Use as default"
                      >
                        <CheckCircle size={14} className="text-gray-400" />
                      </button>
                    )}
                    {j.source === 'MANAGED' && (
                      <button
                        onClick={() => handleRemove(j)}
                        disabled={removing === j.path}
                        className="btn-ghost text-xs px-2.5 py-1.5 text-red-400 hover:text-red-300"
                        title="Remove managed Java"
                      >
                        {removing === j.path ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-surface-800/50 border border-surface-700 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <Download size={18} className="text-blue-400" />
          Download Java
        </h2>
        <p className="text-sm text-gray-500 mb-4">Automatically download Eclipse Temurin JDK (recommended for Minecraft)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[8, 11, 17, 21].map(ver => (
            <button
              key={ver}
              onClick={() => handleDownload(ver)}
              disabled={downloading !== null}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-surface-700 bg-surface-800 hover:bg-surface-700 hover:border-minecraft-500/30 transition-all disabled:opacity-50"
            >
              <span className="text-lg font-bold text-gray-200">Java {ver}</span>
              {downloading === ver ? (
                <div className="flex flex-col items-center gap-1 w-full">
                  <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px] text-blue-400">{downloadProgress}%</span>
                </div>
              ) : (
                <span className="text-xs text-gray-500">Download</span>
              )}
            </button>
          ))}
        </div>
        {downloading !== null && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>Downloading Java {downloading}...</span>
              <span>{downloadProgress}%</span>
            </div>
            <div className="w-full h-2 bg-surface-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-minecraft-500 rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}
        <p className="text-xs text-gray-600 mt-3">
          Downloads from{' '}
          <a href="https://adoptium.net" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-0.5">
            Adoptium <ExternalLink size={10} />
          </a>
          {' '}— Eclipse Temurin JDK for Windows x64
        </p>
      </div>
    </div>
  );
}
