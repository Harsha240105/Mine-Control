import React, { useEffect, useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Shield,
  Ban,
  VolumeX,
  Volume2,
  LogOut,
  Trash2,
  UserCheck,
  UserX,
  MoreHorizontal,
  ChevronDown,
  Filter,
} from 'lucide-react';
import { api } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
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
}

const ROLE_COLORS: Record<string, string> = {
  Owner: 'text-red-400 border-red-500/20 bg-red-500/10',
  Admin: 'text-orange-400 border-orange-500/20 bg-orange-500/10',
  Moderator: 'text-green-400 border-green-500/20 bg-green-500/10',
  'Trusted Member': 'text-cyan-400 border-cyan-500/20 bg-cyan-500/10',
  Member: 'text-gray-400 border-gray-500/20 bg-gray-500/10',
  Guest: 'text-gray-500 border-gray-500/20 bg-gray-500/5',
};

export default function Players() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [whitelist, setWhitelist] = useState<any[]>([]);
  const [banned, setBanned] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState('Member');
  const [tab, setTab] = useState<'players' | 'whitelist' | 'banned'>('players');
  const { socket } = useSocket();

  useEffect(() => {
    fetchPlayers();
    fetchWhitelist();
    fetchBanned();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('player:join', (username: string) => {
      toast.success(`${username} joined the game`);
      fetchPlayers();
    });
    socket.on('player:leave', (username: string) => {
      toast(`${username} left the game`, { icon: '👋' });
      fetchPlayers();
    });
    return () => {
      socket.off('player:join');
      socket.off('player:leave');
    };
  }, [socket]);

  const fetchPlayers = async () => {
    try {
      const data = await api.getPlayers();
      setPlayers(data);
    } catch {}
  };

  const fetchWhitelist = async () => {
    try {
      const data = await api.getWhitelist();
      setWhitelist(data);
    } catch {}
  };

  const fetchBanned = async () => {
    try {
      const data = await api.getBannedPlayers();
      setBanned(data);
    } catch {}
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.addToWhitelist(newUsername);
      toast.success(`Added ${newUsername} to whitelist`);
      setNewUsername('');
      setShowAdd(false);
      fetchWhitelist();
      fetchPlayers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRemoveFromWhitelist = async (username: string) => {
    try {
      await api.removeFromWhitelist(username);
      toast.success(`Removed ${username} from whitelist`);
      fetchWhitelist();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRoleChange = async (playerId: string, role: string) => {
    try {
      await api.updatePlayer(playerId, { role });
      toast.success('Role updated');
      fetchPlayers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleBan = async (playerId: string) => {
    try {
      await api.banPlayer(playerId);
      toast.success('Player banned');
      fetchPlayers();
      fetchBanned();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUnban = async (playerId: string) => {
    try {
      await api.unbanPlayer(playerId);
      toast.success('Player unbanned');
      fetchPlayers();
      fetchBanned();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleKick = async (playerId: string) => {
    try {
      await api.kickPlayer(playerId);
      toast.success('Player kicked');
      fetchPlayers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleMute = async (playerId: string, muted: boolean) => {
    try {
      if (muted) {
        await api.unmutePlayer(playerId);
        toast.success('Player unmuted');
      } else {
        await api.mutePlayer(playerId);
        toast.success('Player muted');
      }
      fetchPlayers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const filteredPlayers = players.filter((p) =>
    p.username.toLowerCase().includes(search.toLowerCase())
  );

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Player Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">{players.length} total players</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Add Player
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-900 p-1 rounded-lg w-fit border border-surface-800">
        {(['players', 'whitelist', 'banned'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              tab === t ? 'bg-minecraft-600/20 text-minecraft-400' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t}
            {t === 'players' && <span className="ml-1.5 text-xs opacity-60">({players.length})</span>}
            {t === 'whitelist' && <span className="ml-1.5 text-xs opacity-60">({whitelist.length})</span>}
            {t === 'banned' && <span className="ml-1.5 text-xs opacity-60">({banned.length})</span>}
          </button>
        ))}
      </div>

      {/* Search */}
      {tab === 'players' && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
            placeholder="Search players..."
          />
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
            <button type="submit" className="btn-primary">Add</button>
          </form>
        </div>
      )}

      {/* Players Table */}
      {tab === 'players' && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-800">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Player</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Role</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Playtime</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Last Login</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((player) => (
                  <tr key={player.id} className="border-b border-surface-800/50 hover:bg-surface-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-surface-700 flex items-center justify-center text-sm font-bold text-gray-300">
                          {player.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-200">{player.username}</p>
                          <p className="text-xs text-gray-500 font-mono">{player.uuid?.slice(0, 8) || 'N/A'}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className={statusDot(player.status)} />
                        <span className="text-xs capitalize">{player.status}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={player.role}
                        onChange={(e) => handleRoleChange(player.id, e.target.value)}
                        className="text-xs bg-surface-800 border border-surface-700 rounded px-2 py-1 text-gray-200"
                        disabled={player.role === 'Owner'}
                      >
                        {Object.keys(ROLE_COLORS).map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {formatPlaytime(player.playtime)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {player.last_login ? new Date(player.last_login).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {player.status === 'online' && (
                          <button
                            onClick={() => handleKick(player.id)}
                            className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-surface-700 rounded transition-colors"
                            title="Kick"
                          >
                            <LogOut size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleMute(player.id, !!player.muted)}
                          className={`p-1.5 rounded transition-colors ${
                            player.muted ? 'text-green-400 hover:bg-green-500/10' : 'text-gray-400 hover:text-yellow-400 hover:bg-surface-700'
                          }`}
                          title={player.muted ? 'Unmute' : 'Mute'}
                        >
                          {player.muted ? <Volume2 size={14} /> : <VolumeX size={14} />}
                        </button>
                        {player.role !== 'Owner' && (
                          <button
                            onClick={() => handleBan(player.id)}
                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                            title="Ban"
                          >
                            <Ban size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredPlayers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">
                      No players found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Whitelist Tab */}
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
                      <button
                        onClick={() => handleRemoveFromWhitelist(w.username)}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      >
                        <UserX size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {whitelist.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">No whitelisted players</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Banned Tab */}
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
                    <td className="px-4 py-3 text-sm text-gray-400">{b.reason}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{b.banned_by}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{new Date(b.banned_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleUnban(b.id)}
                        className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded transition-colors"
                      >
                        <UserCheck size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {banned.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">No banned players</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
