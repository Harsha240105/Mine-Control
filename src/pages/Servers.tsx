import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, Plus, Settings, Play, Square,
  Globe, Wifi, Database, Cpu, HardDrive, RefreshCw,
  AlertTriangle, CheckCircle, XCircle, ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

interface ServerRecord {
  id: string;
  name: string;
  slug: string;
  port: number;
  directory: string;
  version: string;
  version_source: string;
  javaPath: string;
  jarFile: string;
  minRam: string;
  maxRam: string;
  motd: string;
  difficulty: string;
  gamemode: string;
  pvp: boolean;
  maxPlayers: number;
  viewDistance: number;
  onlineMode: boolean;
  autoRestart: boolean;
  autoBackup: boolean;
  whitelistEnabled: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function Servers() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPort, setNewPort] = useState('25565');
  const [creating, setCreating] = useState(false);
  const [serverStatus, setServerStatus] = useState<Record<string, any>>({});

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchServers = async () => {
    try {
      const data = await api.getServers();
      setServers(data.servers);
      setActiveId(data.activeServerId);
    } catch {}
    setLoading(false);
  };

  const handleSelect = async (id: string) => {
    if (id === activeId) return;
    const server = servers.find(s => s.id === id);
    if (!server) return;

    try {
      await api.selectServer(id);
      setActiveId(id);
      toast.success(`Switched to ${server.name}`);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const result = await api.createServer({
        name: newName.trim(),
        port: parseInt(newPort) || 25565,
      });
      setServers(prev => [...prev, result.server]);
      setShowCreate(false);
      setNewName('');
      setNewPort('25565');
      toast.success(`Server "${result.server.name}" created!`);
    } catch (err: any) {
      toast.error(err.message);
    }
    setCreating(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Servers</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage your Minecraft servers</p>
        </div>
        <button
          onClick={() => navigate('/wizard')}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          New Server
        </button>
      </div>

      {servers.length === 0 ? (
        <div className="card text-center py-12">
          <Server size={48} className="mx-auto text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold text-gray-300 mb-2">No Servers Yet</h3>
          <p className="text-sm text-gray-500 mb-6">Create your first Minecraft server to get started.</p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => navigate('/wizard')}
              className="btn-primary"
            >
              Create Server
            </button>
            <button
              onClick={() => navigate('/import')}
              className="btn-secondary"
            >
              Import Server
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {servers.map(server => {
            const isActive = server.id === activeId;
            return (
              <div
                key={server.id}
                className={`card-hover relative overflow-hidden ${
                  isActive ? 'ring-2 ring-minecraft-500/40' : ''
                }`}
              >
                {/* Active badge */}
                {isActive && (
                  <div className="absolute top-0 right-0">
                    <div className="bg-minecraft-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">
                      ACTIVE
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3 mb-4">
                  <div className={`p-2.5 rounded-lg ${
                    isActive ? 'bg-minecraft-500/10 text-minecraft-400' : 'bg-surface-800 text-gray-400'
                  }`}>
                    <Server size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-200 truncate">{server.name}</h3>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{server.slug}</p>
                  </div>
                </div>

                {/* Quick Info */}
                <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <Globe size={12} />
                    Port {server.port}
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <Wifi size={12} />
                    {server.maxPlayers} slots
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <Cpu size={12} />
                    {server.version || '?'}
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <HardDrive size={12} />
                    {server.version_source || '?'}
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center justify-between pt-3 border-t border-surface-700/50">
                  <span className={`flex items-center gap-1.5 text-xs ${
                    server.status === 'running' ? 'text-green-400' :
                    server.status === 'starting' ? 'text-yellow-400' :
                    'text-gray-500'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      server.status === 'running' ? 'bg-green-500' :
                      server.status === 'starting' ? 'bg-yellow-500 animate-pulse' :
                      'bg-gray-500'
                    }`} />
                    {server.status === 'running' ? 'Online' :
                     server.status === 'starting' ? 'Starting...' : 'Offline'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleSelect(server.id)}
                      disabled={isActive}
                      className={`p-1.5 rounded-lg text-xs transition-colors ${
                        isActive
                          ? 'bg-green-500/10 text-green-400/50 cursor-default'
                          : 'bg-minecraft-500/15 text-minecraft-400 hover:bg-minecraft-500/25'
                      }`}
                      title="Switch to this server"
                    >
                      <Play size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
