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
  Radio,
  Shield,
  ShieldOff,
  CheckCircle,
  XCircle,
  UserPlus,
  UserMinus,
  Ban,
  LogOut,
  Globe,
  Save,
  RotateCcw,
  MessageSquare,
  MessageCircle,
  Bug,
  Lightbulb,
  AlertTriangle,
  Upload,
  BookOpen,
  RefreshCw,
  Download,
  ArrowLeft,
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import GaugeChart from 'react-gauge-chart';
import { api } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
import { useActiveServer } from '../hooks/useActiveServer';
import toast from 'react-hot-toast';
import PlayerDetails from '../components/PlayerDetails';
import RepairFlow from '../components/RepairFlow';

interface StatusData {
  serverId: string;
  state: string;
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
  const { server: activeServer } = useActiveServer();
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
  const [recentJoins, setRecentJoins] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [playerStats, setPlayerStats] = useState({ total: 0, online: 0, pending: 0, banned: 0 });
  const [worldInfo, setWorldInfo] = useState<any>(null);
  const [backupStats, setBackupStats] = useState<any>(null);
  const [discordStatus, setDiscordStatus] = useState<any>(null);
  const [feedbackStats, setFeedbackStats] = useState<any>(null);
  const [guideWidget, setGuideWidget] = useState<any>(null);
  const [privacyWidget, setPrivacyWidget] = useState<any>(null);
  const [updateWidget, setUpdateWidget] = useState<any>(null);
  const [storageWidget, setStorageWidget] = useState<any>(null);
  const { socket } = useSocket();
  const [connMode, setConnMode] = useState<{ label: string; color: string; dot: string; quality: string }>({ label: 'Unknown', color: 'text-gray-500', dot: 'bg-gray-500', quality: 'unknown' });

  const formatPercent = React.useCallback((value: string) => value + '%', []);
  const formatTps = React.useCallback((value: string) => (Number(value) / 5).toFixed(1) + ' TPS', []);
  const formatTempStr = React.useCallback(() => Math.floor(mockTemp * 15 + 40) + '°C', [mockTemp]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (connecting) {
        setConnecting(false);
      }
    }, 10000);
    fetchStatus();
    fetchStats();
    fetchConnectionMode();
    fetchRecentJoins();
    fetchRecentActivity();
    fetchPlayerStats();
    fetchWorldInfo();
    fetchBackupStats();
    fetchDiscordStatus();
    fetchFeedbackStats();
    fetchGuideWidget();
    fetchPrivacyWidget();
    fetchUpdateWidget();
    fetchStorageWidget();
    const interval = setInterval(fetchStatus, 5000);
    const connInterval = setInterval(fetchConnectionMode, 15000);
    const activityInterval = setInterval(fetchRecentActivity, 15000);
    const statsInterval = setInterval(fetchPlayerStats, 10000);
    const worldInterval = setInterval(fetchWorldInfo, 15000);
    const backupInterval = setInterval(fetchBackupStats, 20000);
    const feedbackInterval = setInterval(fetchFeedbackStats, 30000);
    return () => {
      clearInterval(interval);
      clearInterval(connInterval);
      clearInterval(activityInterval);
      clearInterval(statsInterval);
      clearInterval(worldInterval);
      clearInterval(backupInterval);
      clearInterval(feedbackInterval);
      clearTimeout(timeoutId);
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
    socket.on('server:state', (state: string) => {
      setStatus((prev) => prev ? { ...prev, state, running: state === 'running', starting: state === 'starting' } : prev);
      if (state === 'running' || state === 'starting') setStartError(null);
    });
    socket.on('worlds:update', fetchWorldInfo);
    socket.on('world:created', fetchWorldInfo);
    socket.on('world:deleted', fetchWorldInfo);
    socket.on('world:updated', fetchWorldInfo);
    socket.on('backup:created', fetchBackupStats);
    socket.on('backup:restored', fetchBackupStats);
    socket.on('backup:cleanup', fetchBackupStats);
    socket.on('connection:update', () => fetchConnectionMode());
    socket.on('discord:update', (status: any) => setDiscordStatus(status));
    socket.on('feedback:update', fetchFeedbackStats);
    socket.on('feedback:created', fetchFeedbackStats);
    return () => {
      socket.off('stats:update');
      socket.off('server:status');
      socket.off('player:join');
      socket.off('player:leave');
      socket.off('server:error');
      socket.off('server:started');
      socket.off('server:state');
      socket.off('worlds:update', fetchWorldInfo);
      socket.off('world:created', fetchWorldInfo);
      socket.off('world:deleted', fetchWorldInfo);
      socket.off('world:updated', fetchWorldInfo);
      socket.off('backup:created', fetchBackupStats);
      socket.off('backup:restored', fetchBackupStats);
      socket.off('backup:cleanup', fetchBackupStats);
      socket.off('connection:update', () => fetchConnectionMode());
      socket.off('discord:update');
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

  const fetchConnectionMode = async () => {
    try {
      const data = await api.getConnectionWizard();
      let label = 'Local';
      let color = 'text-blue-400';
      let dot = 'bg-blue-500';
      let quality = 'unknown';

      if (data.serverRunning) {
        if (data.playitActive) {
          label = 'Playit Tunnel';
          color = 'text-pink-400';
          dot = 'bg-pink-500';
          quality = 'online';
        } else if (data.lanReachable) {
          label = 'LAN';
          color = 'text-green-400';
          dot = 'bg-green-500';
          quality = 'reachable';
        } else if (data.allMethods.localhost.status === 'ready') {
          label = 'Local';
          color = 'text-blue-400';
          dot = 'bg-blue-500';
          quality = 'ready';
        } else {
          label = 'Offline';
          color = 'text-gray-500';
          dot = 'bg-gray-500';
          quality = 'offline';
        }
      } else {
        label = 'Offline';
        color = 'text-gray-500';
        dot = 'bg-gray-500';
        quality = 'offline';
      }

      setConnMode({ label, color, dot, quality });
    } catch {}
  };

  const fetchWorldInfo = async () => {
    try { setWorldInfo(await api.getCurrentWorldInfo()); } catch {}
  };

  const fetchBackupStats = async () => {
    try { setBackupStats(await api.getBackupStats()); } catch {}
  };

  const fetchDiscordStatus = async () => {
    try { setDiscordStatus(await api.getDiscordStatus()); } catch {}
  };

  const fetchFeedbackStats = async () => {
    try { setFeedbackStats(await api.getFeedbackStats()); } catch {}
  };

  const fetchGuideWidget = async () => {
    try { setGuideWidget(await api.getGuideDashboardWidget()); } catch {}
  };

  const fetchPrivacyWidget = async () => {
    try { setPrivacyWidget(await api.getPrivacyDashboardWidget()); } catch {}
  };

  const fetchUpdateWidget = async () => {
    try { setUpdateWidget(await api.getUpdateDashboardWidget()); } catch {}
  };

  const fetchStorageWidget = async () => {
    try { setStorageWidget(await api.getUninstallDashboardWidget()); } catch {}
  };

  const fetchRecentJoins = async () => {
    try { setRecentJoins(await api.getRecentJoins()); } catch {}
  };

  const fetchRecentActivity = async () => {
    try { setRecentActivity(await api.getActivity()); } catch {}
  };

  const fetchPlayerStats = async () => {
    try {
      const [players, pending] = await Promise.all([
        api.getPlayers(),
        api.getPendingCount(),
      ]);
      setPlayerStats({
        total: players.length,
        online: players.filter((p: any) => p.status === 'online').length,
        pending: pending.count,
        banned: players.filter((p: any) => p.status === 'banned').length,
      });
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

  const getStatusDisplay = (s: StatusData | null) => {
    if (!s) return { dot: 'status-dot-offline', text: 'Offline' };
    switch (s.state) {
      case 'running': return { dot: 'status-dot-online', text: 'Online' };
      case 'starting': return { dot: 'status-dot-loading', text: 'Starting...' };
      case 'stopping': return { dot: 'status-dot-loading', text: 'Stopping...' };
      case 'failed': return { dot: 'status-dot-offline', text: 'Failed' };
      default: return { dot: 'status-dot-offline', text: 'Offline' };
    }
  };
  const { dot: statusDot, text: statusText } = getStatusDisplay(status);

  const ramPercent = status?.ramUsage != null && (status.ramTotal ?? 0) > 0 ? Math.round((status.ramUsage / status.ramTotal) * 100) : null;
  const sysRamPercent = (status?.systemRamTotal ?? 0) > 0 ? Math.round(((status?.systemRamUsed ?? 0) / (status?.systemRamTotal ?? 1)) * 100) : 0;
  const cpuPercent = status?.cpuUsage != null ? Math.round(status.cpuUsage) : null;
  const diskPercent = (status?.diskTotal ?? 0) > 0 ? Math.round(((status?.diskUsed ?? 0) / (status?.diskTotal ?? 1)) * 100) : 0;

  if (!activeServer) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-gray-800 flex items-center justify-center">
            <Server className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-gray-400 text-sm font-medium">No server selected</p>
          <p className="text-gray-600 text-xs">Select a server from the Server Library to view its dashboard.</p>
        </div>
      </div>
    );
  }

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

  if (!status) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
            <Server className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <p className="text-gray-300 text-sm font-medium">Backend Unavailable</p>
            <p className="text-gray-500 text-xs mt-1">Cannot reach the server API. Make sure the backend is running on port 3001.</p>
          </div>
          <button
            onClick={() => { setConnecting(true); fetchStatus(); }}
            className="btn-primary text-xs"
          >
            Retry Connection
          </button>
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
            {activeServer.name || 'Dashboard'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            <CurrentTimeDisplay />
          </p>
        </div>
      </div>

      {/* Connection Info */}
      <div className="card border border-minecraft-500/20 bg-minecraft-500/5">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${connMode.color.replace('text', 'bg').replace('blue-400', 'blue-500/10').replace('green-400', 'green-500/10').replace('pink-400', 'pink-500/10').replace('gray-500', 'gray-500/10')} ${connMode.color}`}>
            <Radio size={18} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-sm font-semibold text-gray-200">Connect to Server</h3>
              <span className={`flex items-center gap-1 text-xs ${connMode.color}`}>
                <span className={`w-2 h-2 rounded-full ${connMode.dot}`} />
                {connMode.label}
              </span>
              <span className={`flex items-center gap-1 text-xs ${
                connMode.quality === 'reachable' || connMode.quality === 'online' || connMode.quality === 'ready' ? 'text-green-400' : 'text-gray-500'
              }`}>
                {connMode.quality === 'reachable' || connMode.quality === 'online' || connMode.quality === 'ready' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                {connMode.quality === 'reachable' ? 'Reachable' : connMode.quality === 'online' ? 'Online' : connMode.quality === 'ready' ? 'Ready' : 'Offline'}
              </span>
            </div>
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
                <span className="text-purple-400 font-mono font-medium">Java Edition</span>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              <strong className="text-gray-400">Local:</strong> Use <code className="text-minecraft-400">localhost</code> on this PC &nbsp;·&nbsp;
              <strong className="text-gray-400">Friends:</strong> Use the Playit tunnel or Public IP (requires port forwarding) &nbsp;·&nbsp;
              Minecraft version: <strong className="text-gray-300">
                {status?.installationStatus === 'not_configured' ? 'Not configured' : (status?.serverVersion || 'Not configured')}
              </strong>
              {status?.serverSoftware ? <span className="ml-1 text-[10px] bg-minecraft-500/20 text-minecraft-400 px-1.5 py-0.5 rounded">{status.serverSoftware}</span> : null}
              {!status?.running && status?.serverVersion ? <span className="ml-2 text-[10px] text-gray-500">Server Offline</span> : null}
            </p>
          </div>
        </div>
      </div>

      {/* World Info */}
      {worldInfo && worldInfo.tracked && (
        <div className="card border border-minecraft-500/20 bg-minecraft-500/5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-minecraft-500/10 text-minecraft-400">
              <Globe size={18} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-200">Current World</h3>
                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full border border-green-500/30">{worldInfo.name}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                <div className="bg-surface-800 rounded p-2">
                  <span className="text-gray-500 block">Size</span>
                  <span className="text-gray-100 font-medium">{worldInfo.size}</span>
                </div>
                <div className="bg-surface-800 rounded p-2">
                  <span className="text-gray-500 block">Chunks</span>
                  <span className="text-gray-100 font-medium">{worldInfo.totalChunks?.toLocaleString() || 0}</span>
                </div>
                <div className="bg-surface-800 rounded p-2">
                  <span className="text-gray-500 block">Seed</span>
                  <span className="text-gray-100 font-mono">{worldInfo.seed?.slice(0, 10) || 'N/A'}</span>
                </div>
                <div className="bg-surface-800 rounded p-2">
                  <span className="text-gray-500 block">Players</span>
                  <span className="text-minecraft-400 font-medium">{worldInfo.onlinePlayers ?? 0}</span>
                </div>
                <div className="bg-surface-800 rounded p-2">
                  <span className="text-gray-500 block">Difficulty</span>
                  <span className="text-gray-100 font-medium capitalize">{worldInfo.difficulty || 'Normal'}</span>
                </div>
                <div className="bg-surface-800 rounded p-2">
                  <span className="text-gray-500 block">Last Backup</span>
                  <span className="text-gray-100 font-medium">{worldInfo.lastBackup ? new Date(worldInfo.lastBackup).toLocaleDateString() : 'None'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
          {status?.onlinePlayers != null ? `${status.onlinePlayers}/${status.maxPlayers} players` : 'Server Offline'}
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
            <span className={`w-3 h-3 rounded-full ${
              status?.state === 'running' ? 'bg-green-500' :
              status?.state === 'starting' ? 'bg-yellow-500 animate-pulse' :
              status?.state === 'stopping' ? 'bg-yellow-500 animate-pulse' :
              status?.state === 'failed' ? 'bg-red-500' : 'bg-gray-500'
            }`} />
            <span className="text-lg font-semibold">{statusText}</span>
          </div>
          {status?.running && (
            <div className="mt-2 flex gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Activity size={12} /> TPS: <span className={getTpsColor(status.tps ?? 20)}>{(status.tps ?? 20).toFixed(1)}</span></span>
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
          {status?.tps != null ? (
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

        {/* Backup Status */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Backups</span>
            <Save className="w-4 h-4 text-minecraft-500" />
          </div>
          {backupStats ? (
            <>
              <div className="text-3xl font-bold text-purple-400">{backupStats.backupCount}</div>
              <div className="text-xs text-gray-500 mt-1">{backupStats.totalSize} stored</div>
              {backupStats.recentBackups?.length > 0 && (
                <div className="mt-2 text-[10px] text-gray-500">
                  <span className="text-gray-400">Latest:</span> {new Date(backupStats.recentBackups[0].created_at).toLocaleDateString()}
                </div>
              )}
              {backupStats.compressedRatio > 0 && (
                <div className="mt-1 text-[10px] text-gray-500">
                  Compression: <span className="text-green-400">{(backupStats.compressedRatio * 100).toFixed(0)}%</span>
                </div>
              )}
            </>
          ) : (
            <div className="text-lg font-medium text-gray-500">No backups</div>
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
          {storageWidget?.storage && (
            <div className="mt-2 pt-2 border-t border-surface-700 space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">App Data</span>
                <span className="text-gray-400">{storageWidget.storage.total}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">Servers</span>
                <span className="text-gray-400">{storageWidget.storage.servers} ({storageWidget.storage.serversCount})</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">Cache</span>
                <span className="text-gray-400">{storageWidget.storage.cache}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">Logs</span>
                <span className="text-gray-400">{storageWidget.storage.logs}</span>
              </div>
            </div>
          )}
        </div>

        {/* Feedback Status */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Feedback</span>
            <MessageCircle className="w-4 h-4 text-minecraft-500" />
          </div>
          {feedbackStats ? (
            <>
              <div className="text-3xl font-bold text-minecraft-400">{feedbackStats.totalTickets}</div>
              <div className="text-xs text-gray-500 mt-1">{feedbackStats.pendingUploads} pending uploads</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="flex justify-between bg-surface-800 rounded px-2 py-1">
                  <span className="text-gray-500">Open</span>
                  <span className="text-green-400 font-medium">{feedbackStats.byStatus?.open || 0}</span>
                </div>
                <div className="flex justify-between bg-surface-800 rounded px-2 py-1">
                  <span className="text-gray-500">Resolved</span>
                  <span className="text-purple-400 font-medium">{feedbackStats.resolvedReports}</span>
                </div>
                <div className="flex justify-between bg-surface-800 rounded px-2 py-1">
                  <span className="text-gray-500">Crashes</span>
                  <span className="text-red-400 font-medium">{feedbackStats.crashReports}</span>
                </div>
                <div className="flex justify-between bg-surface-800 rounded px-2 py-1">
                  <span className="text-gray-500">In Review</span>
                  <span className="text-blue-400 font-medium">{feedbackStats.byStatus?.in_review || 0}</span>
                </div>
              </div>
              {feedbackStats.recentTickets?.length > 0 && (
                <div className="mt-2 text-[10px] text-gray-500">
                  <span className="text-gray-400">Latest:</span> {feedbackStats.recentTickets[0].ticket_id}
                </div>
              )}
            </>
          ) : (
            <div className="text-lg font-medium text-gray-500">No data</div>
          )}
        </div>

        {/* Discord Status */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Discord</span>
            <MessageSquare className="w-4 h-4 text-blue-400" />
          </div>
          {discordStatus ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2.5 h-2.5 rounded-full ${discordStatus.connected ? 'bg-green-500' : discordStatus.connecting ? 'bg-yellow-500 animate-pulse' : 'bg-gray-500'}`} />
                <span className="text-lg font-semibold">{discordStatus.connected ? 'Connected' : discordStatus.connecting ? 'Connecting...' : 'Disconnected'}</span>
              </div>
              {discordStatus.connected && (
                <div className="text-[10px] text-gray-500 space-y-0.5">
                  <div className="flex justify-between"><span className="text-gray-500">Bot</span><span className="text-gray-300">{discordStatus.botName || 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Guild</span><span className="text-gray-300">{discordStatus.guildName || 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Channel</span><span className="text-blue-400">#{discordStatus.textChannelName || 'N/A'}</span></div>
                  {discordStatus.notificationCount > 0 && (
                    <div className="flex justify-between"><span className="text-gray-500">Sent</span><span className="text-gray-300">{discordStatus.notificationCount} notifications</span></div>
                  )}
                </div>
              )}
              {discordStatus.lastError && !discordStatus.connected && (
                <p className="text-[10px] text-red-400 mt-1 truncate">{discordStatus.lastError}</p>
              )}
            </>
          ) : (
            <div className="text-lg font-medium text-gray-500">Not configured</div>
          )}
        </div>

        {/* Guide & Knowledge Center Widget */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Guide</span>
            <BookOpen className="w-4 h-4 text-minecraft-500" />
          </div>
          {guideWidget ? (
            <div className="space-y-3">
              {guideWidget.tip && (
                <div className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/10 rounded-lg p-2.5">
                  <Lightbulb size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-yellow-400 font-medium">Tip</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{guideWidget.tip.tip}</p>
                  </div>
                </div>
              )}
              {guideWidget.detections?.length > 0 && (
                <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/10 rounded-lg p-2.5">
                  <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-red-400 font-medium">{guideWidget.detections.length} issue{guideWidget.detections.length > 1 ? 's' : ''} detected</p>
                    {guideWidget.detections.map((d: any, i: number) => (
                      <p key={i} className="text-[11px] text-gray-500 mt-0.5 truncate">{d.title}</p>
                    ))}
                  </div>
                </div>
              )}
              {guideWidget.recentArticles?.length > 0 && (
                <div>
                  <p className="text-[11px] text-gray-500 mb-1.5 font-medium">Recently Viewed</p>
                  <div className="space-y-1">
                    {guideWidget.recentArticles.slice(0, 3).map((r: any, i: number) => (
                      <div key={i} className="text-[11px] text-gray-400 truncate">{r.title}</div>
                    ))}
                  </div>
                </div>
              )}
              {guideWidget.bookmarks?.length > 0 && (
                <div>
                  <p className="text-[11px] text-gray-500 mb-1.5 font-medium">Bookmarks</p>
                  <div className="space-y-1">
                    {guideWidget.bookmarks.map((b: any, i: number) => (
                      <div key={i} className="text-[11px] text-gray-400 truncate">{b.title}</div>
                    ))}
                  </div>
                </div>
              )}
              {!guideWidget.tip && !guideWidget.detections?.length && !guideWidget.recentArticles?.length && !guideWidget.bookmarks?.length && (
                <div className="text-xs text-gray-500">No recent activity. Visit the Guide to get started.</div>
              )}
            </div>
          ) : (
            <div className="text-lg font-medium text-gray-500">Loading...</div>
          )}
        </div>

        {/* Privacy & Security Widget */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Security</span>
            <Shield className="w-4 h-4 text-minecraft-500" />
          </div>
          {privacyWidget ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className={`text-2xl font-bold ${
                  privacyWidget.score >= 80 ? 'text-green-400' : privacyWidget.score >= 50 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {privacyWidget.score}
                  <span className="text-sm text-gray-500 font-normal">/100</span>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="text-green-400">{privacyWidget.passCount} pass</span>
                  <span className="text-yellow-400">{privacyWidget.warnCount} warn</span>
                  <span className="text-red-400">{privacyWidget.failCount} fail</span>
                </div>
              </div>
              {privacyWidget.warnings?.length > 0 && (
                <div className="space-y-1">
                  {privacyWidget.warnings.slice(0, 2).map((w: string, i: number) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] text-yellow-400">
                      <AlertTriangle size={10} />
                      <span className="truncate">{w}</span>
                    </div>
                  ))}
                </div>
              )}
              {privacyWidget.lastChecked && (
                <p className="text-[10px] text-gray-600">Last check: {new Date(privacyWidget.lastChecked).toLocaleString()}</p>
              )}
              {privacyWidget.maskSecretsInLogs && (
                <p className="text-[10px] text-green-400/70">Secrets masked in logs ✓</p>
              )}
            </div>
          ) : (
            <div className="text-lg font-medium text-gray-500">Loading...</div>
          )}
        </div>

        {/* Updates Widget */}
        <div className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Updates</span>
            <RefreshCw className="w-4 h-4 text-minecraft-500" />
          </div>
          {updateWidget ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">v{updateWidget.currentVersion}</span>
                <span className={`text-xs font-medium ${updateWidget.updateAvailable ? 'text-yellow-400' : 'text-green-400'}`}>
                  {updateWidget.updateAvailable ? `v${updateWidget.latestVersion} available` : 'Up to date'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <div className={`flex items-center gap-1 ${updateWidget.downloadStatus === 'downloaded' ? 'text-green-400' : updateWidget.downloadStatus === 'downloading' ? 'text-yellow-400' : 'text-gray-500'}`}>
                  <Download size={10} />
                  {updateWidget.downloadStatus === 'downloaded' ? 'Ready' : updateWidget.downloadStatus === 'downloading' ? `${updateWidget.downloadProgress || 0}%` : 'Idle'}
                </div>
                <span className="text-gray-600">|</span>
                <div className={`flex items-center gap-1 ${updateWidget.installStatus === 'completed' ? 'text-green-400' : updateWidget.installStatus === 'installing' ? 'text-yellow-400' : 'text-gray-500'}`}>
                  <RotateCcw size={10} />
                  {updateWidget.installStatus === 'completed' ? 'Installed' : updateWidget.installStatus === 'installing' ? 'Installing...' : 'Pending'}
                </div>
                {updateWidget.rollbackAvailable && (
                  <>
                    <span className="text-gray-600">|</span>
                    <span className="text-green-400 flex items-center gap-1">
                      <ArrowLeft size={10} />
                      Rollback
                    </span>
                  </>
                )}
              </div>
              {updateWidget.updateSize && (
                <p className="text-[10px] text-gray-600">{updateWidget.updateSize} MB download</p>
              )}
              {updateWidget.lastChecked && (
                <p className="text-[10px] text-gray-600">Checked: {new Date(updateWidget.lastChecked).toLocaleDateString()}</p>
              )}
              {updateWidget.migrationStatus === 'completed' && (
                <p className="text-[10px] text-green-400/70">Migration complete ✓</p>
              )}
            </div>
          ) : (
            <div className="text-lg font-medium text-gray-500">Loading...</div>
          )}
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

      {/* Player Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Player Stats */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <Users size={16} className="text-minecraft-500" /> Player Overview
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-surface-800 p-3 rounded-lg border border-surface-700/50">
              <span className="text-sm text-gray-400">Total Players</span>
              <span className="text-lg font-bold text-gray-200">{playerStats.total}</span>
            </div>
            <div className="flex items-center justify-between bg-surface-800 p-3 rounded-lg border border-surface-700/50">
              <span className="text-sm text-gray-400">Online Now</span>
              <span className="text-lg font-bold text-green-400">{playerStats.online}</span>
            </div>
            <div className="flex items-center justify-between bg-surface-800 p-3 rounded-lg border border-surface-700/50">
              <span className="text-sm text-gray-400">Pending Approval</span>
              <span className={`text-lg font-bold ${playerStats.pending > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>{playerStats.pending}</span>
            </div>
            <div className="flex items-center justify-between bg-surface-800 p-3 rounded-lg border border-surface-700/50">
              <span className="text-sm text-gray-400">Banned</span>
              <span className={`text-lg font-bold ${playerStats.banned > 0 ? 'text-red-400' : 'text-gray-400'}`}>{playerStats.banned}</span>
            </div>
          </div>
        </div>

        {/* Recent Joins */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <UserPlus size={16} className="text-green-400" /> Recent Joins
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
            {recentJoins.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No recent joins</p>
            ) : (
              recentJoins.map((event: any, i: number) => (
                <div key={event.id || i} className="flex items-center gap-2 bg-surface-800 p-2.5 rounded-lg border border-surface-700/50">
                  <div className={`w-2 h-2 rounded-full ${event.event_type === 'joined' ? 'bg-green-400' : 'bg-gray-500'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-200 font-medium">{event.player_name || 'Unknown'}</span>
                    {event.event_data && <span className="text-xs text-gray-500 ml-1">- {event.event_data}</span>}
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-200 mb-4 flex items-center gap-2">
            <Activity size={16} className="text-blue-400" /> Recent Activity
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No recent activity</p>
            ) : (
              recentActivity.map((event: any, i: number) => (
                <div key={event.id || i} className="flex items-center gap-2 bg-surface-800 p-2.5 rounded-lg border border-surface-700/50">
                  {event.event_type === 'banned' || event.event_type === 'ban' ? <Ban size={12} className="text-red-400 flex-shrink-0" /> :
                   event.event_type === 'joined' || event.event_type === 'join' ? <UserPlus size={12} className="text-green-400 flex-shrink-0" /> :
                   event.event_type === 'left' || event.event_type === 'leave' ? <UserMinus size={12} className="text-gray-400 flex-shrink-0" /> :
                   event.event_type === 'kicked' ? <LogOut size={12} className="text-yellow-400 flex-shrink-0" /> :
                   <Activity size={12} className="text-blue-400 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-gray-200">
                      {event.player_name || 'Unknown'}
                    </span>
                    <span className="text-xs text-gray-500 ml-1 capitalize">- {event.event_type}</span>
                    {event.event_data && <span className="text-xs text-gray-500 ml-1">({event.event_data})</span>}
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
