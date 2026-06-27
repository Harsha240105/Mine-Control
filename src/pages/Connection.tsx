import React, { useEffect, useState } from 'react';
import {
  Wifi, Copy, Check, Globe, Monitor, Network, ExternalLink, ChevronDown, ChevronUp, Save,
  ExternalLink as ExternalLinkIcon, HardDrive, Shield, ShieldOff, Play, Loader,
  CheckCircle, XCircle, HelpCircle, Radio, Clock, Zap,
} from 'lucide-react';
import { api } from '../lib/api';
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
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showPlayitConfig, setShowPlayitConfig] = useState(false);
  const [playitAddress, setPlayitAddress] = useState('');
  const [savingPlayit, setSavingPlayit] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('local');
  const [testingConnection, setTestingConnection] = useState(false);
  const [pingResult, setPingResult] = useState<any>(null);

  useEffect(() => {
    fetchConnection();
    const interval = setInterval(fetchConnection, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (info) setPlayitAddress(info.playitAddress);
  }, [info?.playitAddress]);

  const fetchConnection = async () => {
    try {
      const data = await api.getConnectionInfo();
      setInfo(data);
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
      const result = await api.mcPing();
      setPingResult(result);
    } catch (err: any) {
      setPingResult({ online: false, error: err.message });
    }
    setTestingConnection(false);
  };

  const getConnectionQuality = () => {
    if (!info) return { label: 'Unknown', color: 'text-gray-500', dot: 'bg-gray-500' };
    if (info.boundToLocalhost && info.lanAddress) return { label: 'LAN', color: 'text-green-400', dot: 'bg-green-500' };
    if (info.playitEnabled) return { label: 'Playit Tunnel', color: 'text-pink-400', dot: 'bg-pink-500' };
    if (info.lanAddress) return { label: 'LAN Ready', color: 'text-green-400', dot: 'bg-green-500' };
    return { label: 'Local', color: 'text-blue-400', dot: 'bg-blue-500' };
  };

  const quality = getConnectionQuality();

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'local', label: 'Same Computer', icon: Monitor },
    { id: 'lan', label: 'Local Network', icon: Network },
    { id: 'internet', label: 'Internet', icon: Globe },
  ];

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
                        onClick={async () => {
                          try {
                            await api.post('/server/firewall-add', {});
                            toast.success('Firewall rule added!');
                            setTimeout(fetchConnection, 1000);
                          } catch (err: any) {
                            toast.error(err.message);
                          }
                        }}
                        className="text-xs bg-green-600/20 hover:bg-green-600/30 text-green-400 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Open Firewall
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

        {/* Firewall + Test */}
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            {info.firewallActive ? (
              <span className="flex items-center gap-1.5 text-xs text-green-400"><Shield size={14} /> Firewall Active</span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-red-400"><ShieldOff size={14} /> Firewall Blocked</span>
            )}
            <button onClick={handleTestConnection} disabled={testingConnection} className="flex items-center gap-1.5 text-xs bg-surface-800 hover:bg-surface-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">
              {testingConnection ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
              {testingConnection ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          {!info.firewallActive && (
            <button
              onClick={async () => {
                try {
                  await api.post('/server/firewall-add', {});
                  toast.success('Firewall rule added!');
                  setTimeout(fetchConnection, 1000);
                } catch (err: any) {
                  toast.error(err.message);
                }
              }}
              className="btn-primary flex items-center gap-2 text-sm bg-green-600/20 hover:bg-green-600/30 text-green-400"
            >
              <Shield size={14} /> Add Firewall Rule
            </button>
          )}

          {pingResult && (
            <div className={`mt-2 p-2 rounded-lg text-xs ${pingResult.online ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              <span className="flex items-center gap-1">
                {pingResult.online ? <CheckCircle size={12} /> : <XCircle size={12} />}
                {pingResult.online ? `Reachable (${pingResult.latency}ms) — ${pingResult.playersOnline}/${pingResult.playersMax} players` : pingResult.error || 'Unreachable'}
              </span>
            </div>
          )}
        </div>
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
            <li>Check if your ISP uses CGNAT (Jio, Airtel, BSNL) - use Playit.gg instead</li>
            <li>Verify server is running and bound to 0.0.0.0:25565</li>
          </ul>
        </div>
      </div>

      <BackupLocation />
    </div>
  );
}

function BackupLocation() {
  const [backupDataDir, setBackupDataDir] = useState('C:\\MineControl OS\\data');
  const [customFolderEnabled, setCustomFolderEnabled] = useState(false);
  const [customFolder, setCustomFolder] = useState('');
  const [saveToBoth, setSaveToBoth] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/backups/settings').then((data) => {
      if (data.dataDirectory) setBackupDataDir(data.dataDirectory);
      if (data.customFolder) setCustomFolder(data.customFolder);
      if (data.customFolderEnabled !== undefined) setCustomFolderEnabled(data.customFolderEnabled);
      if (data.saveToBoth !== undefined) setSaveToBoth(data.saveToBoth);
    }).catch(() => {});
  }, []);

  const handleBrowse = async () => {
    if (window.electronAPI?.selectDirectory) {
      const dir = await window.electronAPI.selectDirectory();
      if (dir) setCustomFolder(dir);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/backups/settings', { customFolder, customFolderEnabled, saveToBoth });
      toast.success('Backup location saved');
    } catch (err: any) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
          <HardDrive size={16} className="text-minecraft-500" />
          Backup Location
        </h3>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Current Backup Directory</label>
          <code className="text-sm font-mono text-minecraft-400 bg-surface-800 px-3 py-1.5 rounded-lg block">{backupDataDir}</code>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={customFolderEnabled} onChange={(e) => setCustomFolderEnabled(e.target.checked)}
            className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500" />
          <span className="text-sm text-gray-200">Custom Backup Folder</span>
        </label>
        {customFolderEnabled && (
          <div className="flex items-center gap-2 ml-6">
            <input type="text" value={customFolder} onChange={(e) => setCustomFolder(e.target.value)}
              placeholder="C:\\Backups\\MyServer" className="input flex-1 text-sm font-mono" />
            <button onClick={handleBrowse} className="btn-secondary text-sm whitespace-nowrap">Browse</button>
          </div>
        )}
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={saveToBoth} onChange={(e) => setSaveToBoth(e.target.checked)}
            className="rounded bg-surface-800 border-surface-600 text-minecraft-500 focus:ring-minecraft-500" />
          <div>
            <span className="text-sm text-gray-200">Save to both locations</span>
            <p className="text-xs text-gray-500">Backups go to both the default and custom location</p>
          </div>
        </label>
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
            <Save size={14} /> {saving ? 'Saving...' : 'Save Backup Location'}
          </button>
        </div>
      </div>
    </div>
  );
}
