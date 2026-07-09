import React, { useEffect, useState, useCallback } from 'react';
import {
  Users, Search, Plus, Shield, Ban, VolumeX, Volume2,
  LogOut, Trash2, UserCheck, UserX, MoreHorizontal, ChevronDown,
  Filter, Server, ShieldOff, Clock, Activity, MapPin, Crosshair,
  Package, Download, Upload, Eye, EyeOff, RefreshCw, Gavel,
  AlertTriangle, CheckCircle, XCircle, History, FileText,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/stateful-button';
import { EvervaultCard, Icon } from '../components/ui/evervault-card';
import { api } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
import { useActiveServer } from '../hooks/useActiveServer';
import toast from 'react-hot-toast';

interface Player {
  id: string;
  username: string;
  uuid: string;
  role: string;
  status: string;
  last_login: string | null;
  playtime: number;
  ip: string;
  join_date: string;
  muted: number;
  notes: string;
  approval_status: string;
  trusted: number;
  ops: number;
  last_ip: string;
  health?: number;
  food_level?: number;
  xp_level?: number;
  xp_progress?: number;
  dimension?: string;
  pos_x?: number;
  pos_y?: number;
  pos_z?: number;
  world_name?: string;
  death_count?: number;
  kills?: number;
  inventory?: string;
  armor?: string;
  ender_chest?: string;
  advancements?: string;
  statistics?: string;
  first_join?: string;
}

interface HistoryEvent {
  id: string;
  player_id: string;
  event_type: string;
  event_data: string;
  timestamp: string;
}

interface Session {
  id: string;
  player_id: string;
  start_time: string;
  end_time: string | null;
  duration: number;
  ip: string;
}

const ROLE_COLORS: Record<string, string> = {
  Owner: 'text-red-400 border-red-500/20 bg-red-500/10',
  Admin: 'text-orange-400 border-orange-500/20 bg-orange-500/10',
  Moderator: 'text-green-400 border-green-500/20 bg-green-500/10',
  'Trusted Member': 'text-cyan-400 border-cyan-500/20 bg-cyan-500/10',
  Member: 'text-gray-400 border-gray-500/20 bg-gray-500/10',
  Guest: 'text-gray-500 border-gray-500/20 bg-gray-500/5',
};

const APPROVAL_COLORS: Record<string, string> = {
  pending: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10',
  approved: 'text-green-400 border-green-500/20 bg-green-500/10',
  rejected: 'text-red-400 border-red-500/20 bg-red-500/10',
};

export default function Players() {
  const { server: activeServer } = useActiveServer();
  const [players, setPlayers] = useState<Player[]>([]);
  const [whitelist, setWhitelist] = useState<any[]>([]);
  const [banned, setBanned] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState('Member');
  const [tab, setTab] = useState<'players' | 'whitelist' | 'banned' | 'approval'>('players');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerHistory, setPlayerHistory] = useState<HistoryEvent[]>([]);
  const [playerSessions, setPlayerSessions] = useState<Session[]>([]);
  const [profileTab, setProfileTab] = useState<'stats' | 'history' | 'sessions'>('stats');
  const [filterApproval, setFilterApproval] = useState<string>('all');
  const [pendingCount, setPendingCount] = useState(0);
  const [showDetectModal, setShowDetectModal] = useState(false);
  const [detectResult, setDetectResult] = useState<{ created: number; updated: number } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportData, setExportData] = useState<string>('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importing, setImporting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banPlayerId, setBanPlayerId] = useState<string | null>(null);
  const [kickReason, setKickReason] = useState('');
  const [kickPlayerId, setKickPlayerId] = useState<string | null>(null);
  const [tempBanPlayerId, setTempBanPlayerId] = useState<string | null>(null);
  const [tempBanDuration, setTempBanDuration] = useState('1h');
  const [tempBanReason, setTempBanReason] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);

  const { socket } = useSocket();

  const fetchPlayers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterApproval !== 'all') params.set('approval', filterApproval);
      if (search) params.set('search', search);
      const data = await api.get(`/players?${params.toString()}`);
      setPlayers(data);
    } catch {}
  }, [filterApproval, search]);

  const fetchWhitelist = useCallback(async () => {
    try { setWhitelist(await api.getWhitelist()); } catch {}
  }, []);

  const fetchBanned = useCallback(async () => {
    try { setBanned(await api.getBannedPlayers()); } catch {}
  }, []);

  const fetchPendingCount = useCallback(async () => {
    try {
      const result = await api.getPendingCount();
      setPendingCount(result.count);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPlayers();
    fetchWhitelist();
    fetchBanned();
    fetchPendingCount();
  }, [fetchPlayers, fetchWhitelist, fetchBanned, fetchPendingCount]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => { fetchPlayers(); fetchWhitelist(); fetchBanned(); fetchPendingCount(); };
    socket.on('player:join', (username: string) => { toast.success(`${username} joined`); refresh(); });
    socket.on('player:leave', (username: string) => { toast(`${username} left`, { icon: '👋' }); refresh(); });
    socket.on('player:added', refresh);
    socket.on('player:updated', refresh);
    socket.on('player:removed', refresh);
    socket.on('player:approved', () => { refresh(); toast.success('Player approved'); });
    socket.on('player:rejected', () => { refresh(); toast('Player rejected', { icon: '⚠️' }); });
    socket.on('player:opped', (d: any) => { refresh(); toast.success(`${d.username} is now OP`); });
    socket.on('player:deopped', (d: any) => { refresh(); toast(`${d.username} is no longer OP`, { icon: 'ℹ️' }); });
    socket.on('player:banned', (d: any) => { refresh(); toast.error(`${d.username} banned`); });
    socket.on('player:unbanned', (d: any) => { refresh(); toast.success(`${d.username} unbanned`); });
    socket.on('player:muted', (d: any) => { refresh(); toast(`${d.username} muted`, { icon: '🔇' }); });
    socket.on('player:unmuted', (d: any) => { refresh(); toast(`${d.username} unmuted`, { icon: '🔊' }); });
    return () => { socket.off('player:join'); socket.off('player:leave'); socket.off('player:added'); socket.off('player:updated'); socket.off('player:removed'); socket.off('player:approved'); socket.off('player:rejected'); socket.off('player:opped'); socket.off('player:deopped'); socket.off('player:banned'); socket.off('player:unbanned'); socket.off('player:muted'); socket.off('player:unmuted'); };
  }, [socket, fetchPlayers, fetchWhitelist, fetchBanned, fetchPendingCount]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.addToWhitelist(newUsername);
      toast.success(`Added ${newUsername}`);
      setNewUsername('');
      setShowAdd(false);
      fetchWhitelist();
      fetchPlayers();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleRemoveFromWhitelist = async (username: string) => {
    try {
      await api.removeFromWhitelist(username);
      toast.success(`Removed ${username} from whitelist`);
      fetchWhitelist();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleRoleChange = async (playerId: string, role: string) => {
    try {
      await api.updatePlayer(playerId, { role });
      toast.success('Role updated');
      fetchPlayers();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleApprove = async (id: string) => {
    try { await api.approvePlayer(id); fetchPlayers(); fetchPendingCount(); } catch (err: any) { toast.error(err.message); }
  };

  const handleReject = async (id: string) => {
    try { await api.rejectPlayer(id); fetchPlayers(); fetchPendingCount(); } catch (err: any) { toast.error(err.message); }
  };

  const handleOp = async (id: string) => {
    try { await api.opPlayer(id); fetchPlayers(); } catch (err: any) { toast.error(err.message); }
  };

  const handleDeop = async (id: string) => {
    try { await api.deopPlayer(id); fetchPlayers(); } catch (err: any) { toast.error(err.message); }
  };

  const handleWhitelist = async (id: string) => {
    try { await api.whitelistPlayer(id); fetchWhitelist(); } catch (err: any) { toast.error(err.message); }
  };

  const handleUnwhitelist = async (id: string) => {
    try { await api.unwhitelistPlayer(id); fetchWhitelist(); } catch (err: any) { toast.error(err.message); }
  };

  const handleBan = async (id: string, reason?: string) => {
    try {
      await api.banPlayer(id, reason);
      toast.success('Player banned');
      fetchPlayers();
      fetchBanned();
      setBanPlayerId(null);
      setBanReason('');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleUnban = async (id: string) => {
    try {
      await api.unbanPlayer(id);
      toast.success('Player unbanned');
      fetchPlayers();
      fetchBanned();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleKick = async (id: string, reason?: string) => {
    try {
      await api.kickPlayer(id, reason);
      toast.success('Player kicked');
      fetchPlayers();
      setKickPlayerId(null);
      setKickReason('');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleMute = async (id: string, muted: boolean) => {
    try {
      if (muted) { await api.unmutePlayer(id); toast.success('Unmuted'); }
      else { await api.mutePlayer(id); toast.success('Muted'); }
      fetchPlayers();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleTempBan = async () => {
    if (!tempBanPlayerId) return;
    try {
      await api.tempBanPlayer(tempBanPlayerId, tempBanDuration, tempBanReason);
      toast.success('Temp ban applied');
      fetchPlayers();
      fetchBanned();
      setTempBanPlayerId(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this player permanently?')) return;
    try {
      await api.deletePlayer(id);
      toast.success('Player deleted');
      fetchPlayers();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const result = await api.detectPlayers();
      setDetectResult(result);
      toast.success(`Detected: ${result.created} new, ${result.updated} updated`);
      fetchPlayers();
    } catch (err: any) { toast.error(err.message); }
    setDetecting(false);
  };

  const handleExportAll = async () => {
    try {
      const data = await api.exportAllPlayers();
      setExportData(JSON.stringify(data, null, 2));
      setShowExportModal(true);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleExportPlayer = async (id: string) => {
    try {
      const data = await api.exportPlayer(id);
      setExportData(JSON.stringify(data, null, 2));
      setShowExportModal(true);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleImport = async () => {
    if (!importJson.trim()) { toast.error('Paste JSON data first'); return; }
    setImporting(true);
    try {
      const data = JSON.parse(importJson);
      const result = await api.importPlayer(data);
      toast.success(result.message || 'Import successful');
      setShowImportModal(false);
      setImportJson('');
      fetchPlayers();
    } catch (err: any) { toast.error(err.message); }
    setImporting(false);
  };

  const copyExport = () => {
    navigator.clipboard.writeText(exportData);
    toast.success('Copied to clipboard');
  };

  const openProfile = async (player: Player) => {
    setSelectedPlayer(player);
    setProfileTab('stats');
    setPlayerHistory([]);
    setPlayerSessions([]);
  };

  const loadHistory = async (playerId: string) => {
    setLoadingHistory(true);
    try {
      const [history, sessions] = await Promise.all([
        api.getPlayerHistory(playerId),
        api.getPlayerSessions(playerId),
      ]);
      setPlayerHistory(history);
      setPlayerSessions(sessions);
    } catch {}
    setLoadingHistory(false);
  };

  useEffect(() => {
    if (selectedPlayer && profileTab !== 'stats') {
      loadHistory(selectedPlayer.id);
    }
  }, [selectedPlayer, profileTab]);

  const filteredPlayers = players.filter(p =>
    p.username.toLowerCase().includes(search.toLowerCase())
  );

  const pendingPlayers = players.filter(p => p.approval_status === 'pending');

  const statusDot = (status: string) => {
    switch (status) {
      case 'online': return 'status-dot-online';
      case 'banned': return 'status-dot-banned';
      default: return 'status-dot-offline';
    }
  };

  const formatPlaytime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const historyIcon = (type: string) => {
    switch (type) {
      case 'approved': return <CheckCircle size={14} className="text-green-400" />;
      case 'rejected': return <XCircle size={14} className="text-red-400" />;
      case 'opped': return <Shield size={14} className="text-red-400" />;
      case 'deopped': return <ShieldOff size={14} className="text-gray-400" />;
      case 'banned': return <Ban size={14} className="text-red-400" />;
      case 'unbanned': return <UserCheck size={14} className="text-green-400" />;
      case 'kicked': return <LogOut size={14} className="text-yellow-400" />;
      case 'muted': return <VolumeX size={14} className="text-yellow-400" />;
      case 'unmuted': return <Volume2 size={14} className="text-green-400" />;
      case 'whitelisted': return <UserCheck size={14} className="text-cyan-400" />;
      case 'unwhitelisted': return <UserX size={14} className="text-gray-400" />;
      case 'joined': return <Activity size={14} className="text-green-400" />;
      case 'left': return <LogOut size={14} className="text-gray-400" />;
      case 'exported': return <Download size={14} className="text-blue-400" />;
      case 'imported': return <Upload size={14} className="text-purple-400" />;
      default: return <Clock size={14} className="text-gray-400" />;
    }
  };

  if (!activeServer) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-gray-800 flex items-center justify-center">
            <Server className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-gray-400 text-sm font-medium">No server selected</p>
          <p className="text-gray-600 text-xs">Select a server from the Server Library to manage its players.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Player Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">{players.length} total players</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowDetectModal(true)} className="text-xs">
            <RefreshCw size={14} />
            Scan
          </Button>
          <Button variant="secondary" onClick={handleExportAll} className="text-xs">
            <Download size={14} />
            Export
          </Button>
          <Button variant="secondary" onClick={() => setShowImportModal(true)} className="text-xs">
            <Upload size={14} />
            Import
          </Button>
          <Button variant="primary" onClick={() => setShowAdd(!showAdd)}>
            <Plus size={16} />
            Add
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-900 p-1 rounded-lg w-fit border border-surface-800">
        {(['players', 'approval', 'whitelist', 'banned'] as const).map((t) => (
          <Button variant="none"
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize ${
              tab === t ? 'bg-minecraft-600/20 text-minecraft-400' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t}
            {t === 'players' && <span className="ml-1.5 text-xs opacity-60">({players.length})</span>}
            {t === 'approval' && (
              <span className={`ml-1.5 text-xs ${pendingCount > 0 ? 'text-yellow-400' : 'opacity-60'}`}>
                ({pendingCount})
              </span>
            )}
            {t === 'whitelist' && <span className="ml-1.5 text-xs opacity-60">({whitelist.length})</span>}
            {t === 'banned' && <span className="ml-1.5 text-xs opacity-60">({banned.length})</span>}
          </Button>
        ))}
      </div>

      {/* Search + Filter */}
      {tab === 'players' && (
        <div className="flex gap-3 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
              placeholder="Search players..."
            />
          </div>
          <select
            value={filterApproval}
            onChange={(e) => setFilterApproval(e.target.value)}
            className="select w-36"
          >
            <option value="all">All Status</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      )}

      {/* Add Player Form */}
      {showAdd && (
        <div className="card p-4 animate-slide-in">
          <form onSubmit={handleAdd} className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-400 mb-1">Username</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="input"
                placeholder="Minecraft username"
                required
              />
            </div>
            <div className="w-32">
              <label className="block text-xs font-medium text-gray-400 mb-1">Role</label>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="select">
                {Object.keys(ROLE_COLORS).map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="primary">Add</Button>
          </form>
        </div>
      )}

      {/* ───── PLAYERS TAB ───── */}
      {tab === 'players' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredPlayers.map((player) => (
            <div key={player.id} className="border border-surface-700/50 flex flex-col items-center p-4 relative h-[22rem] bg-surface-900/50 rounded-xl group hover:border-minecraft-500/30 transition-colors w-full shadow-lg">
              <Icon className="absolute h-6 w-6 -top-3 -left-3 text-surface-600 group-hover:text-minecraft-400 transition-colors z-30" />
              <Icon className="absolute h-6 w-6 -bottom-3 -left-3 text-surface-600 group-hover:text-minecraft-400 transition-colors z-30" />
              <Icon className="absolute h-6 w-6 -top-3 -right-3 text-surface-600 group-hover:text-minecraft-400 transition-colors z-30" />
              <Icon className="absolute h-6 w-6 -bottom-3 -right-3 text-surface-600 group-hover:text-minecraft-400 transition-colors z-30" />

              <div className="absolute inset-0 z-0 opacity-40 pointer-events-auto">
                <EvervaultCard text="" />
              </div>

              <div className="relative z-10 flex flex-col items-center h-full w-full mt-4 pointer-events-none">
                 {/* User avatar */}
                 <div className="w-16 h-16 rounded-full bg-surface-700 flex items-center justify-center text-2xl font-bold text-gray-300 mb-3 border border-surface-600 shadow-md">
                   {player.username.charAt(0).toUpperCase()}
                 </div>
                 <h2 className="text-white text-xl font-bold mb-1 flex items-center gap-2">
                   {player.username}
                   {player.ops ? <Shield size={14} className="text-red-400" /> : null}
                 </h2>
                 <p className="text-xs text-gray-500 font-mono mb-4">{player.uuid?.slice(0, 8) || 'N/A'}</p>
                 
                 <div className="flex flex-col gap-2 w-full mt-auto pointer-events-auto">
                    {/* Status */}
                    <div className="flex justify-between items-center bg-surface-800/80 px-3 py-2 rounded-lg border border-surface-700">
                       <span className="text-xs text-gray-400">Status</span>
                       <span className="flex items-center gap-2">
                         <span className={statusDot(player.status)} />
                         <span className="text-xs capitalize text-gray-200">{player.status}</span>
                       </span>
                    </div>
                    {/* Role */}
                    <div className="flex justify-between items-center bg-surface-800/80 px-3 py-2 rounded-lg border border-surface-700">
                       <span className="text-xs text-gray-400">Role</span>
                       <select
                          value={player.role}
                          onChange={(e) => handleRoleChange(player.id, e.target.value)}
                          className="text-xs bg-transparent text-gray-200 focus:outline-none text-right appearance-none cursor-pointer"
                          disabled={player.role === 'Owner'}
                        >
                          {Object.keys(ROLE_COLORS).map((r) => (
                            <option key={r} value={r} className="bg-surface-800">{r}</option>
                          ))}
                        </select>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" onClick={() => openProfile(player)} className="flex-1 border-surface-600 hover:border-minecraft-500 hover:bg-minecraft-500/10 text-xs py-1.5 h-auto">
                         View Profile
                      </Button>
                      <div className="relative">
                        <Button variant="outline" onClick={() => setOpenMenuId(openMenuId === player.id ? null : player.id)} className="px-2 border-surface-600 hover:border-gray-400 text-xs py-1.5 h-auto">
                          <MoreHorizontal size={14} />
                        </Button>
                        {openMenuId === player.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
                              <div className="absolute right-0 bottom-full mb-1 w-48 bg-surface-800 border border-surface-700 rounded-lg shadow-xl z-50 py-1">
                                {!player.ops && player.role !== 'Owner' && (
                                  <Button variant="none" onClick={() => { setOpenMenuId(null); handleOp(player.id); }} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-surface-700 flex items-center gap-2">
                                    <Shield size={14} /> OP
                                  </Button>
                                )}
                                {player.ops && (
                                  <Button variant="none" onClick={() => { setOpenMenuId(null); handleDeop(player.id); }} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-surface-700 flex items-center gap-2">
                                    <ShieldOff size={14} /> De-OP
                                  </Button>
                                )}
                                <Button variant="none" onClick={() => { setOpenMenuId(null); handleWhitelist(player.id); }} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-surface-700 flex items-center gap-2">
                                  <UserCheck size={14} /> Whitelist
                                </Button>
                                <Button variant="none" onClick={() => { setOpenMenuId(null); handleUnwhitelist(player.id); }} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-surface-700 flex items-center gap-2">
                                  <UserX size={14} /> Unwhitelist
                                </Button>
                                <Button variant="none" onClick={() => { setOpenMenuId(null); setBanPlayerId(player.id); }} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-surface-700 flex items-center gap-2">
                                  <Ban size={14} /> Ban
                                </Button>
                                <Button variant="none" onClick={() => { setOpenMenuId(null); setTempBanPlayerId(player.id); }} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-surface-700 flex items-center gap-2">
                                  <Clock size={14} /> Temp Ban
                                </Button>
                                <Button variant="none" onClick={() => { setOpenMenuId(null); handleExportPlayer(player.id); }} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-surface-700 flex items-center gap-2">
                                  <Download size={14} /> Export Data
                                </Button>
                                {player.role !== 'Owner' && (
                                  <Button variant="none" onClick={() => { setOpenMenuId(null); handleDelete(player.id); }} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2">
                                    <Trash2 size={14} /> Delete
                                  </Button>
                                )}
                              </div>
                            </>
                          )}
                      </div>
                    </div>
                 </div>
              </div>
            </div>
          ))}
          {filteredPlayers.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-500 bg-surface-900/50 rounded-xl border border-surface-800">
              No players found
            </div>
          )}
        </div>
      )}

      {/* ───── APPROVAL TAB ───── */}
      {tab === 'approval' && (
        <div className="card p-0 overflow-hidden">
          {pendingPlayers.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              <CheckCircle size={32} className="mx-auto mb-2 text-green-400/50" />
              No pending approvals
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-800">
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Player</th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Joined</th>
                    <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPlayers.map((player) => (
                    <tr key={player.id} className="border-b border-surface-800/50 hover:bg-surface-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-surface-700 flex items-center justify-center text-sm font-bold text-gray-300">
                            {player.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-200">{player.username}</p>
                            <p className="text-xs text-gray-500 font-mono">{player.uuid?.slice(0, 8)}...</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${APPROVAL_COLORS[player.approval_status] || APPROVAL_COLORS.pending}`}>
                          {player.approval_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {player.join_date ? new Date(player.join_date).toLocaleDateString() : 'Unknown'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="primary" onClick={() => handleApprove(player.id)} className="text-xs py-1.5 px-3">
                            <CheckCircle size={14} /> Approve
                          </Button>
                          <Button variant="danger" onClick={() => handleReject(player.id)} className="text-xs py-1.5 px-3">
                            <XCircle size={14} /> Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───── WHITELIST TAB ───── */}
      {tab === 'whitelist' && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-800">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Username</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">UUID</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Added By</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Added At</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {whitelist.map((w: any) => (
                  <tr key={w.id} className="border-b border-surface-800/50 hover:bg-surface-800/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-200">{w.username}</td>
                    <td className="px-4 py-3 text-sm text-gray-400 font-mono">{w.uuid?.slice(0, 8) || 'N/A'}...</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{w.added_by}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{new Date(w.added_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" onClick={() => handleRemoveFromWhitelist(w.username)} className="p-1.5 text-gray-400 hover:text-red-400">
                        <UserX size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
                {whitelist.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">No whitelisted players</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───── BANNED TAB ───── */}
      {tab === 'banned' && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-800">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Username</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Reason</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Banned By</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Date</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {banned.map((b: any) => (
                  <tr key={b.id} className="border-b border-surface-800/50 hover:bg-surface-800/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-200">{b.username}</td>
                    <td className="px-4 py-3 text-sm text-gray-400 max-w-xs truncate">{b.reason}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{b.banned_by}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{new Date(b.banned_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" onClick={() => handleUnban(b.id)} className="p-1.5 text-gray-400 hover:text-green-400" title="Unban">
                        <UserCheck size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
                {banned.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">No banned players</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───── PLAYER PROFILE MODAL ───── */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-900 rounded-xl border border-surface-700 w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-surface-700 flex items-center justify-between bg-surface-800/50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-surface-700 flex items-center justify-center text-2xl font-bold text-gray-200 border-2 border-surface-600">
                  {selectedPlayer.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    {selectedPlayer.username}
                    {selectedPlayer.ops && (
                      <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full border border-red-500/30 flex items-center gap-1">
                        <Shield size={10} /> OP
                      </span>
                    )}
                    {selectedPlayer.muted ? (
                      <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/30 flex items-center gap-1">
                        <VolumeX size={10} /> Muted
                      </span>
                    ) : null}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm text-gray-400 font-mono">{selectedPlayer.uuid}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${ROLE_COLORS[selectedPlayer.role] || ROLE_COLORS.Member}`}>
                      {selectedPlayer.role}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${APPROVAL_COLORS[selectedPlayer.approval_status]}`}>
                      {selectedPlayer.approval_status}
                    </span>
                  </div>
                </div>
              </div>
              <Button variant="ghost" onClick={() => setSelectedPlayer(null)} className="p-2">
                <X size={24} />
              </Button>
            </div>

            {/* Profile tabs */}
            <div className="flex gap-1 px-5 pt-4 bg-surface-900 border-b border-surface-700">
              {(['stats', 'history', 'sessions'] as const).map((t) => (
                <Button variant="none"
                  key={t}
                  onClick={() => setProfileTab(t)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 capitalize ${
                    profileTab === t
                      ? 'border-minecraft-400 text-minecraft-400'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {t === 'stats' && <><Activity size={14} className="inline mr-1.5" />Stats</>}
                  {t === 'history' && <><History size={14} className="inline mr-1.5" />History</>}
                  {t === 'sessions' && <><Clock size={14} className="inline mr-1.5" />Sessions</>}
                </Button>
              ))}
            </div>

            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              {/* Stats Tab */}
              {profileTab === 'stats' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="bg-surface-800 p-4 rounded-xl border border-surface-700">
                      <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider flex items-center gap-2">
                        <Activity size={16} className="text-minecraft-400" /> Vitals
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-surface-900 p-3 rounded-lg border border-surface-700/50">
                          <div className="text-xs text-gray-500">Health</div>
                          <div className="text-lg font-bold text-red-400">{selectedPlayer.health != null ? `${selectedPlayer.health}/20` : 'Unknown'}</div>
                        </div>
                        <div className="bg-surface-900 p-3 rounded-lg border border-surface-700/50">
                          <div className="text-xs text-gray-500">Food</div>
                          <div className="text-lg font-bold text-yellow-400">{selectedPlayer.food_level != null ? `${selectedPlayer.food_level}/20` : 'Unknown'}</div>
                        </div>
                        <div className="bg-surface-900 p-3 rounded-lg border border-surface-700/50">
                          <div className="text-xs text-gray-500">XP Level</div>
                          <div className="text-lg font-bold text-green-400">{selectedPlayer.xp_level != null ? selectedPlayer.xp_level : 'Unknown'}</div>
                        </div>
                        <div className="bg-surface-900 p-3 rounded-lg border border-surface-700/50">
                          <div className="text-xs text-gray-500">XP Progress</div>
                          <div className="text-lg font-bold text-green-400">{selectedPlayer.xp_progress != null ? `${(selectedPlayer.xp_progress * 100).toFixed(0)}%` : 'Unknown'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-surface-800 p-4 rounded-xl border border-surface-700">
                      <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider flex items-center gap-2">
                        <MapPin size={16} className="text-minecraft-400" /> Location
                      </h3>
                      <div className="bg-surface-900 p-3 rounded-lg border border-surface-700/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-500">Dimension</span>
                          <span className="text-sm text-gray-200">{selectedPlayer.dimension || 'Unknown'}</span>
                        </div>
                        <div className="font-mono text-gray-200 text-sm">
                          {selectedPlayer.pos_x != null && selectedPlayer.pos_y != null && selectedPlayer.pos_z != null ? `X: ${Math.round(selectedPlayer.pos_x)}  Y: ${Math.round(selectedPlayer.pos_y)}  Z: ${Math.round(selectedPlayer.pos_z)}` : 'Unknown'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-surface-800 p-4 rounded-xl border border-surface-700">
                      <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider flex items-center gap-2">
                        <Crosshair size={16} className="text-minecraft-400" /> Stats
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-surface-900 p-3 rounded-lg border border-surface-700/50">
                          <div className="text-xs text-gray-500">Deaths</div>
                          <div className="text-lg font-bold text-red-400">{selectedPlayer.death_count != null ? selectedPlayer.death_count : 'Unknown'}</div>
                        </div>
                        <div className="bg-surface-900 p-3 rounded-lg border border-surface-700/50">
                          <div className="text-xs text-gray-500">Kills</div>
                          <div className="text-lg font-bold text-green-400">{selectedPlayer.kills != null ? selectedPlayer.kills : 'Unknown'}</div>
                        </div>
                        <div className="bg-surface-900 p-3 rounded-lg border border-surface-700/50">
                          <div className="text-xs text-gray-500">Playtime</div>
                          <div className="text-lg font-bold text-cyan-400">{formatPlaytime(selectedPlayer.playtime)}</div>
                        </div>
                        <div className="bg-surface-900 p-3 rounded-lg border border-surface-700/50">
                          <div className="text-xs text-gray-500">First Joined</div>
                          <div className="text-sm font-bold text-gray-200">{selectedPlayer.first_join ? new Date(selectedPlayer.first_join).toLocaleDateString() : 'Unknown'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-surface-800 p-4 rounded-xl border border-surface-700">
                      <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider flex items-center gap-2">
                        <Package size={16} className="text-minecraft-400" /> Notes
                      </h3>
                      <textarea
                        className="input w-full h-20 resize-none"
                        value={selectedPlayer.notes || ''}
                        onChange={async (e) => {
                          const newNotes = e.target.value;
                          setSelectedPlayer({ ...selectedPlayer, notes: newNotes });
                          try { await api.updatePlayer(selectedPlayer.id, { notes: newNotes }); } catch {}
                        }}
                        placeholder="Add notes about this player..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* History Tab */}
              {profileTab === 'history' && (
                <div>
                  {loadingHistory ? (
                    <div className="flex justify-center py-8">
                      <div className="w-8 h-8 border-4 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : playerHistory.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      <Clock size={32} className="mx-auto mb-2 opacity-50" />
                      No history events recorded
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {playerHistory.map((event) => (
                        <div key={event.id} className="flex items-center gap-3 p-2.5 hover:bg-surface-800/50 rounded-lg transition-colors">
                          <div className="w-8 h-8 rounded-full bg-surface-800 flex items-center justify-center flex-shrink-0">
                            {historyIcon(event.event_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-200 capitalize">{event.event_type}</span>
                              {event.event_data && (
                                <span className="text-xs text-gray-500 truncate">{event.event_data}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 flex-shrink-0">
                            {new Date(event.timestamp).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Sessions Tab */}
              {profileTab === 'sessions' && (
                <div>
                  {loadingHistory ? (
                    <div className="flex justify-center py-8">
                      <div className="w-8 h-8 border-4 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : playerSessions.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      <Clock size={32} className="mx-auto mb-2 opacity-50" />
                      No session data
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {playerSessions.map((s) => (
                        <div key={s.id} className="bg-surface-800 p-3 rounded-lg border border-surface-700/50 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${s.end_time ? 'bg-gray-500' : 'bg-green-400'}`} />
                            <div>
                              <div className="text-sm text-gray-200">
                                {new Date(s.start_time).toLocaleString()}
                              </div>
                              {s.end_time && (
                                <div className="text-xs text-gray-500">
                                  to {new Date(s.end_time).toLocaleString()}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-sm text-gray-400 font-mono">
                            {s.end_time ? formatDuration(s.duration) : 'Online now'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Profile footer actions */}
            <div className="p-4 border-t border-surface-700 flex flex-wrap gap-2 bg-surface-800/50">
              {selectedPlayer.approval_status === 'pending' && (
                <>
                  <Button variant="primary" onClick={() => { handleApprove(selectedPlayer.id); setSelectedPlayer(null); }} className="text-xs py-1.5 px-3">
                    <CheckCircle size={14} /> Approve
                  </Button>
                  <Button variant="danger" onClick={() => { handleReject(selectedPlayer.id); setSelectedPlayer(null); }} className="text-xs py-1.5 px-3">
                    <XCircle size={14} /> Reject
                  </Button>
                </>
              )}
              {!selectedPlayer.ops && selectedPlayer.role !== 'Owner' && (
                <Button variant="secondary" onClick={() => { handleOp(selectedPlayer.id); }} className="text-xs py-1.5 px-3">
                  <Shield size={14} /> OP
                </Button>
              )}
              {selectedPlayer.ops && (
                <Button variant="secondary" onClick={() => { handleDeop(selectedPlayer.id); }} className="text-xs py-1.5 px-3">
                  <ShieldOff size={14} /> De-OP
                </Button>
              )}
              <Button variant="secondary" onClick={() => { handleWhitelist(selectedPlayer.id); }} className="text-xs py-1.5 px-3">
                <UserCheck size={14} /> Whitelist
              </Button>
              <Button variant="secondary" onClick={() => { handleExportPlayer(selectedPlayer.id); }} className="text-xs py-1.5 px-3">
                <Download size={14} /> Export
              </Button>
              <Button variant="danger" onClick={() => { setBanPlayerId(selectedPlayer.id); }} className="text-xs py-1.5 px-3">
                <Ban size={14} /> Ban
              </Button>
              {selectedPlayer.status === 'online' && (
                <Button variant="secondary" onClick={() => { setKickPlayerId(selectedPlayer.id); }} className="text-xs py-1.5 px-3">
                  <LogOut size={14} /> Kick
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ───── DETECT MODAL ───── */}
      {showDetectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-900 rounded-xl border border-surface-700 w-full max-w-md shadow-2xl p-6">
            <h3 className="text-lg font-bold text-gray-100 mb-4 flex items-center gap-2">
              <RefreshCw size={18} className="text-minecraft-400" /> Player Detection
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Scan Minecraft server files (playerdata/, stats/, advancements/, usercache.json, whitelist.json, ops.json, banned-players.json) to auto-detect and sync player records.
            </p>
            {detectResult && (
              <div className="bg-surface-800 p-4 rounded-lg border border-surface-700 mb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">New players created</span>
                  <span className="text-lg font-bold text-green-400">{detectResult.created}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Existing players updated</span>
                  <span className="text-lg font-bold text-cyan-400">{detectResult.updated}</span>
                </div>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => { setShowDetectModal(false); setDetectResult(null); }} className="text-sm">Close</Button>
              <Button variant="primary" onClick={handleDetect} disabled={detecting} className="text-sm">
                {detecting ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Scanning...</>
                ) : (
                  <><RefreshCw size={14} /> Scan Now</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ───── EXPORT MODAL ───── */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-900 rounded-xl border border-surface-700 w-full max-w-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                <Download size={18} className="text-minecraft-400" /> Export Data
              </h3>
              <Button variant="ghost" onClick={() => setShowExportModal(false)} className="p-1.5">
                <X size={18} />
              </Button>
            </div>
            <textarea
              className="input w-full h-64 font-mono text-xs resize-none"
              value={exportData}
              readOnly
            />
            <div className="flex gap-3 justify-end mt-4">
              <Button variant="primary" onClick={copyExport} className="text-sm">
                <FileText size={14} /> Copy
              </Button>
              <Button variant="secondary" onClick={() => setShowExportModal(false)} className="text-sm">Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* ───── IMPORT MODAL ───── */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-900 rounded-xl border border-surface-700 w-full max-w-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                <Upload size={18} className="text-minecraft-400" /> Import Players
              </h3>
              <Button variant="ghost" onClick={() => setShowImportModal(false)} className="p-1.5">
                <X size={18} />
              </Button>
            </div>
            <p className="text-sm text-gray-400 mb-3">Paste JSON export data to import players and their history.</p>
            <textarea
              className="input w-full h-48 font-mono text-xs resize-none"
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='{"exportVersion": 1, "player": {...}, "history": [...]}'
            />
            <div className="flex gap-3 justify-end mt-4">
              <Button variant="primary" onClick={handleImport} disabled={importing} className="text-sm">
                {importing ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importing...</>
                ) : (
                  <><Upload size={14} /> Import</>
                )}
              </Button>
              <Button variant="secondary" onClick={() => setShowImportModal(false)} className="text-sm">Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* ───── BAN CONFIRM MODAL ───── */}
      {banPlayerId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-900 rounded-xl border border-surface-700 w-full max-w-md shadow-2xl p-6">
            <h3 className="text-lg font-bold text-gray-100 mb-4 flex items-center gap-2">
              <Gavel size={18} className="text-red-400" /> Ban Player
            </h3>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-400 mb-1">Reason (optional)</label>
              <input
                type="text"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                className="input w-full"
                placeholder="Banned by operator"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => { setBanPlayerId(null); setBanReason(''); }} className="text-sm">Cancel</Button>
              <Button variant="danger" onClick={() => handleBan(banPlayerId, banReason)} className="text-sm">Ban</Button>
            </div>
          </div>
        </div>
      )}

      {/* ───── KICK CONFIRM MODAL ───── */}
      {kickPlayerId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-900 rounded-xl border border-surface-700 w-full max-w-md shadow-2xl p-6">
            <h3 className="text-lg font-bold text-gray-100 mb-4 flex items-center gap-2">
              <LogOut size={18} className="text-yellow-400" /> Kick Player
            </h3>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-400 mb-1">Reason (optional)</label>
              <input
                type="text"
                value={kickReason}
                onChange={(e) => setKickReason(e.target.value)}
                className="input w-full"
                placeholder="Kicked by operator"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => { setKickPlayerId(null); setKickReason(''); }} className="text-sm">Cancel</Button>
              <Button variant="danger" onClick={() => handleKick(kickPlayerId, kickReason)} className="text-sm">Kick</Button>
            </div>
          </div>
        </div>
      )}

      {/* ───── TEMP BAN MODAL ───── */}
      {tempBanPlayerId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-900 rounded-xl border border-surface-700 w-full max-w-md shadow-2xl p-6">
            <h3 className="text-lg font-bold text-gray-100 mb-4 flex items-center gap-2">
              <Clock size={18} className="text-yellow-400" /> Temp Ban
            </h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Duration</label>
                <select value={tempBanDuration} onChange={(e) => setTempBanDuration(e.target.value)} className="select w-full">
                  <option value="30m">30 minutes</option>
                  <option value="1h">1 hour</option>
                  <option value="6h">6 hours</option>
                  <option value="12h">12 hours</option>
                  <option value="1d">1 day</option>
                  <option value="3d">3 days</option>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={tempBanReason}
                  onChange={(e) => setTempBanReason(e.target.value)}
                  className="input w-full"
                  placeholder="Temporary ban"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => { setTempBanPlayerId(null); }} className="text-sm">Cancel</Button>
              <Button variant="danger" onClick={handleTempBan} className="text-sm">Apply Temp Ban</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
