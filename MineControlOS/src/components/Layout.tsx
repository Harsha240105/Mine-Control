import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  LayoutDashboard,
  Users,
  Terminal,
  Globe,
  Puzzle,
  HardDrive,
  Settings,
  Server,
  Power,
  PowerOff,
  RotateCcw,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Wifi,
  Map,
  Stethoscope,
} from 'lucide-react';
import { api } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
import NotificationPanel from './NotificationPanel';
import UpdateBanner from './UpdateBanner';
import toast from 'react-hot-toast';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/connection', label: 'Connection', icon: Wifi },
  { path: '/players', label: 'Players', icon: Users },
  { path: '/console', label: 'Console', icon: Terminal },
  { path: '/worlds', label: 'Worlds', icon: Globe },
  { path: '/map', label: 'Live Map', icon: Map },
  { path: '/plugins', label: 'Plugins', icon: Puzzle },
  { path: '/backups', label: 'Backups', icon: HardDrive },
  { path: '/diagnostics', label: 'Diagnostics', icon: Stethoscope },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const { user, logout, isOwner } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [serverRunning, setServerRunning] = useState(false);
  const [serverStarting, setServerStarting] = useState(false);
  const { socket, connected } = useSocket();
  const lastSocketUpdate = useRef(0);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const s = await api.getServerStatus();
        if (Date.now() - lastSocketUpdate.current > 3000) {
          setServerRunning(s.running);
          setServerStarting(s.starting);
        }
      } catch {}
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('server:status', (data: any) => {
      lastSocketUpdate.current = Date.now();
      setServerRunning(data.running);
      setServerStarting(data.starting || false);
    });
    return () => { socket.off('server:status'); };
  }, [socket]);

  const handleServerAction = async (action: 'start' | 'stop' | 'restart') => {
    try {
      if (action === 'start') {
        setServerStarting(true);
        await api.startServer();
        toast.success('Server starting...');
      } else if (action === 'stop') {
        setServerRunning(false);
        await api.stopServer();
        toast.success('Server stopped');
      } else {
        await api.restartServer();
        toast.success('Server restarting...');
      }
    } catch (err: any) {
      toast.error(err.message);
      if (action === 'start') {
        setServerStarting(false);
      }
    }
  };

  const statusDotClass = serverStarting
    ? 'status-dot-loading'
    : serverRunning
    ? 'status-dot-online'
    : 'status-dot-offline';

  return (
    <div className="min-h-screen flex bg-surface-950">
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-56'
        } transition-all duration-300 bg-surface-900 border-r border-surface-800 flex flex-col`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-surface-800 gap-3">
          <Server className="w-7 h-7 text-minecraft-500 flex-shrink-0" />
          {!collapsed && (
            <span className="font-bold text-sm tracking-wide">
              <span className="text-minecraft-400">Mine</span>
              <span className="text-gray-200">Control</span>
              <span className="text-minecraft-500">OS</span>
            </span>
          )}
        </div>

        {/* Server Status Bar */}
        {!collapsed && (
          <div className="px-3 py-3 border-b border-surface-800">
            <div className="flex items-center gap-2 mb-2">
              <span className={statusDotClass} />
              <span className="text-xs text-gray-400">
                {serverStarting ? 'Starting...' : serverRunning ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => handleServerAction('start')}
                disabled={serverRunning || serverStarting}
                className="flex-1 p-1.5 bg-green-600/20 hover:bg-green-600/30 rounded text-green-400 disabled:opacity-30"
                title="Start"
              >
                <Power className="w-3.5 h-3.5 mx-auto" />
              </button>
              <button
                onClick={() => handleServerAction('stop')}
                disabled={!serverRunning || serverStarting}
                className="flex-1 p-1.5 bg-red-600/20 hover:bg-red-600/30 rounded text-red-400 disabled:opacity-30"
                title="Stop"
              >
                <PowerOff className="w-3.5 h-3.5 mx-auto" />
              </button>
              <button
                onClick={() => handleServerAction('restart')}
                disabled={!serverRunning || serverStarting}
                className="flex-1 p-1.5 bg-yellow-600/20 hover:bg-yellow-600/30 rounded text-yellow-400 disabled:opacity-30"
                title="Restart"
              >
                <RotateCcw className="w-3.5 h-3.5 mx-auto" />
              </button>
            </div>
          </div>
        )}

        {/* Nav Items */}
        <nav className="flex-1 py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-minecraft-600/20 text-minecraft-400 border border-minecraft-500/20'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-surface-800'
                }`
              }
            >
              <item.icon className="w-4.5 h-4.5 flex-shrink-0" size={18} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-surface-800 p-3">
          <div className="flex items-center gap-2 mb-2 px-2">
            <div className="w-6 h-6 rounded-full bg-minecraft-600 flex items-center justify-center text-xs font-bold">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-200 truncate">{user?.username}</p>
                <p className="text-xs text-gray-500">{user?.role}</p>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={logout}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-400 hover:text-red-400 hover:bg-surface-800 rounded transition-colors"
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full mt-1 p-1.5 text-gray-500 hover:text-gray-300 hover:bg-surface-800 rounded transition-colors"
          >
            {collapsed ? <ChevronRight size={16} className="mx-auto" /> : <ChevronLeft size={16} className="mx-auto" />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 border-b border-surface-800 flex items-center justify-between px-6 bg-surface-900/50 backdrop-blur-sm">
          <h1 className="text-sm font-medium text-gray-200">MineControl OS</h1>
          <div className="flex items-center gap-3">
            <UpdateBanner />
            <NotificationPanel />
            <span className="text-xs text-gray-500">
              v1.0.12
            </span>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
