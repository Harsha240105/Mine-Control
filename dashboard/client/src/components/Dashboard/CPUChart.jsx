import React from 'react';
import { useServer } from '../../context/ServerContext';
import { Cpu } from 'lucide-react';

export default function CPUChart() {
  const { status } = useServer();
  const cpu = status.cpu || 0;

  const getColor = (p) => {
    if (p < 50) return 'bg-green-500';
    if (p < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-surface-400">CPU</h3>
        <Cpu className="w-5 h-5 text-surface-500" />
      </div>
      <div className="text-2xl font-bold text-white mb-1">
        {cpu.toFixed(1)}%
      </div>
      <div className="text-sm text-surface-400 mb-3">
        4 vCPU (Ampere A1)
      </div>
      <div className="w-full bg-surface-800 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getColor(cpu)}`}
          style={{ width: `${Math.min(cpu, 100)}%` }}
        />
      </div>
      <div className="mt-2 text-right text-xs text-surface-500">
        {cpu < 1 ? '<1' : cpu.toFixed(1)}% used
      </div>
    </div>
  );
}
