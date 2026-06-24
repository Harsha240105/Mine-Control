import React, { useEffect, useState } from 'react';
import { Wifi, Copy, Check, Globe, Monitor, Network, ExternalLink } from 'lucide-react';
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

  useEffect(() => {
    fetchConnection();
    const interval = setInterval(fetchConnection, 10000);
    return () => clearInterval(interval);
  }, []);

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
        <ConnectionCard
          title="Playit.gg Tunnel"
          address={info.playitAddress || 'Not configured'}
          description="Connect without port forwarding (recommended)"
          icon={ExternalLink}
          color="bg-pink-500/10 text-pink-400"
        />
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
