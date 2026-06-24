import React from 'react';
import { useServer } from '../../context/ServerContext';
import { Wifi, WifiOff, Activity, Users, Clock } from 'lucide-react';

export default function Header() {
  const { status } = useServer();

  const formatUptime = (seconds) => {
    if (!seconds || seconds <= 0) return '--';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <header className="h-16 bg-surface-900/80 backdrop-blur-xl border-b border-surface-800 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {status.running ? (
            <>
              <Wifi className="w-5 h-5 text-green-500" />
              <span className="text-green-500 font-medium text-sm">Online</span>
            </>
          ) : (
            <>
              <WifiOff className="w-5 h-5 text-red-500" />
              <span className="text-red-500 font-medium text-sm">Offline</span>
            </>
          )}
        </div>
        <div className="h-6 w-px bg-surface-700" />
        <div className="flex items-center gap-4 text-sm text-surface-400">
          <span className="flex items-center gap-1.5">
            <Activity className="w-4 h-4" />
            TPS: {status.tps > 0 ? status.tps.toFixed(1) : '--'}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            {status.players?.length || 0} players
          </span>
          {status.running && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {formatUptime(status.uptime)}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
