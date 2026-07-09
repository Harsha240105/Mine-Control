import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import {
  Monitor, Network, Globe, Wifi, Copy, Check, Shield, ShieldOff,
  ExternalLink, Play, RefreshCw, Server, ArrowRight,
  CheckCircle, XCircle, HelpCircle, Radio, Zap, Users, Clock,
  Activity, History, Settings, ChevronDown, ChevronUp, Loader2
} from 'lucide-react';
import { useActiveServer } from '../hooks/useActiveServer';
import { useSocket } from '../hooks/useSocket';
import toast from 'react-hot-toast';
import { Button } from '../components/ui/stateful-button';

interface ConnectionWizardData {
  localAddress: string;
  lanAddress: string;
  lanReachable: boolean;
  publicIp: string;
  port: number;
  onlineMode: boolean;
  serverRunning: boolean;
  serverVersion: string;
  playitAddress: string;
  playitEnabled: boolean;
  playitActive: boolean;
  playitLatency: number | null;
  firewallActive: boolean;
  firewallRuleExists: boolean;
  recommendedMethod: string;
  allMethods: {
    localhost: { available: boolean; address: string; status: string };
    lan: { available: boolean; address: string; status: string };
    playit: { available: boolean; address: string; status: string };
    public: { available: boolean; address: string; status: string };
  };
  validation: any;
}

const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
  ready: { icon: CheckCircle, color: 'text-green-400', label: 'Ready' },
  reachable: { icon: CheckCircle, color: 'text-green-400', label: 'Reachable' },
  online: { icon: CheckCircle, color: 'text-green-400', label: 'Online' },
  blocked: { icon: XCircle, color: 'text-red-400', label: 'Blocked' },
  offline: { icon: XCircle, color: 'text-gray-500', label: 'Offline' },
  not_configured: { icon: HelpCircle, color: 'text-yellow-400', label: 'Not Configured' },
  unknown: { icon: HelpCircle, color: 'text-gray-500', label: 'Unknown' },
};

export default function ConnectionWizard() {
  const { server: activeServer } = useActiveServer();
  const { socket } = useSocket();
  const [data, setData] = useState<ConnectionWizardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [pingResult, setPingResult] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [diagHistory, setDiagHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [firewallStatus, setFirewallStatus] = useState<any>(null);
  const [firewallBusy, setFirewallBusy] = useState<string | null>(null);
  const [preferredMode, setPreferredModeState] = useState('auto');

  const fetchData = useCallback(async () => {
    try {
      const [wizardData, diagData, fw, pref] = await Promise.all([
        api.getConnectionWizard(),
        api.getConnectionDiagnostics(10).catch(() => []),
        api.getFirewallStatus().catch(() => null),
        api.getPreferredMode().catch(() => ({ mode: 'auto' })),
      ]);
      setData(wizardData);
      setDiagHistory(Array.isArray(diagData) ? diagData : []);
      setFirewallStatus(fw);
      setPreferredModeState(pref.mode || 'auto');
    } catch (err: any) {
      toast.error('Failed to fetch connection data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!socket) return;
    socket.on('connection:update', () => fetchData());
    return () => { socket.off('connection:update', () => fetchData()); };
  }, [socket]);

  const handleRefresh = () => { setRefreshing(true); fetchData(); };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`Copied ${label}`);
    setTimeout(() => setCopied(null), 2000);
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

  const handleValidate = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const result = await api.validateConnection();
      setValidationResult(result);
    } catch (err: any) {
      toast.error('Validation failed: ' + err.message);
    }
    setValidating(false);
  };

  const handleFirewallAction = async (action: string, actionFn: () => Promise<any>, label: string) => {
    setFirewallBusy(action);
    try {
      const result = await actionFn();
      if (result.success) {
        toast.success(result.message || label);
        const fw = await api.getFirewallStatus().catch(() => null);
        setFirewallStatus(fw);
      } else {
        toast.error(result.message || `${label} failed`);
      }
    } catch (err: any) {
      toast.error(`${label}: ${err.message}`);
    }
    setFirewallBusy(null);
  };

  const handleSetPreferredMode = async (mode: string) => {
    try {
      await api.setPreferredMode(mode);
      setPreferredModeState(mode);
      toast.success(`Preferred mode set to ${mode}`);
    } catch { toast.error('Failed to set preferred mode'); }
  };

  const getStatusBadge = (method: string, status: string) => {
    const cfg = statusConfig[status] || statusConfig.unknown;
    const Icon = cfg.icon;
    return (
      <span className={`inline-flex items-center gap-1 text-xs ${cfg.color}`}>
        <Icon size={12} />
        {cfg.label}
      </span>
    );
  };

  if (!activeServer) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-gray-800 flex items-center justify-center">
            <Server className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-gray-400 text-sm font-medium">No server selected</p>
          <p className="text-gray-600 text-xs">Select a server from the Server Library to set up its connection.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="text-minecraft-500 animate-spin" />
          <span className="text-sm text-gray-400">Detecting connection methods...</span>
        </div>
      </div>
    );
  }

  const method = data?.recommendedMethod || 'localhost';
  const methodLabels: Record<string, string> = {
    localhost: 'Same Computer',
    lan: 'Local Network',
    playit: 'Playit Tunnel',
    public: 'Public IP',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radio size={20} className="text-minecraft-500" />
            <h2 className="text-xl font-bold text-gray-100">Connection Wizard</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Automatically detected the best way for your friends to connect
          </p>
        </div>
        <Button variant="secondary" onClick={handleRefresh} loading={refreshing} className="text-sm">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {/* Recommended Method Banner */}
      {data?.serverRunning && (
        <div className="card border border-green-500/30 bg-green-500/5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-400">
              <Radio size={20} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-green-400 mb-1">
                Recommended: {methodLabels[method]}
              </h3>
              <p className="text-xs text-green-300/80 mb-2">
                Share this address with your friends:
              </p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono text-green-300 bg-surface-800 px-3 py-1.5 rounded-lg">
                  {method === 'localhost' ? data?.allMethods.localhost.address :
                   method === 'lan' ? data?.allMethods.lan.address :
                   method === 'playit' ? data?.allMethods.playit.address :
                   data?.allMethods.public.address || 'N/A'}
                </code>
                <Button
                  variant="none"
                  onClick={() => handleCopy(
                    method === 'localhost' ? data?.allMethods.localhost.address || '' :
                    method === 'lan' ? data?.allMethods.lan.address || '' :
                    method === 'playit' ? data?.allMethods.playit.address || '' :
                    data?.allMethods.public.address || '', 'Recommended'
                  )}
                  className="p-2 rounded-lg bg-surface-800 text-gray-400 hover:text-gray-200 transition-colors"
                >
                  {copied === 'Recommended' ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="text-sm text-gray-400 mb-2 font-medium">Available Connection Methods</div>

      {/* Three Connection Method Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Scenario 1: Same Laptop */}
        <div className={`card-hover ${method === 'localhost' && data?.serverRunning ? 'ring-2 ring-green-500/30' : ''}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Monitor size={20} />
            </div>
            {getStatusBadge('localhost', data?.allMethods.localhost.status || 'offline')}
          </div>
          <h3 className="text-sm font-semibold text-gray-200 mb-1">Same Computer</h3>
          <p className="text-xs text-gray-500 mb-3">Play on this laptop</p>
          <code className="text-sm font-mono text-minecraft-400 bg-surface-800 px-3 py-1.5 rounded-lg block mb-3">
            {data?.allMethods.localhost.address || 'N/A'}
          </code>
          <div className="flex gap-2">
            <Button
              variant="none"
              onClick={() => handleCopy(data?.allMethods.localhost.address || '', 'Localhost')}
              className="flex-1 text-xs bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              {copied === 'Localhost' ? 'Copied!' : 'Copy Address'}
            </Button>
          </div>
        </div>

        {/* Scenario 2: LAN */}
        <div className={`card-hover ${method === 'lan' ? 'ring-2 ring-green-500/30' : ''}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-400">
              <Network size={20} />
            </div>
            <div className="flex items-center gap-1">
              {getStatusBadge('lan', data?.allMethods.lan.status || 'unknown')}
            </div>
          </div>
          <h3 className="text-sm font-semibold text-gray-200 mb-1">Local Network (LAN)</h3>
          <p className="text-xs text-gray-500 mb-3">Another laptop on same Wi-Fi</p>
          {data?.lanAddress ? (
            <code className="text-sm font-mono text-minecraft-400 bg-surface-800 px-3 py-1.5 rounded-lg block mb-3">
              {data.lanAddress}
            </code>
          ) : (
            <div className="text-xs text-yellow-400 bg-surface-800 px-3 py-1.5 rounded-lg block mb-3">
              No LAN IP detected
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {data?.lanAddress && (
              <Button
                variant="none"
                onClick={() => handleCopy(data.lanAddress, 'LAN')}
                className="flex-1 text-xs bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                {copied === 'LAN' ? 'Copied!' : 'Copy Address'}
              </Button>
            )}
            {!data?.firewallActive && data?.serverRunning && (
              <Button
                variant="none"
                onClick={() => handleFirewallAction('add', () => api.addFirewallRule(), 'Add Firewall Rule')}
                loading={firewallBusy === 'add'}
                className="text-xs bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 px-3 py-1.5 rounded-lg transition-colors"
              >
                Open Firewall
              </Button>
            )}
          </div>
        </div>

        {/* Scenario 3: Internet */}
        <div className={`card-hover ${method === 'playit' || method === 'public' ? 'ring-2 ring-green-500/30' : ''}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <Globe size={20} />
            </div>
            {getStatusBadge('playit', data?.allMethods.playit.status || 'not_configured')}
          </div>
          <h3 className="text-sm font-semibold text-gray-200 mb-1">Internet Friends</h3>
          <p className="text-xs text-gray-500 mb-3">Connect from anywhere</p>
          {data?.playitAddress ? (
            <code className="text-sm font-mono text-pink-400 bg-surface-800 px-3 py-1.5 rounded-lg block mb-3">
              {data.playitAddress}
            </code>
          ) : (
            <div className="text-xs text-yellow-400 bg-surface-800 px-3 py-1.5 rounded-lg block mb-3">
              No tunnel configured
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {data?.playitAddress && (
              <Button
                variant="none"
                onClick={() => handleCopy(data.playitAddress, 'Playit')}
                className="flex-1 text-xs bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                {copied === 'Playit' ? 'Copied!' : 'Copy Address'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Server Status & Connection Test */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Connection Test */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-3 flex items-center gap-2">
            <Zap size={16} className="text-minecraft-500" />
            Connection Test
          </h3>
          <Button
            variant="primary"
            onClick={handleTestConnection}
            disabled={testingConnection || !data?.serverRunning}
            loading={testingConnection}
            className="text-sm mb-3"
          >
            <Play size={14} />
            Test Join
          </Button>

          {pingResult && (
            <div className="space-y-2 text-sm">
              <div className={`flex items-center gap-2 ${pingResult.online ? 'text-green-400' : 'text-red-400'}`}>
                {pingResult.online ? <CheckCircle size={16} /> : <XCircle size={16} />}
                <span className="font-medium">{pingResult.online ? 'Server Reachable' : 'Server Unreachable'}</span>
              </div>
              {pingResult.online ? (
                <div className="bg-surface-800 rounded-lg p-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">Latency</span><span className="text-gray-200">{pingResult.latency}ms</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Version</span><span className="text-gray-200">{pingResult.version}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Players</span><span className="text-gray-200">{pingResult.playersOnline}/{pingResult.playersMax}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">MOTD</span><span className="text-gray-200 truncate max-w-[200px]">{pingResult.motd}</span></div>
                </div>
              ) : (
                <p className="text-xs text-red-300/80">{pingResult.error || 'Could not reach the Minecraft server'}</p>
              )}
            </div>
          )}

          {!pingResult && !testingConnection && data?.serverRunning && (
            <p className="text-xs text-gray-500">Click "Test Join" to verify the server is accepting connections</p>
          )}
          {!data?.serverRunning && (
            <p className="text-xs text-yellow-400">Start the server first to test connections</p>
          )}
        </div>

        {/* Firewall Management */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-3 flex items-center gap-2">
            {(firewallStatus?.exists || data?.firewallActive) ? <Shield size={16} className="text-green-400" /> : <ShieldOff size={16} className="text-red-400" />}
            Windows Firewall
          </h3>
          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Rule Status</span>
              <span className={firewallStatus?.exists ? 'text-green-400' : 'text-red-400'}>
                {firewallStatus?.exists ? 'Active' : 'Not Found'}
              </span>
            </div>
            {firewallStatus?.exists && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Port</span>
                <span className="text-gray-200 font-mono">{firewallStatus.port || data?.port || 25565}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Admin Rights</span>
              <span className={firewallStatus?.isAdmin ? 'text-green-400' : 'text-yellow-400'}>
                {firewallStatus?.isAdmin ? 'Available' : 'Limited'}
              </span>
            </div>
            {firewallStatus?.verification && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Port Verification</span>
                <span className={firewallStatus.verification.allowed ? 'text-green-400' : 'text-red-400'}>
                  {firewallStatus.verification.allowed ? 'Allowed' : 'Blocked'}
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!firewallStatus?.exists && (
              <Button
                variant="primary"
                onClick={() => handleFirewallAction('add', () => api.addFirewallRule(), 'Add Firewall Rule')}
                disabled={firewallBusy !== null}
                loading={firewallBusy === 'add'}
                className="text-xs"
              >
                <Shield size={12} />
                Add Rule
              </Button>
            )}
            {firewallStatus?.exists && (
              <>
                <Button
                  variant="none"
                  onClick={() => handleFirewallAction('remove', () => api.removeFirewallRule(), 'Remove Firewall Rule')}
                  disabled={firewallBusy !== null}
                  loading={firewallBusy === 'remove'}
                  className="text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <ShieldOff size={12} />
                  Remove
                </Button>
                <Button
                  variant="none"
                  onClick={() => handleFirewallAction('repair', () => api.repairFirewallRule(), 'Repair Firewall Rule')}
                  disabled={firewallBusy !== null}
                  loading={firewallBusy === 'repair'}
                  className="text-xs bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <RefreshCw size={12} />
                  Repair
                </Button>
                <Button
                  variant="none"
                  onClick={() => handleFirewallAction('verify', () => api.verifyFirewallPort(data?.port || 25565), 'Verify Firewall')}
                  disabled={firewallBusy !== null}
                  loading={firewallBusy === 'verify'}
                  className="text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Check size={12} />
                  Verify
                </Button>
              </>
            )}
            <Button
              variant="none"
              onClick={() => api.openFirewall().then(r => toast.success(r.message)).catch(() => toast.error('Failed to open firewall'))}
              className="text-xs bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              <ExternalLink size={12} />
              Open Settings
            </Button>
          </div>
          {!firewallStatus?.isAdmin && (
            <p className="text-[11px] text-yellow-500 mt-2">Run as Administrator to modify firewall rules</p>
          )}
        </div>
      </div>

      {/* Validation */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
            <Server size={16} className="text-minecraft-500" />
            Server Validation
          </h3>
          {data?.serverRunning && (
            <Button
              variant="none"
              onClick={handleValidate}
              disabled={validating}
              loading={validating}
              className="text-xs bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              <RefreshCw size={12} />
              Run Checks
            </Button>
          )}
        </div>

        {validationResult ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(validationResult).map(([key, val]: [string, any]) => (
              <div key={key} className={`bg-surface-800 rounded-lg p-3 border ${val.status === 'pass' ? 'border-green-500/20' : val.status === 'fail' ? 'border-red-500/20' : 'border-yellow-500/20'}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  {val.status === 'pass' ? <CheckCircle size={12} className="text-green-400" /> :
                   val.status === 'fail' ? <XCircle size={12} className="text-red-400" /> :
                   <HelpCircle size={12} className="text-yellow-400" />}
                  <span className="text-xs font-medium text-gray-300 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                </div>
                <p className="text-[11px] text-gray-500">{val.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            {data?.serverRunning ? 'Run validation checks to verify server connectivity' : 'Server must be running to validate'}
          </p>
        )}
      </div>

      {/* Network Info + Preferred Mode + Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Network Information */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-3 flex items-center gap-2">
            <Wifi size={16} className="text-minecraft-500" />
            Network Information
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-surface-800 rounded-lg p-2.5">
              <span className="text-gray-500 block mb-0.5">Local Address</span>
              <span className="text-gray-100 font-mono">{data?.localAddress || 'N/A'}</span>
            </div>
            <div className="bg-surface-800 rounded-lg p-2.5">
              <span className="text-gray-500 block mb-0.5">LAN Address</span>
              <span className="text-gray-100 font-mono">{data?.lanAddress || 'Not detected'}</span>
            </div>
            <div className="bg-surface-800 rounded-lg p-2.5">
              <span className="text-gray-500 block mb-0.5">Public IP</span>
              <span className="text-gray-100 font-mono">{data?.publicIp || 'Fetching...'}</span>
            </div>
            <div className="bg-surface-800 rounded-lg p-2.5">
              <span className="text-gray-500 block mb-0.5">Online Mode</span>
              <span className={data?.onlineMode ? 'text-green-400' : 'text-yellow-400'}>{data?.onlineMode ? 'Premium' : 'Offline (Cracked)'}</span>
            </div>
            <div className="bg-surface-800 rounded-lg p-2.5">
              <span className="text-gray-500 block mb-0.5">Playit Tunnel</span>
              <span className={data?.playitActive ? 'text-green-400' : 'text-gray-500'}>
                {data?.playitActive ? 'Connected' : 'Inactive'}
                {data?.playitLatency ? ` (${data.playitLatency}ms)` : ''}
              </span>
            </div>
            <div className="bg-surface-800 rounded-lg p-2.5">
              <span className="text-gray-500 block mb-0.5">LAN Reachable</span>
              <span className={data?.lanReachable ? 'text-green-400' : 'text-gray-500'}>{data?.lanReachable ? 'Yes' : 'No'}</span>
            </div>
          </div>
        </div>

        {/* Preferred Mode & Diagnostics History */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-3 flex items-center gap-2">
            <Settings size={16} className="text-minecraft-500" />
            Connection Preferences
          </h3>
          <div className="text-xs text-gray-500 mb-2">Preferred Connection Mode</div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {['auto', 'localhost', 'lan', 'playit', 'public'].map((mode) => (
              <Button
                key={mode}
                variant="none"
                onClick={() => handleSetPreferredMode(mode)}
                className={`text-xs px-3 py-2 rounded-lg transition-colors capitalize ${
                  preferredMode === mode
                    ? 'bg-minecraft-500/20 text-minecraft-400 border border-minecraft-500/30'
                    : 'bg-surface-800 text-gray-400 hover:text-gray-200 border border-transparent'
                }`}
              >
                {mode === 'auto' ? 'Auto Detect' : mode}
              </Button>
            ))}
          </div>

          <Button
            variant="none"
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            <History size={12} />
            Diagnostics History ({diagHistory.length})
            {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </Button>

          {showHistory && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
              {diagHistory.length === 0 ? (
                <p className="text-xs text-gray-500 py-2">No diagnostics history yet</p>
              ) : (
                diagHistory.map((d: any, i: number) => (
                  <div key={d.id || i} className="bg-surface-800 rounded p-2 text-[10px] space-y-0.5">
                    <div className="flex justify-between text-gray-400">
                      <span>{new Date(d.timestamp).toLocaleString()}</span>
                      <span className={d.server_running ? 'text-green-400' : 'text-gray-500'}>
                        {d.server_running ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <div className="text-gray-500">
                      {d.local_ping_ok ? `Ping: ${d.local_ping_latency}ms` : 'No ping'} 
                      {d.lan_reachable ? ' · LAN: Yes' : ''}
                      {d.playit_active ? ` · Playit: ${d.playit_latency || '?'}ms` : ''}
                      {d.tcp_port_open ? ' · Port Open' : ' · Port Closed'}
                    </div>
                    <div className="text-gray-600">
                      Recommended: <span className="text-minecraft-400">{d.recommended_method}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
