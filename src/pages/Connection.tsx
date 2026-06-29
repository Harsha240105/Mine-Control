import { useEffect, useState } from 'react';
import {
  Wifi, Copy, Check, Globe, Monitor, Network, ExternalLink, ChevronDown, ChevronUp, Save,
  ExternalLink as ExternalLinkIcon, Shield, ShieldOff, Play, Loader,
  CheckCircle, XCircle, HelpCircle, Radio, Clock, Zap, Server,
  History, RefreshCw, Settings,
} from 'lucide-react';
import { api } from '../lib/api';
import { useActiveServer } from '../hooks/useActiveServer';
import { useSocket } from '../hooks/useSocket';
import toast from 'react-hot-toast';

interface ConnectionInfo {
  localAddress: string;
  lanAddress: string;
  publicIp: string;
  port: string;
  serverIp: string;
  onlineMode: boolean;
  enforceSecureProfile: boolean;
  firewallActive: boolean;
  serverVersion: string;
  playitAddress: string;
  playitEnabled: boolean;
  boundToLocalhost: boolean;
}

type Tab = 'local' | 'lan' | 'internet';

export default function Connection() {
  const { server: activeServer } = useActiveServer();
  const { socket } = useSocket();
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showPlayitConfig, setShowPlayitConfig] = useState(false);
  const [playitAddress, setPlayitAddress] = useState('');
  const [savingPlayit, setSavingPlayit] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('local');
  const [testingConnection, setTestingConnection] = useState(false);
  const [pingResult, setPingResult] = useState<any>(null);
  const [diagHistory, setDiagHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [firewallStatus, setFirewallStatus] = useState<any>(null);
  const [firewallBusy, setFirewallBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchConnection();
    fetchDiagnostics();
    const interval = setInterval(fetchConnection, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (info) setPlayitAddress(info.playitAddress);
  }, [info?.playitAddress]);

  useEffect(() => {
    if (!socket) return;
    socket.on('connection:update', () => { fetchConnection(); fetchDiagnostics(); });
    return () => { socket.off('connection:update', () => { fetchConnection(); fetchDiagnostics(); }); };
  }, [socket]);

  const fetchConnection = async () => {
    try {
      const data = await api.getConnectionInfo();
      setInfo(data);
    } catch {}
  };

  const fetchDiagnostics = async () => {
    try {
      const diag = await api.getConnectionDiagnostics(10);
      setDiagHistory(Array.isArray(diag) ? diag : []);
    } catch {}
  };

  const fetchFirewallStatus = async () => {
    try {
      setFirewallStatus(await api.getFirewallStatus());
    } catch {}
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success(`Copied ${label}`);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const savePlayitAddress = async () => {
    setSavingPlayit(true);
    try {
      await api.updateServerConfig({ playitAddress });
      toast.success('Playit.gg address saved');
      await fetchConnection();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSavingPlayit(false);
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setPingResult(null);
    try {
      const result = await api.testConnectionJoin();
      setPingResult(result);
    } catch (err: any) {
      setPingResult({ online: false, error: err.message });
    }
    setTestingConnection(false);
  };

  const handleFirewallAction = async (action: string, actionFn: () => Promise<any>, label: string) => {
    setFirewallBusy(action);
    try {
      const result = await actionFn();
      if (result.success) {
        toast.success(result.message || label);
        await fetchFirewallStatus();
        await fetchConnection();
      } else {
        toast.error(result.message || `${label} failed`);
      }
    } catch (err: any) {
      toast.error(`${label}: ${err.message}`);
    }
    setFirewallBusy(null);
  };

  const getConnectionQuality = () => {
    if (!info) return { label: 'Unknown', color: 'text-gray-500', dot: 'bg-gray-500' };
    if (info.playitEnabled) return { label: 'Playit Tunnel', color: 'text-pink-400', dot: 'bg-pink-500' };
    if (info.lanAddress && !info.boundToLocalhost) return { label: 'LAN', color: 'text-green-400', dot: 'bg-green-500' };
    return { label: 'Local', color: 'text-blue-400', dot: 'bg-blue-500' };
  };

  const quality = getConnectionQuality();

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'local', label: 'Same Computer', icon: Monitor },
    { id: 'lan', label: 'Local Network', icon: Network },
    { id: 'internet', label: 'Internet', icon: Globe },
  ];

  if (!activeServer) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-gray-800 flex items-center justify-center">
            <Server className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-gray-400 text-sm font-medium">No server selected</p>
          <p className="text-gray-600 text-xs">Select a server from the Server Library to view its connection info.</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radio size={20} className="text-minecraft-500" />
            <h2 className="text-xl font-bold text-gray-100">Connection Manager</h2>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Share these addresses with friends to join your server</p>
        </div>
      </div>

      {/* Connection Mode Indicator */}
      <div className="card bg-surface-900/50 border border-minecraft-500/10">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${quality.dot}`} />
          <span className="text-sm font-medium text-gray-200">Connection Mode: <span className={quality.color}>{quality.label}</span></span>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Wifi size={12} /> Port {info.port}
          </span>
        </div>
      </div>

      {/* Warnings */}
      {info.boundToLocalhost && (
        <div className="card border border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-white text-xs font-bold">!</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-400 mb-1">Warning: Server bound to localhost</h3>
              <p className="text-xs text-yellow-300/80">
                Your server is configured to listen only on localhost. Friends cannot connect from the internet.
                Set <code className="text-yellow-400 bg-surface-800 px-1 rounded">server-ip</code> to empty in server.properties.
              </p>
              <button
                onClick={() => copyToClipboard('server-ip=', 'Fix')}
                className="mt-2 text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 px-3 py-1 rounded-lg transition-colors"
              >
                Copy fix: server-ip=
              </button>
            </div>
          </div>
        </div>
      )}

      {!info.onlineMode && info.enforceSecureProfile && (
        <div className="card border border-red-500/30 bg-red-500/5">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-white text-xs font-bold">!</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-400 mb-1">Connection Blocked: enforce-secure-profile mismatch</h3>
              <p className="text-xs text-red-300/80">
                Your server has <code className="text-red-400 bg-surface-800 px-1 rounded">online-mode=false</code> (offline/cracked mode) but
                <code className="text-red-400 bg-surface-800 px-1 rounded ml-1">enforce-secure-profile=true</code>. This blocks cracked clients.
                Use the Compatibility Manager to toggle offline mode — both settings will sync automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Scenario Tabs */}
      <div className="card">
        <div className="flex border-b border-surface-700 mb-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-minecraft-500 text-minecraft-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="min-h-[120px]">
          {/* Same Computer Tab */}
          {activeTab === 'local' && (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400">
                  <Monitor size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-200 mb-1">Same Computer</h3>
                  <p className="text-xs text-gray-500 mb-3">MineControl OS and Minecraft run on this laptop</p>
                  <div className="flex items-center gap-2 mb-3">
                    <code className="text-sm font-mono text-minecraft-400 bg-surface-800 px-3 py-1.5 rounded-lg">
                      {info.localAddress}
                    </code>
                    <button
                      onClick={() => copyToClipboard(info.localAddress, 'Localhost')}
                      className={`p-2 rounded-lg transition-colors ${copied === 'Localhost' ? 'bg-green-500/20 text-green-400' : 'bg-surface-800 text-gray-400 hover:text-gray-200'}`}
                    >
                      {copied === 'Localhost' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-green-400">
                    <CheckCircle size={14} />
                    Connection Status: Ready
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LAN Tab */}
          {activeTab === 'lan' && (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-green-500/10 text-green-400">
                  <Network size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-200 mb-1">Two Laptops (Same Wi-Fi/LAN)</h3>
                  <p className="text-xs text-gray-500 mb-3">Another computer on the same network</p>
                  {info.lanAddress ? (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <code className="text-sm font-mono text-minecraft-400 bg-surface-800 px-3 py-1.5 rounded-lg">
                          {info.lanAddress}
                        </code>
                        <button
                          onClick={() => copyToClipboard(info.lanAddress, 'LAN')}
                          className={`p-2 rounded-lg transition-colors ${copied === 'LAN' ? 'bg-green-500/20 text-green-400' : 'bg-surface-800 text-gray-400 hover:text-gray-200'}`}
                        >
                          {copied === 'LAN' ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-green-400 mb-2">
                        <CheckCircle size={14} />
                        LAN Server Address: {info.lanAddress}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-yellow-400 mb-2">No LAN IP detected — check network connection</div>
                  )}
                  <div className="flex gap-2 mt-2">
                    {info.lanAddress && (
                      <button
                        onClick={() => copyToClipboard(info.lanAddress, 'LAN')}
                        className="text-xs bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Copy Address
                      </button>
                    )}
                    {!info.firewallActive && (
                      <button
                        onClick={() => handleFirewallAction('add', () => api.addFirewallRule(), 'Add Firewall Rule')}
                        disabled={firewallBusy !== null}
                        className="text-xs bg-green-600/20 hover:bg-green-600/30 text-green-400 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {firewallBusy === 'add' ? 'Adding...' : 'Open Firewall'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Internet Tab */}
          {activeTab === 'internet' && (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400">
                  <Globe size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-200 mb-1">Internet Friends</h3>
                  <p className="text-xs text-gray-500 mb-3">Connect from anywhere in the world</p>
                  {info.playitEnabled ? (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <code className="text-sm font-mono text-pink-400 bg-surface-800 px-3 py-1.5 rounded-lg">
                          {info.playitAddress}
                        </code>
                        <button
                          onClick={() => copyToClipboard(info.playitAddress, 'Playit')}
                          className={`p-2 rounded-lg transition-colors ${copied === 'Playit' ? 'bg-green-500/20 text-green-400' : 'bg-surface-800 text-gray-400 hover:text-gray-200'}`}
                        >
                          {copied === 'Playit' ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-pink-400 mb-2">
                        <CheckCircle size={14} />
                        Join Address: {info.playitAddress}
                      </div>
                      <button
                        onClick={() => setShowPlayitConfig(true)}
                        className="text-xs bg-pink-600/20 hover:bg-pink-600/30 text-pink-400 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Open Playit Dashboard
                      </button>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-xs text-yellow-400 flex items-center gap-2 mb-2">
                        <HelpCircle size={14} />
                        No tunnel configured — friends outside your network cannot connect yet
                      </div>
                      <button
                        onClick={() => setShowPlayitConfig(true)}
                        className="text-xs bg-pink-600/20 hover:bg-pink-600/30 text-pink-400 px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1"
                      >
                        Configure Playit.gg Tunnel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Playit.gg Configuration Panel */}
              {showPlayitConfig && (
                <div className="mt-4 pt-4 border-t border-surface-700/50 space-y-4">
                  <div className="p-4 rounded-lg bg-surface-800/50 border border-surface-700/50">
                    <h4 className="text-sm font-semibold text-gray-200 mb-3">How to set up Playit.gg</h4>
                    <ol className="space-y-2 text-xs text-gray-400 list-decimal list-inside">
                      <li>Go to <a href="https://playit.gg" target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300 underline underline-offset-2 inline-flex items-center gap-1">
                        playit.gg <ExternalLinkIcon size={10} />
                      </a> and create a free account</li>
                      <li>Download and run the Playit.gg agent on this PC</li>
                      <li>In the Playit.gg dashboard, create a new tunnel pointing to <code className="text-minecraft-400 bg-surface-900 px-1 rounded">localhost:{info?.port || 25565}</code></li>
                      <li>Copy the tunnel address (e.g. <code className="text-minecraft-400 bg-surface-900 px-1 rounded">something.playit.gg</code>)</li>
                      <li>Paste it below and save</li>
                    </ol>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={playitAddress}
                      onChange={(e) => setPlayitAddress(e.target.value)}
                      placeholder="e.g. your-server.playit.gg"
                      className="input flex-1 text-sm font-mono"
                    />
                    <button
                      onClick={savePlayitAddress}
                      disabled={savingPlayit}
                      className="btn-primary flex items-center gap-2 text-sm whitespace-nowrap"
                    >
                      <Save size={14} />
                      {savingPlayit ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick Connect + Firewall Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quick Connect */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-3 flex items-center gap-2">
            <Zap size={16} className="text-minecraft-500" />
            Quick Connect
          </h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => copyToClipboard(info.localAddress, 'Localhost')} className="btn-primary flex items-center gap-2 text-sm">
              <Copy size={14} /> Copy Localhost
            </button>
            {info.lanAddress && (
              <button onClick={() => copyToClipboard(info.lanAddress, 'LAN')} className="btn-primary flex items-center gap-2 text-sm bg-green-600/20 hover:bg-green-600/30 text-green-400">
                <Copy size={14} /> Copy LAN
              </button>
            )}
            {info.publicIp && (
              <button onClick={() => copyToClipboard(`${info.publicIp}:${info.port}`, 'Public')} className="btn-primary flex items-center gap-2 text-sm bg-purple-600/20 hover:bg-purple-600/30 text-purple-400">
                <Copy size={14} /> Copy Public IP
              </button>
            )}
            {info.playitAddress && (
              <button onClick={() => copyToClipboard(info.playitAddress, 'Playit')} className="btn-primary flex items-center gap-2 text-sm bg-pink-600/20 hover:bg-pink-600/30 text-pink-400">
                <Copy size={14} /> Copy Playit
              </button>
            )}
          </div>
        </div>

        {/* Firewall + Test + Diagnostics */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className={`flex items-center gap-1.5 text-xs ${firewallStatus?.exists || info?.firewallActive ? 'text-green-400' : 'text-red-400'}`}>
              {firewallStatus?.exists || info?.firewallActive ? <Shield size={14} /> : <ShieldOff size={14} />}
              {firewallStatus?.exists || info?.firewallActive ? 'Firewall Active' : 'Firewall Blocked'}
            </span>
            {firewallStatus?.isAdmin === false && (
              <span className="text-[10px] text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded">Limited</span>
            )}
            <button onClick={handleTestConnection} disabled={testingConnection} className="flex items-center gap-1.5 text-xs bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">
              {testingConnection ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
              {testingConnection ? 'Testing...' : 'Test Connection'}
            </button>
            <button onClick={() => { fetchFirewallStatus(); fetchDiagnostics(); }} className="flex items-center gap-1.5 text-xs bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {!firewallStatus?.exists && !info?.firewallActive && (
            <button
              onClick={() => handleFirewallAction('add', () => api.addFirewallRule(), 'Add Firewall Rule')}
              disabled={firewallBusy !== null}
              className="btn-primary flex items-center gap-2 text-sm bg-green-600/20 hover:bg-green-600/30 text-green-400"
            >
              {firewallBusy === 'add' ? <Loader size={14} className="animate-spin" /> : <Shield size={14} />}
              {firewallBusy === 'add' ? 'Adding...' : 'Add Firewall Rule'}
            </button>
          )}

          {firewallStatus?.exists && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleFirewallAction('remove', () => api.removeFirewallRule(), 'Remove Firewall Rule')}
                disabled={firewallBusy !== null}
                className="text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
              >
                {firewallBusy === 'remove' ? <Loader size={12} className="animate-spin" /> : <ShieldOff size={12} />}
                {firewallBusy === 'remove' ? 'Removing...' : 'Remove Rule'}
              </button>
              <button
                onClick={() => handleFirewallAction('repair', () => api.repairFirewallRule(), 'Repair Firewall Rule')}
                disabled={firewallBusy !== null}
                className="text-xs bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
              >
                {firewallBusy === 'repair' ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Repair
              </button>
              <button
                onClick={() => api.openFirewall().then(r => toast.success(r.message)).catch(() => toast.error('Failed'))}
                className="text-xs bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
              >
                <ExternalLink size={12} /> Windows Firewall
              </button>
            </div>
          )}

          {pingResult && (
            <div className={`mt-2 p-2 rounded-lg text-xs ${pingResult.online ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              <span className="flex items-center gap-1">
                {pingResult.online ? <CheckCircle size={12} /> : <XCircle size={12} />}
                {pingResult.online ? `Reachable (${pingResult.latency}ms) — ${pingResult.playersOnline}/${pingResult.playersMax} players` : pingResult.error || 'Unreachable'}
              </span>
              {pingResult.version && <span className="text-[10px] text-gray-500 ml-2">v{pingResult.version}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Diagnostics History */}
      <div className="card">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center justify-between w-full"
        >
          <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
            <History size={16} className="text-minecraft-500" />
            Diagnostics History ({diagHistory.length})
          </h3>
          {showHistory ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
        </button>
        {showHistory && (
          <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
            {diagHistory.length === 0 ? (
              <p className="text-xs text-gray-500 py-2">No diagnostics history yet. Diagnostics are recorded automatically.</p>
            ) : (
              diagHistory.map((d: any, i: number) => (
                <div key={d.id || i} className="bg-surface-800 rounded-lg p-3 text-xs border border-surface-700/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={d.server_running ? 'w-2 h-2 rounded-full bg-green-500' : 'w-2 h-2 rounded-full bg-gray-500'} />
                      <span className="text-gray-300">{new Date(d.timestamp).toLocaleString()}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      d.recommended_method === 'localhost' ? 'bg-blue-500/20 text-blue-400' :
                      d.recommended_method === 'lan' ? 'bg-green-500/20 text-green-400' :
                      d.recommended_method === 'playit' ? 'bg-pink-500/20 text-pink-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {d.recommended_method}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[10px] text-gray-500">
                    <div>Ping: {d.local_ping_ok ? `${d.local_ping_latency}ms` : 'No'}</div>
                    <div>Port: {d.tcp_port_open ? 'Open' : 'Closed'}</div>
                    <div>LAN: {d.lan_reachable ? 'Yes' : 'No'}</div>
                    <div>Playit: {d.playit_active ? `${d.playit_latency || '?'}ms` : 'Off'}</div>
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1">
                    Local: {d.local_address} · LAN: {d.lan_address || 'N/A'} · Public: {d.public_ip || 'N/A'}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Troubleshooting */}
      <div className="card bg-surface-900/50">
        <h3 className="text-sm font-medium text-gray-200 mb-3">Connection Troubleshooting</h3>
        <div className="space-y-2 text-xs text-gray-400">
          <p><strong className="text-gray-300">Friend getting "Connection timed out"?</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Make sure <code className="text-minecraft-400 bg-surface-800 px-1 rounded">server-ip</code> is EMPTY in server.properties</li>
            <li>Open port 25565 in Windows Firewall for Java</li>
            <li>Set up port forwarding on your router (TCP 25565)</li>
            <li>Check if your ISP uses CGNAT (Jio, Airtel, BSNL) — use Playit.gg instead</li>
            <li>Verify server is running and bound to 0.0.0.0:25565</li>
          </ul>
        </div>
      </div>

    </div>
  );
}
