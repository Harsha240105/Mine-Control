import React from 'react';
import { useServer } from '../../context/ServerContext';
import { MemoryStick } from 'lucide-react';

export default function RAMChart() {
  const { status } = useServer();
  const mem = status.memory;
  const percent = mem?.percent || 0;

  const getColor = (p) => {
    if (p < 70) return 'bg-green-500';
    if (p < 85) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-surface-400">RAM</h3>
        <MemoryStick className="w-5 h-5 text-surface-500" />
      </div>
      <div className="text-2xl font-bold text-white mb-1">
        {mem?.used || 0} MB
      </div>
      <div className="text-sm text-surface-400 mb-3">
        / {mem?.total || 0} MB
      </div>
      <div className="w-full bg-surface-800 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getColor(percent)}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <div className="mt-2 text-right text-xs text-surface-500">
        {percent.toFixed(1)}%
      </div>
    </div>
  );
}
