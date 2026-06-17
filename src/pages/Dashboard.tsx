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
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
import toast from 'react-hot-toast';

interface StatusData {
  running: boolean;
  starting: boolean;
  onlinePlayers: number;
  maxPlayers: number;
  cpuUsage: number;
  ramUsage: number;
  ramTotal: number;
  systemRamTotal: number;
  systemRamUsed: number;
  tps: number;
  diskTotal: number;
  diskUsed: number;
  mcDirSize: number;
  uptime: number;
  startedAt: string | null;
}

interface StatPoint {
  timestamp: number;
  cpu: number;
  ram: number;
  tps: number;
  players: number;
}

export default function Dashboard() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [statsHistory, setStatsHistory] = useState<StatPoint[]>([]);
  const { socket } = useSocket();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    fetchStatus();
    fetchStats();
    const interval = setInterval(fetchStatus, 5000);
    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(timeInterval);
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
    });
    return () => {
      socket.off('stats:update');
      socket.off('server:status');
    };
  }, [socket]);

  const fetchStatus = async () => {
    try {
      const data = await api.getServerStatus();
      setStatus(data);
    } catch {}
  };

  const fetchStats = async () => {
    try {
      const data: StatPoint[] = await api.getStatsHistory(30);
      setStatsHistory(data);
    } catch {}
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

  const ramPercent = status && status.ramTotal > 0 ? Math.round((status.ramUsage / status.ramTotal) * 100) : 0;
  const sysRamPercent = status && status.systemRamTotal > 0 ? Math.round((status.systemRamUsed / status.systemRamTotal) * 100) : 0;
  const cpuPercent = Math.round(status?.cpuUsage || 0);
  const diskPercent = status && status.diskTotal > 0 ? Math.round((status.diskUsed / status.diskTotal) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-100">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          {' '}·{' '}
          {currentTime.toLocaleTimeString('en-US')}
        </p>
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
          {status?.onlinePlayers || 0}/{status?.maxPlayers || 4} players
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
              <span className="flex items-center gap-1"><Activity size={12} /> TPS: <span className={getTpsColor(status.tps)}>{status.tps?.toFixed(1)}</span></span>
            </div>
          )}
        </div>

        {/* Online Players */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Online Players</span>
            <Users className="w-4 h-4 text-minecraft-500" />
          </div>
          <div className="text-3xl font-bold">
            {status?.onlinePlayers || 0}
            <span className="text-lg text-gray-500 font-normal">/{status?.maxPlayers || 4}</span>
          </div>
          <div className="mt-2 w-full bg-surface-800 rounded-full h-1.5">
            <div
              className="bg-minecraft-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${((status?.onlinePlayers || 0) / (status?.maxPlayers || 4)) * 100}%` }}
            />
          </div>
        </div>

        {/* CPU Usage */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">CPU Usage</span>
            <Cpu className="w-4 h-4 text-minecraft-500" />
          </div>
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
        </div>

        {/* RAM Usage (Minecraft) */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">MC RAM</span>
            <MemoryStick className="w-4 h-4 text-minecraft-500" />
          </div>
          <div className={`text-3xl font-bold ${getRamColor(ramPercent)}`}>
            {Math.round((status?.ramUsage || 0) / 1024)} <span className="text-lg text-gray-500 font-normal">GB</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">{ramPercent}% of {Math.round((status?.ramTotal || 8192) / 1024)} GB</div>
          <div className="mt-2 w-full bg-surface-800 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${
                ramPercent < 60 ? 'bg-green-500' : ramPercent < 85 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${ramPercent}%` }}
            />
          </div>
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
          <div className={`text-3xl font-bold ${getTpsColor(status?.tps || 20)}`}>
            {status?.tps?.toFixed(1) || '20.0'}
          </div>
          <div className="text-xs text-gray-500 mt-1">Target: 20.0</div>
          <div className="mt-2 w-full bg-surface-800 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${
                (status?.tps || 20) >= 19 ? 'bg-green-500' : (status?.tps || 20) >= 15 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${((status?.tps || 20) / 20) * 100}%` }}
            />
          </div>
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
          {status && <div className="text-[10px] text-gray-600 mt-1">MC files: {status.mcDirSize} MB</div>}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CPU / RAM Chart */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-minecraft-500" />
            System Resources (30 min)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={statsHistory}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="timestamp"
                  stroke="#475569"
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                  }}
                  fontSize={11}
                />
                <YAxis stroke="#475569" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelFormatter={(v) => new Date(v).toLocaleTimeString()}
                />
                <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="url(#cpuGrad)" name="CPU %" strokeWidth={2} />
                <Area type="monotone" dataKey="ram" stroke="#8b5cf6" fill="url(#ramGrad)" name="RAM MB" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* TPS / Players Chart */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <Activity size={16} className="text-minecraft-500" />
            Performance (30 min)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={statsHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="timestamp"
                  stroke="#475569"
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                  }}
                  fontSize={11}
                />
                <YAxis yAxisId="left" stroke="#475569" fontSize={11} domain={[0, 20]} />
                <YAxis yAxisId="right" orientation="right" stroke="#475569" fontSize={11} domain={[0, 'auto']} />
                <Tooltip
                  contentStyle={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelFormatter={(v) => new Date(v).toLocaleTimeString()}
                />
                <Line yAxisId="left" type="monotone" dataKey="tps" stroke="#22c55e" name="TPS" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="players" stroke="#f59e0b" name="Players" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
