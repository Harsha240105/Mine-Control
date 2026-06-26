import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, Plus, Download, ChevronRight, Clock, Users, Play, BookOpen } from 'lucide-react';
import { api } from '../lib/api';

export default function Welcome() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      const data = await api.getServers();
      setServers(data.servers || []);
    } catch {
      // fallback
    }
    setLoading(false);
  };

  const startWizard = () => {
    navigate('/wizard');
  };

  const openServer = async (server: any) => {
    try {
      await api.selectServer(server.id);
      navigate('/dashboard');
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-minecraft-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-surface-900/30 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
        {/* Logo */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-surface-800/80 border border-surface-700/50 backdrop-blur-xl mb-6 glow">
            <Server className="w-10 h-10 text-minecraft-500" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-minecraft-400">Mine</span>
            <span className="text-gray-100">Control</span>
            <span className="text-minecraft-500">OS</span>
          </h1>
          <p className="text-gray-500 mt-2 text-lg">Create and manage your Minecraft servers with ease.</p>
        </div>

        {servers.length === 0 ? (
          // THE CROSSROADS
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full mb-10">
            <button onClick={startWizard} className="group relative p-8 rounded-2xl bg-gradient-to-br from-minecraft-600/20 to-minecraft-700/10 border-2 border-minecraft-500/30 hover:border-minecraft-500/60 hover:shadow-[0_0_30px_rgba(34,197,94,0.15)] transition-all duration-300 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-minecraft-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <Plus className="w-8 h-8 text-minecraft-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-100 mb-2">Create Server</h3>
              <p className="text-sm text-gray-400 leading-relaxed">Start fresh. Set up a brand new Minecraft server tailored exactly to your liking.</p>
            </button>

            <button onClick={() => navigate('/import')} className="group relative p-8 rounded-2xl bg-surface-800/50 border-2 border-surface-700/50 hover:border-surface-600 hover:bg-surface-800 transition-all duration-300 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-surface-700 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <Download className="w-8 h-8 text-gray-400 group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-2xl font-bold text-gray-100 mb-2">Import Server</h3>
              <p className="text-sm text-gray-400 leading-relaxed">Have an existing server folder or ZIP archive? Bring it straight into MineControl OS.</p>
            </button>
          </div>
        ) : (
          // Recent Servers
          <div className="w-full max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
                <Clock size={14} />
                Your Servers
              </h3>
              <button onClick={startWizard} className="text-xs btn-primary py-1.5 px-3 flex items-center gap-1.5">
                <Plus size={14} /> New Server
              </button>
            </div>
            
            <div className="space-y-3">
              {servers.map((server: any) => (
                <button
                  key={server.id}
                  onClick={() => openServer(server)}
                  className="w-full flex items-center gap-4 p-5 rounded-xl bg-surface-800/40 border border-surface-700/30 hover:border-surface-600/50 hover:bg-surface-800/60 transition-all duration-200 text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-minecraft-600/20 flex items-center justify-center border border-minecraft-500/20">
                    <Server className="w-6 h-6 text-minecraft-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-gray-100 truncate mb-1">{server.name}</p>
                    <p className="text-xs text-gray-500">
                      {server.version || 'Unknown Version'} &middot; {server.version_source || 'Unknown Software'}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
                      <Users size={14} />
                      <span>{server.maxPlayers} slots</span>
                    </div>
                    <div className="flex items-center justify-end gap-1.5 text-xs">
                      <span className={`w-2 h-2 rounded-full ${server.status === 'running' ? 'bg-green-500' : 'bg-gray-600'}`} />
                      <span className={server.status === 'running' ? 'text-green-400' : 'text-gray-500'}>
                        {server.status === 'running' ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-gray-600 group-hover:text-gray-400 transition-colors ml-2" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick nav */}
        <div className="mt-12 flex items-center gap-6">
          <button onClick={() => navigate('/guide')} className="text-sm font-medium text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-2">
            <BookOpen size={16} />
            Learn MineControl OS
          </button>
        </div>
      </div>
    </div>
  );
}