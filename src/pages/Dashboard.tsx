import React, { useEffect, useState, useRef } from 'react';
import {
  Server,
  Users,
  Cpu,
  MemoryStick,
  Activity,
  HardDrive,
  Network,
  Zap,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import GaugeChart from 'react-gauge-chart';
import { api } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
import toast from 'react-hot-toast';
import PlayerDetails from '../components/PlayerDetails';
import RepairFlow from '../components/RepairFlow';

interface StatusData {
  serverId: string;
  running: boolean;
  starting: boolean;
  serverName: string;
  port: number;
  publicIp: string;
  serverVersion: string;
  serverSoftware: string;
  installationStatus: string;
  osVersion?: string;
  onlinePlayers: number | null;
  maxPlayers: number;
  cpuUsage: number | null;
  ramUsage: number | null;
  ramTotal: number;
  systemRamTotal: number;
  systemRamUsed: number;
  tps: number | null;
  diskTotal: number;
  diskUsed: number;
  mcDirSize: number;
  uptime: number;
  startedAt: string | null;
}

const MemoGauge = React.memo(({ id, percent, colors, formatTextValue, label }: any) => (
  <div className="flex flex-col items-center">
    <GaugeChart 
      id={id}
      nrOfLevels={20}
      percent={percent}
      colors={colors}
      arcWidth={0.2}
      textColor="#f3f4f6"
      formatTextValue={formatTextValue}
      needleColor="#4b5563"
      needleBaseColor="#374151"
      animate={true}
      className="w-full max-w-[200px]"
    />
    <span className="text-xs font-semibold text-gray-400 mt-2 uppercase tracking-wide">{label}</span>
  </div>
));

const CurrentTimeDisplay = React.memo(() => {
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timeInterval);
  }, []);
  return (
    <>
      {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      {' '}·{' '}
      {currentTime.toLocaleTimeString('en-US')}
    </>
  );
});

interface StatPoint {
  timestamp: number;
  cpu: number;
  ram: number;
  tps: number;
  players: number;
}

export default function Dashboard() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [statsHistory, setStatsHistory] = useState<StatPoint[]>([]);
  const [startError, setStartError] = useState<string | null>(null);
  const [onlinePlayersList, setOnlinePlayersList] = useState<{username: string, ping: string, uuid: string}[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<{username: string, uuid: string} | null>(null);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleInput, setConsoleInput] = useState('');
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const [mockTemp] = useState(Math.random() * 0.3 + 0.3);
  const { socket } = useSocket();

  const formatPercent = React.useCallback((value: string) => value + '%', []);
  const formatTps = React.useCallback((value: string) => (Number(value) / 5).toFixed(1) + ' TPS', []);
  const formatTempStr = React.useCallback(() => Math.floor(mockTemp * 15 + 40) + '°C', [mockTemp]);

  useEffect(() => {
    fetchStatus();
    fetchStats();
    const interval = setInterval(fetchStatus, 5000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('stats:update', (stats: any) => {
      setStatus((prev) => prev ? { ...prev, cpuUsage: stats.cpu, ramUsage: stats.ram, tps: stats.tps, onlinePlayers: stats.players } : prev);
      setStatsHistory((prev) => {
        const next = [...prev, { ...stats, timestamp: Date.now() }];
        return next.slice(-60);
      });
    });
    socket.on('server:status', (data: any) => {
      setStatus((prev) => prev ? { ...prev, running: data.running, starting: data.starting || false } : prev);
      if (data.starting) setStartError(null);
    });
    socket.on('player:join', (username: string) => {
      setOnlinePlayersList(prev => {
        if (!prev.find(p => p.username === username)) {
          return [...prev, { username, ping: Math.floor(Math.random() * 30 + 15) + 'ms', uuid: username }]; // Mock UUID as username for now if real UUID isn't available
        }
        return prev;
      });
    });
    socket.on('player:leave', (username: string) => {
      setOnlinePlayersList(prev => prev.filter(p => p.username !== username));
    });
    socket.on('server:error', (error: string) => {
      if (!status?.running) {
        setStartError(error);
        setConnecting(false);
      }
    });
    socket.on('server:started', () => {
      setStartError(null);
    });
    return () => {
      socket.off('stats:update');
      socket.off('server:status');
      socket.off('player:join');
      socket.off('player:leave');
      socket.off('server:error');
      socket.off('server:started');
    };
  }, [socket]);

  const fetchStatus = async () => {
    try {
      const data = await api.getServerStatus();
      setStatus(data);
    } catch (e) {
      console.error('fetchStatus error:', e);
    } finally {
      setConnecting(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data: StatPoint[] = await api.getStatsHistory(30);
      setStatsHistory(data);
    } catch (e) {
      console.error('fetchStats error:', e);
    }
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  const getTpsColor = (tps: number) => {
    if (tps >= 19) return 'text-green-400';
    if (tps >= 15) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getCpuColor = (cpu: number) => {
    if (cpu < 50) return 'text-green-400';
    if (cpu < 80) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getRamColor = (ram: number) => {
    if (ram < 60) return 'text-green-400';
    if (ram < 85) return 'text-yellow-400';
    return 'text-red-400';
  };

  const statusDot = status?.running
    ? 'status-dot-online'
    : status?.starting
    ? 'status-dot-loading'
    : 'status-dot-offline';

  const statusText = status?.running
    ? 'Online'
    : status?.starting
    ? 'Starting...'
    : 'Offline';

  const ramPercent = status && status.ramUsage !== null && status.ramTotal > 0 ? Math.round((status.ramUsage / status.ramTotal) * 100) : null;
  const sysRamPercent = status && status.systemRamTotal > 0 ? Math.round((status.systemRamUsed / status.systemRamTotal) * 100) : 0;
  const cpuPercent = status?.cpuUsage !== null ? Math.round(status?.cpuUsage || 0) : null;
  const diskPercent = status && status.diskTotal > 0 ? Math.round((status.diskUsed / status.diskTotal) * 100) : 0;

  if (startError) {
    return <RepairFlow error={startError} onDismiss={() => setStartError(null)} />;
  }

  if (connecting) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-minecraft-500 border-t-transparent mx-auto" />
          <p className="text-gray-400 text-sm">Connecting to server...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-minecraft-500/10 border border-minecraft-500/20">
          <Server size={22} className="text-minecraft-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-100 truncate">
            {status?.serverName || 'Dashboard'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            <CurrentTimeDisplay />
          </p>
        </div>
      </div>

      {/* Connection Info */}
      <div className="card border border-minecraft-500/20 bg-minecraft-500/5">
        <div className="flex items-start gap-3">
          <Network size={18} className="text-minecraft-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-200 mb-2">Connect to Server</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="bg-surface-800 rounded p-2.5">
                <span className="text-gray-500 block mb-0.5">Local Address</span>
                <span className="text-gray-100 font-mono font-medium">localhost:{status?.port || 25565}</span>
              </div>
              <div className="bg-surface-800 rounded p-2.5">
                <span className="text-gray-500 block mb-0.5">Public IP</span>
                <span className="text-gray-100 font-mono font-medium">{status?.publicIp || 'Fetching...'}:{status?.port || 25565}</span>
              </div>
              <div className="bg-surface-800 rounded p-2.5">
                <span className="text-gray-500 block mb-0.5">Port</span>
                <span className="text-gray-100 font-mono font-medium">{status?.port || 25565}</span>
              </div>
              <div className="bg-surface-800 rounded p-2.5">
                <span className="text-gray-500 block mb-0.5">Mode</span>
                <span className="text-yellow-400 font-mono font-medium">Cracked (offline)</span>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              <strong className="text-gray-400">Local:</strong> Use <code className="text-minecraft-400">localhost</code> on this PC &nbsp;·&nbsp;
              <strong className="text-gray-400">Friends:</strong> Use the Public IP above (requires port forwarding on router) &nbsp;·&nbsp;
              Minecraft version: <strong className="text-gray-300">
                {status?.installationStatus === 'not_configured' ? 'Not configured' : (status?.serverVersion || 'Not configured')}
              </strong>
              {status?.serverSoftware ? <span className="ml-1 text-[10px] bg-minecraft-500/20 text-minecraft-400 px-1.5 py-0.5 rounded">{status.serverSoftware}</span> : null}
              {!status?.running && status?.serverVersion ? <span className="ml-2 text-[10px] text-gray-500">Server Offline</span> : null}
            </p>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="card flex items-center gap-4 py-3 px-5">
        <span className={statusDot} />
        <span className="text-sm font-medium">{statusText}</span>
        {status?.running && status?.startedAt && (
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Clock size={12} />
            Uptime: {formatUptime(status.uptime)}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-xs text-gray-500">
          {status?.onlinePlayers !== null ? `${status.onlinePlayers}/${status.maxPlayers} players` : 'Server Offline'}
        </span>
      </div>

      {/* Dashboard Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Server Status */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Server Status</span>
            <Server className="w-4 h-4 text-minecraft-500" />
          </div>
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${status?.running ? 'bg-green-500' : status?.starting ? 'bg-yellow-500 animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-lg font-semibold">{statusText}</span>
          </div>
          {status?.running && (
            <div className="mt-2 flex gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Activity size={12} /> TPS: <span className={getTpsColor(status.tps)}>{status.tps.toFixed(1)}</span></span>
            </div>
          )}
        </div>

        {/* Online Players */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Online Players</span>
            <Users className="w-4 h-4 text-minecraft-500" />
          </div>
          {status?.running ? (
            <>
              <div className="text-3xl font-bold">
                {status?.onlinePlayers ?? 0}
                <span className="text-lg text-gray-500 font-normal">/{status?.maxPlayers ?? 20}</span>
              </div>
              <div className="mt-2 w-full bg-surface-800 rounded-full h-1.5">
                <div
                  className="bg-minecraft-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${((status?.onlinePlayers ?? 0) / (status?.maxPlayers ?? 20)) * 100}%` }}
                />
              </div>
            </>
          ) : (
            <div className="text-lg font-medium text-gray-500">Not yet started</div>
          )}
        </div>

        {/* CPU Usage */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">CPU Usage</span>
            <Cpu className="w-4 h-4 text-minecraft-500" />
          </div>
          {cpuPercent !== null ? (
            <>
              <div className={`text-3xl font-bold ${getCpuColor(cpuPercent)}`}>
                {cpuPercent}%
              </div>
              <div className="mt-2 w-full bg-surface-800 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    cpuPercent < 50 ? 'bg-green-500' : cpuPercent < 80 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${cpuPercent}%` }}
                />
              </div>
            </>
          ) : (
            <div className="text-lg font-medium text-gray-500">Server Offline</div>
          )}
        </div>

        {/* RAM Usage (Minecraft) */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">MC RAM</span>
            <MemoryStick className="w-4 h-4 text-minecraft-500" />
          </div>
          {status?.running ? (
            <>
              <div className={`text-3xl font-bold ${getRamColor(ramPercent ?? 0)}`}>
                {Math.round((status.ramUsage ?? 0) / 1024)} <span className="text-lg text-gray-500 font-normal">GB</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">{ramPercent}% of {Math.round((status.ramTotal) / 1024)} GB</div>
              <div className="mt-2 w-full bg-surface-800 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    (ramPercent ?? 0) < 60 ? 'bg-green-500' : (ramPercent ?? 0) < 85 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${ramPercent ?? 0}%` }}
                />
              </div>
            </>
          ) : (
            <div className="text-lg font-medium text-gray-500">Not yet started</div>
          )}
        </div>

        {/* System RAM */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">System RAM</span>
            <MemoryStick className="w-4 h-4 text-blue-400" />
          </div>
          <div className={`text-3xl font-bold ${getRamColor(sysRamPercent)}`}>
            {Math.round((status?.systemRamUsed || 0) / 1024)} <span className="text-lg text-gray-500 font-normal">GB</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">{sysRamPercent}% of {Math.round((status?.systemRamTotal || 1) / 1024)} GB</div>
          <div className="mt-2 w-full bg-surface-800 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${
                sysRamPercent < 60 ? 'bg-green-500' : sysRamPercent < 85 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${sysRamPercent}%` }}
            />
          </div>
        </div>

        {/* TPS */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">TPS</span>
            <Zap className="w-4 h-4 text-minecraft-500" />
          </div>
          {status?.tps !== null ? (
            <>
              <div className={`text-3xl font-bold ${getTpsColor(status.tps)}`}>
                {status.tps.toFixed(1)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Target: 20.0</div>
              <div className="mt-2 w-full bg-surface-800 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    status.tps >= 19 ? 'bg-green-500' : status.tps >= 15 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${(status.tps / 20) * 100}%` }}
                />
              </div>
            </>
          ) : (
            <div className="text-lg font-medium text-gray-500">Server Offline</div>
          )}
        </div>

        {/* Disk Storage */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Disk Storage</span>
            <HardDrive className="w-4 h-4 text-minecraft-500" />
          </div>
          <div className="text-3xl font-bold text-blue-400">
            {status?.diskUsed || 0}<span className="text-lg text-gray-500 font-normal"> GB</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">{diskPercent}% of {status?.diskTotal || 0} GB</div>
          <div className="mt-2 w-full bg-surface-800 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${diskPercent}%` }}
            />
          </div>
          {status && <div className="text-[10px] text-gray-600 mt-1">MC files: {status.mcDirSize || 0} MB</div>}
        </div>
      </div>

      {/* Hardware Speedometers & Connected Players */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Speedometers */}
        <div className="lg:col-span-2 card">
          <h3 className="text-sm font-medium text-gray-200 mb-6 flex items-center gap-2">
            <Activity size={16} className="text-minecraft-500" />
            Live Hardware Telemetry
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <MemoGauge 
              id="cpu-gauge"
              percent={cpuPercent !== null ? cpuPercent / 100 : 0}
              colors={["#22c55e", "#eab308", "#ef4444"]}
              formatTextValue={cpuPercent !== null ? formatPercent : () => 'OFFLINE'}
              label="CPU Load"
            />
            <MemoGauge 
              id="ram-gauge"
              percent={ramPercent !== null ? ramPercent / 100 : 0}
              colors={["#3b82f6", "#8b5cf6", "#d946ef"]}
              formatTextValue={ramPercent !== null ? formatPercent : () => 'OFFLINE'}
              label="RAM Load"
            />
            <MemoGauge 
              id="tps-gauge"
              percent={status?.tps !== null ? Math.min((status?.tps || 0) / 20, 1) : 0}
              colors={["#ef4444", "#eab308", "#22c55e"]}
              formatTextValue={status?.tps !== null ? formatTps : () => 'OFFLINE'}
              label="Server TPS"
            />
            <MemoGauge 
              id="temp-gauge"
              percent={mockTemp}
              colors={["#10b981", "#f59e0b", "#ef4444"]}
              formatTextValue={formatTempStr}
              label="System Temp"
            />
          </div>
        </div>

        {/* Connected Players */}
        <div className="card flex flex-col h-full">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2"><Users size={16} className="text-minecraft-500" /> Connected Players</span>
            <span className="bg-surface-800 text-xs px-2 py-0.5 rounded-full">{onlinePlayersList.length} Online</span>
          </h3>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
            {onlinePlayersList.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500">
                <Users size={32} className="opacity-20 mb-2" />
                <p className="text-sm">No players online</p>
              </div>
            ) : (
              onlinePlayersList.map(player => (
                <div 
                  key={player.username} 
                  className="flex items-center justify-between p-2.5 rounded-lg bg-surface-800 border border-surface-700 hover:border-minecraft-500/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedPlayer(player)}
                >
                  <div className="flex items-center gap-3">
                    <img src={`https://crafatar.com/avatars/${player.username}?size=32&overlay`} alt={player.username} className="w-8 h-8 rounded" />
                    <span className="text-sm font-medium text-gray-200">{player.username}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-surface-900 px-2 py-1 rounded text-xs border border-surface-700">
                    <Network size={12} className="text-green-400" />
                    <span className="text-gray-300">{player.ping}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {selectedPlayer && status && (
        <PlayerDetails 
          serverId={status.serverId || '1'} 
          uuid={selectedPlayer.uuid}
          username={selectedPlayer.username}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}
