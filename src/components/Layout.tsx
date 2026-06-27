import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
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
  Cpu,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Wifi,
  Map,
  Stethoscope,
  BookOpen,
  Github,
  Home,
  Plus,
  Layers,
  CheckCircle,
  Cable,
  Clock,
  Bell,
  RefreshCw,
  FolderOpen,
  MessageSquare,
  MessageCircle,
  Shield
} from 'lucide-react';
import { api } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
import NotificationPanel from './NotificationPanel';
import UpdateBanner from './UpdateBanner';
import toast from 'react-hot-toast';

const navItems = [
  { path: '/dashboard', label: 'Server', icon: LayoutDashboard },
  { path: '/software', label: 'Software', icon: Cpu },
  { path: '/settings', label: 'Options', icon: Settings },
  { path: '/console', label: 'Console', icon: Terminal },
  { path: '/players', label: 'Players', icon: Users },
  { path: '/plugins', label: 'Plugins', icon: Puzzle },
  { path: '/worlds', label: 'Worlds', icon: Globe },
  { path: '/backups', label: 'Backups', icon: HardDrive },
  { path: '/scheduler', label: 'Scheduler', icon: Clock },
  { path: '/connection', label: 'Connection', icon: Wifi },
  { path: '/discord', label: 'Discord', icon: MessageSquare },
  { path: '/feedback', label: 'Feedback', icon: MessageCircle },
];

const bottomNavItems = [
  { path: '/diagnostics', label: 'Diagnostics', icon: Stethoscope },
  { path: '/guide', label: 'Guide', icon: BookOpen },
  { path: '/privacy', label: 'Privacy', icon: Shield },
];

export default function Layout() {
  const { user, logout, isOwner } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [serverRunning, setServerRunning] = useState(false);
  const [serverStarting, setServerStarting] = useState(false);
  const [serverList, setServerList] = useState<any[]>([]);
  const [activeServerName, setActiveServerName] = useState('');
  const [showServerDropdown, setShowServerDropdown] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('Unknown');
  const { socket, connected: socketConnected, error: socketError } = useSocket();
  const lastSocketUpdate = useRef(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [initialStatusLoaded, setInitialStatusLoaded] = useState(false);
  const [backendAlive, setBackendAlive] = useState(true);

  useEffect(() => {
    if (window.electronAPI?.getVersion) {
      window.electronAPI.getVersion().then(setAppVersion).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const data = await api.getServers();
        setServerList(data.servers);
        const active = data.servers.find((s: any) => s.id === data.activeServerId);
        setActiveServerName(active?.name || '');
      } catch {}
    };
    fetchServers();
    const interval = setInterval(fetchServers, 30000);
    return () => clearInterval(interval);
  }, [navigate]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowServerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSwitchServer = async (id: string) => {
    try {
      await api.selectServer(id);
      setShowServerDropdown(false);
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const s = await api.getServerStatus();
        if (Date.now() - lastSocketUpdate.current > 5000) {
          setServerRunning(s.running);
          setServerStarting(s.starting);
        }
        setInitialStatusLoaded(true);
        setBackendAlive(true);
      } catch {
        // Socket will update status when connected
      }
    };

    const checkHealth = async () => {
      try {
        await api.health();
        setBackendAlive(true);
      } catch {
        setBackendAlive(false);
      }
    };

    fetchStatus();
    const statusInterval = setInterval(fetchStatus, 10000);
    const healthInterval = setInterval(checkHealth, 5000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(healthInterval);
    };
  }, []);

  // Auto-recovery: when backend becomes available again, reload
  useEffect(() => {
    if (backendAlive && !initialStatusLoaded) {
      const timer = setTimeout(() => {
        setInitialStatusLoaded(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [backendAlive]);

  useEffect(() => {
    if (!socket) return;
    socket.on('server:status', (data: any) => {
      lastSocketUpdate.current = Date.now();
      setServerRunning(data.running);
      setServerStarting(data.starting || false);
    });
    socket.on('server:update', (data: any) => {
      lastSocketUpdate.current = Date.now();
      setServerRunning(data.running);
      setServerStarting(data.starting || false);
    });
    return () => {
      socket.off('server:status');
      socket.off('server:update');
    };
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
            {/* Active Server Dropdown */}
            <div className="relative mb-2" ref={dropdownRef}>
              <button
                onClick={() => setShowServerDropdown(!showServerDropdown)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg bg-surface-800/50 border border-surface-700/50 hover:border-surface-600 transition-all text-left"
              >
                <Layers size={14} className="text-minecraft-400 shrink-0" />
                <span className="text-xs text-gray-200 truncate flex-1">
                  {activeServerName || 'No Server'}
                </span>
                <ChevronDown size={12} className={`text-gray-500 transition-transform ${showServerDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showServerDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-surface-800 border border-surface-700 rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto">
                  {serverList.map(s => (
                    <button
                      key={s.id}
                      onClick={() => handleSwitchServer(s.id)}
                      className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors ${
                        s.name === activeServerName
                          ? 'text-minecraft-400 bg-minecraft-500/10'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-surface-700/50'
                      }`}
                    >
                      <Server size={12} className="shrink-0" />
                      <span className="truncate flex-1">{s.name}</span>
                      {s.name === activeServerName && <CheckCircle size={12} className="text-minecraft-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

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

        {collapsed && (
          <div className="px-2 py-3 border-b border-surface-800 flex flex-col items-center gap-2">
            <div className={statusDotClass} />
            <button
              onClick={() => navigate('/servers')}
              className="p-1.5 text-gray-400 hover:text-minecraft-400 transition-colors"
              title="Servers"
            >
              <Layers size={16} />
            </button>
          </div>
        )}

        {/* Servers Button */}
        {!collapsed && (
          <div className="px-3 pt-2 pb-1">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-minecraft-400 bg-minecraft-600/10 border border-minecraft-500/20 hover:bg-minecraft-600/20 transition-all"
            >
              <Home size={16} />
              <span>Server Home</span>
            </button>
          </div>
        )}

        {/* Nav Items */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {collapsed && (
            <button
              onClick={() => navigate('/')}
              className="flex items-center justify-center w-full px-2 py-2 text-gray-400 hover:text-minecraft-400 transition-colors"
              title="Server Home"
            >
              <Home size={18} />
            </button>
          )}
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

          {/* Bottom Nav Items */}
          <div className="mt-auto mb-2 pt-4 px-2">
            {bottomNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-minecraft-600/20 text-minecraft-400 border border-minecraft-500/20'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-surface-800'
                  }`
                }
              >
                <item.icon className="w-4.5 h-4.5 flex-shrink-0" size={16} />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            ))}
          </div>
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
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-medium text-gray-200">MineControl OS</h1>
            {!backendAlive && (
              <span className="flex items-center gap-1.5 text-[11px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full border border-red-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Backend Offline
              </span>
            )}
            {backendAlive && !socketConnected && (
              <span className="flex items-center gap-1.5 text-[11px] bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                Reconnecting...
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <UpdateBanner />
            <NotificationPanel />
            <span className="text-xs text-gray-500">
              v{appVersion}
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
