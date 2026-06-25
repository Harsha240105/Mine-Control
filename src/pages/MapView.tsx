import React, { useState, useEffect } from 'react';
import { Map, ExternalLink, RefreshCw, Info, Wifi, WifiOff, Globe } from 'lucide-react';
import { api } from '../lib/api';

const MAP_PLUGINS = [
  { id: 'bluemap', name: 'BlueMap', defaultPort: 8100, path: '/', check: '/states' },
  { id: 'dynmap', name: 'Dynmap', defaultPort: 8123, path: '/', check: '/up/worlds.json' },
  { id: 'squaremap', name: 'SquareMap', defaultPort: 8080, path: '/', check: '/tiles/' },
  { id: 'pl3xmap', name: 'Pl3xMap', defaultPort: 8080, path: '/', check: '/maps/' },
];

export default function MapView() {
  const [selectedPlugin, setSelectedPlugin] = useState('bluemap');
  const [customPort, setCustomPort] = useState('8100');
  const [mapUrl, setMapUrl] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [config, setConfig] = useState<any>({});
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    checkMapStatus();
  }, [selectedPlugin, customPort]);

  const fetchConfig = async () => {
    try {
      const c = await api.getServerConfig();
      setConfig(c);
      if (c.mapPlugin) {
        setSelectedPlugin(c.mapPlugin);
        const p = MAP_PLUGINS.find(mp => mp.id === c.mapPlugin);
        if (p) setCustomPort(c.mapPort || String(p.defaultPort));
      }
    } catch {}
  };

  const checkMapStatus = async () => {
    setChecking(true);
    setStatus('unknown');
    const plugin = MAP_PLUGINS.find(p => p.id === selectedPlugin) || MAP_PLUGINS[0];
    const url = `http://localhost:${customPort}${plugin.check || plugin.path}`;
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
      setStatus(res.ok ? 'online' : 'offline');
    } catch {
      setStatus('offline');
    }
    setChecking(false);
  };

  const plugin = MAP_PLUGINS.find(p => p.id === selectedPlugin) || MAP_PLUGINS[0];
  const url = mapUrl || `http://localhost:${customPort}${plugin.path}`;

  const handleOpenExternal = () => {
    window.open(url, '_blank');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-100">Live World Map</h2>
            <p className="text-sm text-gray-500 mt-0.5">View your Minecraft world in your browser</p>
          </div>
          {checking ? (
            <div className="w-4 h-4 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
          ) : status === 'online' ? (
            <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full"><Wifi size={12} /> Online</span>
          ) : status === 'offline' ? (
            <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-full"><WifiOff size={12} /> Offline</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedPlugin}
            onChange={(e) => setSelectedPlugin(e.target.value)}
            className="select text-sm"
          >
            {MAP_PLUGINS.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input
            type="number"
            value={customPort}
            onChange={(e) => setCustomPort(e.target.value)}
            className="input w-20 text-sm"
            placeholder="Port"
            min={1}
            max={65535}
          />
          <button onClick={() => { setMapUrl(''); checkMapStatus(); }} className="btn-ghost p-2" title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button onClick={handleOpenExternal} className="btn-primary flex items-center gap-2 text-sm">
            <ExternalLink size={14} />
            Open in Browser
          </button>
        </div>
      </div>

      <div className="card border border-minecraft-500/20 bg-minecraft-500/5 mb-4">
        <div className="flex items-start gap-3">
          <Info size={16} className="text-minecraft-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-gray-400">
            <p>
              Install a map plugin in your server's <code className="text-minecraft-400 bg-surface-800 px-1 rounded">plugins/</code> folder,
              restart the server, and the map will appear here.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
              <span><strong className="text-gray-200">BlueMap:</strong> port 8100</span>
              <span><strong className="text-gray-200">Dynmap:</strong> port 8123</span>
              <span><strong className="text-gray-200">SquareMap:</strong> port 8080</span>
              <span><strong className="text-gray-200">Pl3xMap:</strong> port 8080</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 card p-0 overflow-hidden bg-surface-900 relative">
        {loadError || status === 'offline' ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Map size={48} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">Map not available</p>
            <p className="text-xs mt-1">Make sure the map plugin is installed and the server is running</p>
            <p className="text-xs text-gray-600 mt-2">
              Expected at: <code className="text-minecraft-400 bg-surface-800 px-1.5 py-0.5 rounded">{url}</code>
            </p>
            <button
              onClick={() => { setLoadError(false); checkMapStatus(); }}
              className="mt-3 text-xs bg-minecraft-600/20 hover:bg-minecraft-600/30 text-minecraft-400 px-3 py-1.5 rounded-lg transition-colors"
            >
              <RefreshCw size={12} className="inline mr-1" />
              Retry
            </button>
          </div>
        ) : (
          <iframe
            src={url}
            className="w-full h-full border-0"
            title="Live World Map"
            onError={() => setLoadError(true)}
            sandbox="allow-scripts allow-same-origin"
          />
        )}
      </div>
    </div>
  );
}