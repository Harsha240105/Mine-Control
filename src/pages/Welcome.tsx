import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, Plus, FolderOpen, Download, BookOpen, Settings, ChevronRight, Clock, Users, Play, Wifi } from 'lucide-react';

export default function Welcome() {
  const navigate = useNavigate();
  const [recentServers, setRecentServers] = useState<any[]>([]);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('mc_servers');
      if (stored) setRecentServers(JSON.parse(stored));
    } catch {}
  }, []);

  const startWizard = () => {
    setShowWizard(true);
    navigate('/wizard');
  };

  const openServer = (server: any) => {
    localStorage.setItem('mc_active_server', JSON.stringify(server));
    navigate('/dashboard');
  };

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
        <div className="mb-8 text-center">
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

        {/* Main Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-3xl w-full mb-10">
          <button onClick={startWizard} className="group relative p-5 rounded-xl bg-gradient-to-br from-minecraft-600/20 to-minecraft-700/10 border border-minecraft-500/30 hover:border-minecraft-500/60 transition-all duration-300 text-left">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-minecraft-600/30 flex items-center justify-center">
                <Plus className="w-5 h-5 text-minecraft-400" />
              </div>
            </div>
            <h3 className="text-sm font-semibold text-gray-200">Create New Server</h3>
            <p className="text-xs text-gray-500 mt-1">Set up a new Minecraft server from scratch</p>
          </button>

          <button className="group relative p-5 rounded-xl bg-surface-800/50 border border-surface-700/50 hover:border-surface-600 transition-all duration-300 text-left">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-surface-700/50 flex items-center justify-center">
                <FolderOpen className="w-5 h-5 text-gray-400" />
              </div>
            </div>
            <h3 className="text-sm font-semibold text-gray-200">Open Existing Server</h3>
            <p className="text-xs text-gray-500 mt-1">Browse for an existing server folder</p>
          </button>

          <button onClick={() => navigate('/import')} className="group relative p-5 rounded-xl bg-surface-800/50 border border-surface-700/50 hover:border-surface-600 transition-all duration-300 text-left">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-surface-700/50 flex items-center justify-center">
                <Download className="w-5 h-5 text-gray-400" />
              </div>
            </div>
            <h3 className="text-sm font-semibold text-gray-200">Import Existing Server</h3>
            <p className="text-xs text-gray-500 mt-1">Import from a ZIP or another location</p>
          </button>

          <button onClick={() => navigate('/settings')} className="group relative p-5 rounded-xl bg-surface-800/50 border border-surface-700/50 hover:border-surface-600 transition-all duration-300 text-left">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-surface-700/50 flex items-center justify-center">
                <Settings className="w-5 h-5 text-gray-400" />
              </div>
            </div>
            <h3 className="text-sm font-semibold text-gray-200">Settings</h3>
            <p className="text-xs text-gray-500 mt-1">Configure MineControl OS</p>
          </button>
        </div>

        {/* Recent Servers */}
        {recentServers.length > 0 && (
          <div className="w-full max-w-3xl">
            <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
              <Clock size={14} />
              Recent Servers
            </h3>
            <div className="space-y-2">
              {recentServers.map((server: any, i: number) => (
                <button
                  key={i}
                  onClick={() => openServer(server)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-surface-800/40 border border-surface-700/30 hover:border-surface-600/50 hover:bg-surface-800/60 transition-all duration-200 text-left group"
                >
                  <div className="w-10 h-10 rounded-lg bg-minecraft-600/20 flex items-center justify-center">
                    <Server className="w-5 h-5 text-minecraft-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">{server.name || 'My Server'}</p>
                    <p className="text-xs text-gray-500">
                      {server.version || '1.21'} &middot; {server.software || 'Paper'}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Users size={12} />
                      <span>{server.players || 0}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-green-400 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      Online
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick nav for returning users */}
        <div className="mt-8 flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5">
            <Play size={14} />
            Skip to Dashboard
          </button>
          <span className="text-gray-700">|</span>
          <button onClick={() => navigate('/guide')} className="text-sm text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5">
            <BookOpen size={14} />
            Learn MineControl
          </button>
        </div>
      </div>
    </div>
  );
}