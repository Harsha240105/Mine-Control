import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, animate, useVelocity } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import {
  LayoutDashboard, Users, Terminal, Globe, Puzzle, Palette, Package, HardDrive, Settings, Server,
  Power, PowerOff, RotateCcw, Cpu, Coffee, LogOut, ChevronDown, Wifi, Stethoscope, BookOpen,
  Github, Home, Layers, CheckCircle, Clock, MessageSquare, MessageCircle, Shield, Radio, Trash2, Zap, Lock, RefreshCw
} from 'lucide-react';
import { api } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
import { useActiveServer } from '../hooks/useActiveServer';
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
  { path: '/mods', label: 'Mods', icon: Puzzle },
  { path: '/shaders', label: 'Shaders', icon: Palette },
  { path: '/resourcepacks', label: 'Packs', icon: Package },
  { path: '/worlds', label: 'Worlds', icon: Globe },
  { path: '/backups', label: 'Backups', icon: HardDrive },
  { path: '/scheduler', label: 'Scheduler', icon: Clock },
  { path: '/connection', label: 'Connection', icon: Wifi },
  { path: '/discord', label: 'Discord', icon: MessageSquare },
  { path: '/feedback', label: 'Feedback', icon: MessageCircle },
];

const bottomNavItems = [
  { path: '/java', label: 'Java', icon: Coffee },
  { path: '/settings/performance', label: 'Performance', icon: Zap },
  { path: '/settings/security', label: 'Security', icon: Lock },
  { path: '/github/diagnostics', label: 'GitHub Sync', icon: Github, ownerOnly: true },
  { path: '/connection/wizard', label: 'Connect Wizard', icon: Radio },
  { path: '/diagnostics', label: 'Diagnostics', icon: Stethoscope },
  { path: '/guide', label: 'Guide', icon: BookOpen },
  { path: '/privacy', label: 'Privacy', icon: Shield },
  { path: '/admin/users', label: 'Users', icon: Users, ownerOnly: true },
  { path: '/updates', label: 'Updates', icon: RefreshCw },
  { path: '/uninstall', label: 'Uninstall', icon: Trash2 },
];

function CarouselItem({ item, i, smoothScroll, isHovered, N, bulgeValue, handleItemClick }: any) {
  const offset = useTransform(smoothScroll, (v: number) => {
    return (((i - v) % N) + N + N/2) % N - N/2;
  });

  const y = useTransform(offset, (v) => v * 64);

  const curveX = useTransform(() => {
    const v = offset.get();
    const bulge = bulgeValue.get();
    if (bulge <= 72) return 14; 
    const extraBulge = bulge - 72;
    const strength = Math.max(0, 1 - Math.pow(v / 4.5, 2)); 
    return 14 + strength * (extraBulge - 50); 
  });

  const scale = useTransform(offset, [-4.5, -1.5, 0, 1.5, 4.5], [0.75, 0.95, 1.25, 0.95, 0.75]);
  const opacity = useTransform(offset, [-4.5, -1.5, 0, 1.5, 4.5], [0, 0.7, 1, 0.7, 0]);
  const blur = useTransform(offset, [-4.5, -1.5, 0, 1.5, 4.5], ['blur(2px)', 'blur(0px)', 'blur(0px)', 'blur(0px)', 'blur(2px)']);

  const zIndex = useTransform(offset, v => 100 - Math.round(Math.abs(v)*10));
  const active = useTransform(offset, (v) => Math.abs(v) < 0.2);
  const [isCenter, setIsCenter] = useState(false);

  useEffect(() => {
    return active.onChange((v) => setIsCenter(v));
  }, [active]);

  const bgColor = useTransform(offset, [-0.5, 0, 0.5], ['rgba(59,130,246,0)', 'rgba(59,130,246,0.3)', 'rgba(59,130,246,0)']);
  const borderColor = useTransform(offset, [-0.5, 0, 0.5], ['rgba(96,165,250,0)', 'rgba(96,165,250,0.5)', 'rgba(96,165,250,0)']);
  const boxShadow = useTransform(offset, [-0.5, 0, 0.5], ['0 0 0px rgba(59,130,246,0)', '0 0 20px rgba(59,130,246,0.5)', '0 0 0px rgba(59,130,246,0)']);
  const color = useTransform(offset, [-0.5, 0, 0.5], ['#9ca3af', '#60a5fa', '#9ca3af']);

  return (
    <motion.div
      style={{
        position: 'absolute',
        top: '50%',
        marginTop: -22,
        y,
        x: curveX,
        scale,
        opacity,
        filter: blur,
        zIndex,
        pointerEvents: isHovered ? 'auto' : (isCenter ? 'auto' : 'none'),
        willChange: 'transform, opacity, filter'
      }}
      className="flex items-center"
      onClick={() => handleItemClick(i)}
    >
      <motion.div 
        style={{
          backgroundColor: bgColor,
          borderColor: borderColor,
          boxShadow: boxShadow,
          color: color
        }}
        className="w-[44px] h-[44px] flex items-center justify-center rounded-[16px] border cursor-pointer"
      >
        <item.icon size={isCenter ? 24 : 20} strokeWidth={isCenter ? 2.5 : 2} />
      </motion.div>
      <AnimatePresence>
        {isHovered && isCenter && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 16 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute left-[44px] whitespace-nowrap text-white font-medium drop-shadow-lg text-[15px] pointer-events-none"
          >
             <div className="flex items-center gap-3">
                 <div className="w-12 h-[1.5px] bg-white/20" />
                 {item.label}
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Layout() {
  const { user, logout, isOwner } = useAuth();
  const { server: activeServer, servers: serverList, refresh: refreshServers } = useActiveServer();
  const navigate = useNavigate();
  const [serverRunning, setServerRunning] = useState(false);
  const [serverStarting, setServerStarting] = useState(false);
  const [showServerDropdown, setShowServerDropdown] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('Unknown');
  const { socket, connected: socketConnected } = useSocket();
  const lastSocketUpdate = useRef(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [initialStatusLoaded, setInitialStatusLoaded] = useState(false);
  const [backendAlive, setBackendAlive] = useState(true);

  const allItems = [
    { path: '/', label: 'Server Home', icon: Server },
    ...navItems,
    ...bottomNavItems.filter((item) => !(item as any).ownerOnly || isOwner)
  ];
  const N = allItems.length;

  const targetScroll = useMotionValue(0);
  const smoothScroll = useSpring(targetScroll, { stiffness: 180, damping: 26, mass: 0.7 });
  const scrollVelocity = useVelocity(smoothScroll);

  const [isHovered, setIsHovered] = useState(false);
  const bulgeValue = useSpring(72, { stiffness: 180, damping: 26, mass: 0.7 });
  const [h, setH] = useState(window.innerHeight - 32);
  const snapTimeout = useRef<NodeJS.Timeout | null>(null);
  const navTimeout = useRef<NodeJS.Timeout | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isHovered) {
      timeout = setTimeout(() => {
        bulgeValue.set(260);
      }, 40);
    } else {
      bulgeValue.set(72);
    }
    return () => clearTimeout(timeout);
  }, [isHovered, bulgeValue]);

  useEffect(() => {
    const onResize = () => setH(window.innerHeight - 32);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
     let idx = allItems.findIndex(i => i.path !== '/' && window.location.pathname.startsWith(i.path));
     if (idx === -1 && window.location.pathname === '/') idx = 0;
     targetScroll.set(idx > -1 ? idx : 0);
  }, []);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * 0.003; 
      targetScroll.set(targetScroll.get() + delta);
      
      if (snapTimeout.current) clearTimeout(snapTimeout.current);
      if (navTimeout.current) clearTimeout(navTimeout.current);
      
      snapTimeout.current = setTimeout(() => {
        const rounded = Math.round(targetScroll.get());
        targetScroll.set(rounded); // this triggers the spring to snap beautifully!
        
        navTimeout.current = setTimeout(() => {
          const itemIndex = ((rounded % N) + N) % N;
          navigate(allItems[itemIndex].path);
        }, 250);
      }, 150);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [N, navigate, targetScroll]);

  const handleItemClick = (index: number) => {
    const current = targetScroll.get();
    const currentInt = Math.round(current);
    const curMod = ((currentInt % N) + N) % N;
    
    let diff = index - curMod;
    if (diff > N / 2) diff -= N;
    if (diff < -N / 2) diff += N;
    
    const target = currentInt + diff;
    
    targetScroll.set(target);
    if (navTimeout.current) clearTimeout(navTimeout.current);
    navTimeout.current = setTimeout(() => {
        navigate(allItems[index].path);
    }, 250);
  };

  const svgPath = useTransform(() => {
    const bulge = bulgeValue.get();
    const vel = scrollVelocity.get();
    const yOffset = Math.max(-150, Math.min(150, vel * 12)); 
    return `M 30 0 L 72 0 C ${bulge} ${h*0.2 + yOffset}, ${bulge} ${h*0.8 + yOffset}, 72 ${h} L 30 ${h} C 13 ${h}, 0 ${h-13}, 0 ${h-30} L 0 30 C 0 13, 13 0, 30 0 Z`;
  });

  // Other side-effects for status...
  useEffect(() => {
    if (window.electronAPI?.getVersion) {
      window.electronAPI.getVersion().then(setAppVersion).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(refreshServers, 30000);
    return () => clearInterval(interval);
  }, [refreshServers]);

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
    } catch {}
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
        // socket covers this
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
    return () => { clearInterval(statusInterval); clearInterval(healthInterval); };
  }, []);

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
      if (action === 'start') setServerStarting(false);
    }
  };

  const statusDotClass = serverStarting
    ? 'status-dot-loading'
    : serverRunning
    ? 'status-dot-online'
    : 'status-dot-offline';

  return (
    <div className="min-h-screen flex bg-[#0A0D14] font-inter">
      {/* Container for curved floating sidebar */}
      <motion.aside
        ref={sidebarRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="fixed left-4 top-4 bottom-4 z-50 pointer-events-none"
        style={{ width: 350 }} 
      >
        <svg 
          className="absolute inset-0 drop-shadow-[0_0_30px_rgba(59,130,246,0.1)] pointer-events-auto cursor-ns-resize" 
          width="350" 
          height={h}
        >
          <motion.path 
            d={svgPath}
            fill="#0E1422" 
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        </svg>

        {/* Carousel Items Container */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ width: 350 }}>
          {allItems.map((item, i) => (
            <CarouselItem 
               key={item.path} 
               item={item} 
               i={i} 
               smoothScroll={smoothScroll} 
               isHovered={isHovered} 
               N={N} 
               bulgeValue={bulgeValue}
               handleItemClick={handleItemClick}
            />
          ))}
        </div>

        {/* Gradient Mask to prevent icons overlapping profile at bottom on short screens */}
        <div className="absolute bottom-0 left-0 w-[350px] h-[150px] bg-gradient-to-t from-[#0E1422] to-transparent pointer-events-none z-30" style={{ opacity: isHovered ? 0 : 1, transition: 'opacity 0.3s' }} />

        {/* Fixed Profile Section at bottom */}
        <div className="absolute bottom-4 left-0 w-[72px] flex flex-col items-center gap-4 z-50 pointer-events-auto">
          <div className="w-10 h-[1px] bg-white/10" />
          
          <div className="flex flex-col items-center gap-1.5 w-full cursor-default">
            <div className="w-[40px] h-[40px] rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-sm font-bold border border-blue-500/20 shadow-inner shrink-0">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <span className="text-[10px] font-medium text-gray-400 tracking-wide w-full text-center px-1 truncate">
              {user?.username || 'vUnknown'}
            </span>
          </div>

          <div className="w-10 h-[1px] bg-white/10 flex-shrink-0" />

          <div className="relative w-full flex justify-center pb-2">
            <button
              onClick={logout}
              className="w-[40px] h-[40px] rounded-full bg-[#0E1422] border-[1.5px] border-[rgba(59,130,246,0.5)] flex items-center justify-center text-red-400 hover:text-red-300 z-50 cursor-pointer shadow-[0_0_12px_rgba(59,130,246,0.2)] hover:shadow-[0_0_24px_rgba(96,165,250,0.5)] transition-all duration-300"
            >
              <PowerOff size={20} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 pl-[108px]">
        {/* Top Bar */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#0A0D14]/80 backdrop-blur-md sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <h1 className="text-[15px] font-semibold text-gray-200 tracking-wide">MineControl OS</h1>
            
            {/* Server Status Controls */}
            <div className="flex items-center gap-2 ml-4 bg-[#11141B] px-3 py-1.5 rounded-full border border-white/5 shadow-sm">
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowServerDropdown(!showServerDropdown)}
                  className="flex items-center gap-2 text-xs font-medium text-gray-300 hover:text-white transition-colors"
                >
                  <Layers size={13} className="text-blue-400" />
                  <span>{activeServer?.name || 'No Server'}</span>
                  <ChevronDown size={12} className={`transition-transform ${showServerDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showServerDropdown && (
                  <div className="absolute left-0 top-full mt-2 w-48 z-50 bg-[#1B1F2A] border border-white/10 rounded-xl shadow-2xl py-1.5">
                    {serverList.map(s => (
                      <button
                        key={s.id}
                        onClick={() => handleSwitchServer(s.id)}
                        className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors ${
                          s.id === activeServer?.id
                            ? 'text-blue-400 bg-blue-500/10'
                            : 'text-gray-300 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Server size={12} />
                        <span className="truncate flex-1">{s.name}</span>
                        {s.id === activeServer?.id && <CheckCircle size={12} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="w-[1px] h-3 bg-white/10 mx-1" />
              <div className="flex items-center gap-1.5">
                <span className={statusDotClass} />
                <span className="text-xs text-gray-400">{serverStarting ? 'Starting' : serverRunning ? 'Online' : 'Offline'}</span>
              </div>
              <div className="flex items-center gap-1 ml-2">
                 <button onClick={() => handleServerAction('start')} disabled={serverRunning || serverStarting} className="p-1 text-green-400 hover:bg-green-500/20 rounded disabled:opacity-30"><Power size={12} /></button>
                 <button onClick={() => handleServerAction('stop')} disabled={!serverRunning || serverStarting} className="p-1 text-red-400 hover:bg-red-500/20 rounded disabled:opacity-30"><PowerOff size={12} /></button>
                 <button onClick={() => handleServerAction('restart')} disabled={!serverRunning || serverStarting} className="p-1 text-yellow-400 hover:bg-yellow-500/20 rounded disabled:opacity-30"><RotateCcw size={12} /></button>
              </div>
            </div>

            {!backendAlive && (
              <span className="flex items-center gap-1.5 text-[11px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full border border-red-500/20 ml-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Backend Offline
              </span>
            )}
            {backendAlive && !socketConnected && (
              <span className="flex items-center gap-1.5 text-[11px] bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/20 ml-2">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                Reconnecting...
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <UpdateBanner />
            <NotificationPanel />
            <button
              onClick={() => navigate('/guide')}
              className="p-1.5 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-surface-800"
              title="Guide & Knowledge Center"
            >
              <BookOpen size={16} />
            </button>
            <span className="text-xs text-gray-500 font-medium">
              v{appVersion}
            </span>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
