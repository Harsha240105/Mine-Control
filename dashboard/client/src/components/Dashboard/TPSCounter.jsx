import React from 'react';
import { useServer } from '../../context/ServerContext';
import { Gauge } from 'lucide-react';

export default function TPSCounter() {
  const { status } = useServer();
  const tps = status.tps > 0 ? status.tps : 0;
  const percentage = Math.min((tps / 20) * 100, 100);

  const getColor = (val) => {
    if (val >= 18) return 'stroke-green-500';
    if (val >= 15) return 'stroke-yellow-500';
    return 'stroke-red-500';
  };

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-surface-400">TPS</h3>
        <Gauge className="w-5 h-5 text-surface-500" />
      </div>
      <div className="gauge-container">
        <svg width="140" height="140" className="-rotate-90">
          <circle
            cx="70" cy="70" r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-surface-800"
          />
          <circle
            cx="70" cy="70" r={radius}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className={getColor(tps)}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold text-white">
            {tps.toFixed(1)}
          </span>
        </div>
        <span className="gauge-label">/ 20</span>
      </div>
    </div>
  );
}
