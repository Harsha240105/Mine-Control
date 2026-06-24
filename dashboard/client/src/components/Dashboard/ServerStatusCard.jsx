import React from 'react';
import { useServer } from '../../context/ServerContext';
import { Server, Activity } from 'lucide-react';

export default function ServerStatusCard() {
  const { status } = useServer();

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-surface-400">Server Status</h3>
        <Server className="w-5 h-5 text-surface-500" />
      </div>
      <div className="flex items-center gap-3">
        <div className={status.running ? 'status-dot-online animate-pulse' : 'status-dot-offline'} />
        <span className={`text-lg font-bold ${status.running ? 'text-green-500' : 'text-red-500'}`}>
          {status.running ? 'Online' : 'Offline'}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-2 text-sm text-surface-400">
        <Activity className="w-4 h-4" />
        <span>{status.players?.length || 0} / 20 players</span>
      </div>
    </div>
  );
}
