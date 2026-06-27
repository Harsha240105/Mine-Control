import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import {
  Monitor, Network, Globe, Wifi, Copy, Check, Shield, ShieldOff,
  ExternalLink, Play, RefreshCw, Loader, Server, ArrowRight,
  CheckCircle, XCircle, HelpCircle, Radio, Zap, Users, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';

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
  const [data, setData] = useState<ConnectionWizardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [pingResult, setPingResult] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      const wizardData = await api.getConnectionWizard();
      setData(wizardData);
    } catch (err: any) {
      toast.error('Failed to fetch connection data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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
      const result = await api.mcPing();
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

  const handleAddFirewall = async () => {
    try {
      await api.post('/server/firewall-add', {});
      toast.success('Firewall rule added!');
      handleRefresh();
    } catch (err: any) {
      toast.error(err.message);
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader size={24} className="text-minecraft-500 animate-spin" />
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
        <button onClick={handleRefresh} disabled={refreshing} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
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
                <button
                  onClick={() => handleCopy(
                    method === 'localhost' ? data?.allMethods.localhost.address || '' :
                    method === 'lan' ? data?.allMethods.lan.address || '' :
                    method === 'playit' ? data?.allMethods.playit.address || '' :
                    data?.allMethods.public.address || '', 'Recommended'
                  )}
                  className="p-2 rounded-lg bg-surface-800 text-gray-400 hover:text-gray-200 transition-colors"
                >
                  {copied === 'Recommended' ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>
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
            <button
              onClick={() => handleCopy(data?.allMethods.localhost.address || '', 'Localhost')}
              className="flex-1 text-xs bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              {copied === 'Localhost' ? 'Copied!' : 'Copy Address'}
            </button>
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
              <button
                onClick={() => handleCopy(data.lanAddress, 'LAN')}
                className="flex-1 text-xs bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                {copied === 'LAN' ? 'Copied!' : 'Copy Address'}
              </button>
            )}
            {!data?.firewallActive && data?.serverRunning && (
              <button
                onClick={handleAddFirewall}
                className="text-xs bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 px-3 py-1.5 rounded-lg transition-colors"
              >
                Open Firewall
              </button>
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
              <button
                onClick={() => handleCopy(data.playitAddress, 'Playit')}
                className="flex-1 text-xs bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                {copied === 'Playit' ? 'Copied!' : 'Copy Address'}
              </button>
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
          <button
            onClick={handleTestConnection}
            disabled={testingConnection || !data?.serverRunning}
            className="btn-primary flex items-center gap-2 text-sm mb-3"
          >
            {testingConnection ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
            {testingConnection ? 'Testing...' : 'Test Join'}
          </button>

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

        {/* Firewall Status */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-3 flex items-center gap-2">
            {data?.firewallActive ? <Shield size={16} className="text-green-400" /> : <ShieldOff size={16} className="text-red-400" />}
            Windows Firewall
          </h3>
          <div className="flex items-center gap-2 mb-3">
            {data?.firewallActive ? (
              <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={12} /> Active for port {data.port}</span>
            ) : (
              <span className="text-xs text-red-400 flex items-center gap-1"><XCircle size={12} /> No rule found</span>
            )}
          </div>
          {!data?.firewallActive && (
            <button onClick={handleAddFirewall} className="btn-primary flex items-center gap-2 text-sm bg-green-600/20 hover:bg-green-600/30 text-green-400">
              <Shield size={14} />
              Add Firewall Rule
            </button>
          )}
          {data?.firewallActive && (
            <p className="text-xs text-gray-500">Port {data.port} is open in Windows Firewall</p>
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
            <button
              onClick={handleValidate}
              disabled={validating}
              className="text-xs bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            >
              {validating ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {validating ? 'Validating...' : 'Run Checks'}
            </button>
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

      {/* Network Info */}
      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-3 flex items-center gap-2">
          <Wifi size={16} className="text-minecraft-500" />
          Network Information
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
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
        </div>
      </div>
    </div>
  );
}
