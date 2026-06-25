import React, { useEffect, useState } from 'react';
import { Wifi, Copy, Check, Globe, Monitor, Network, ExternalLink, ChevronDown, ChevronUp, Save, ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

interface ConnectionInfo {
  localAddress: string;
  lanAddress: string;
  publicIp: string;
  port: string;
  serverIp: string;
  onlineMode: boolean;
  serverVersion: string;
  playitAddress: string;
  playitEnabled: boolean;
  boundToLocalhost: boolean;
}

export default function Connection() {
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showPlayitConfig, setShowPlayitConfig] = useState(false);
  const [playitAddress, setPlayitAddress] = useState('');
  const [savingPlayit, setSavingPlayit] = useState(false);

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

  const ConnectionCard = ({ title, address, description, icon: Icon, color }: any) => (
    <div className="card-hover relative overflow-hidden">
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-lg ${color} flex-shrink-0`}>
          <Icon size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-200 mb-1">{title}</h3>
          <p className="text-xs text-gray-500 mb-2">{description}</p>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono text-minecraft-400 bg-surface-800 px-3 py-1.5 rounded-lg flex-1 truncate">
              {address || 'N/A'}
            </code>
            {address && (
              <button
                onClick={() => copyToClipboard(address, title)}
                className={`p-2 rounded-lg transition-colors ${
                  copied === title ? 'bg-green-500/20 text-green-400' : 'bg-surface-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {copied === title ? <Check size={16} /> : <Copy size={16} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (!info) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-gray-100">Connection Manager</h2>
        <p className="text-sm text-gray-500 mt-0.5">Share these addresses with friends to join your server</p>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ConnectionCard
          title="Localhost"
          address={info.localAddress}
          description="Connect from this computer only"
          icon={Monitor}
          color="bg-blue-500/10 text-blue-400"
        />
        <ConnectionCard
          title="LAN"
          address={info.lanAddress || 'No LAN IP detected'}
          description="Connect from same network"
          icon={Network}
          color="bg-green-500/10 text-green-400"
        />
        <ConnectionCard
          title="Public IP"
          address={info.publicIp ? `${info.publicIp}:${info.port}` : 'Fetching...'}
          description="Connect from internet (requires port forwarding)"
          icon={Globe}
          color="bg-purple-500/10 text-purple-400"
        />
        <div className="card-hover relative overflow-hidden cursor-pointer" onClick={() => setShowPlayitConfig(!showPlayitConfig)}>
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-pink-500/10 text-pink-400 flex-shrink-0">
              <ExternalLink size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-200 mb-1">Playit.gg Tunnel</h3>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowPlayitConfig(!showPlayitConfig); }}
                  className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPlayitConfig ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-2">Connect without port forwarding (recommended)</p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono bg-surface-800 px-3 py-1.5 rounded-lg flex-1 truncate"
                  style={info.playitAddress ? { color: '#f472b6' } : { color: '#ef4444' }}
                >
                  {info.playitAddress || 'Not configured'}
                </code>
                {info.playitAddress && (
                  <button
                    onClick={(e) => { e.stopPropagation(); copyToClipboard(info.playitAddress, 'Playit.gg'); }}
                    className={`p-2 rounded-lg transition-colors ${
                      copied === 'Playit.gg' ? 'bg-green-500/20 text-green-400' : 'bg-surface-800 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {copied === 'Playit.gg' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Playit.gg Configuration Panel */}
          {showPlayitConfig && (
            <div className="mt-4 pt-4 border-t border-surface-700/50 space-y-4">
              {/* Setup Guide */}
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

              {/* Address Input */}
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

              <p className="text-[11px] text-gray-500">
                Once configured, share the tunnel address with your friends. No port forwarding needed!
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-medium text-gray-200 mb-3 flex items-center gap-2">
          <Wifi size={16} className="text-minecraft-500" />
          Quick Connect Buttons
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => copyToClipboard(info.localAddress, 'Localhost')}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Copy size={14} />
            Copy Localhost
          </button>
          {info.lanAddress && (
            <button
              onClick={() => copyToClipboard(info.lanAddress, 'LAN')}
              className="btn-primary flex items-center gap-2 text-sm bg-green-600/20 hover:bg-green-600/30 text-green-400"
            >
              <Copy size={14} />
              Copy LAN
            </button>
          )}
          {info.publicIp && (
            <button
              onClick={() => copyToClipboard(`${info.publicIp}:${info.port}`, 'Public')}
              className="btn-primary flex items-center gap-2 text-sm bg-purple-600/20 hover:bg-purple-600/30 text-purple-400"
            >
              <Copy size={14} />
              Copy Public IP
            </button>
          )}
          {info.playitAddress && (
            <button
              onClick={() => copyToClipboard(info.playitAddress, 'Playit')}
              className="btn-primary flex items-center gap-2 text-sm bg-pink-600/20 hover:bg-pink-600/30 text-pink-400"
            >
              <Copy size={14} />
              Copy Playit Address
            </button>
          )}
        </div>
      </div>

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
    </div>
  );
}
