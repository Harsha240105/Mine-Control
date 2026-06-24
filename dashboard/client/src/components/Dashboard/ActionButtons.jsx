import React, { useState, useCallback } from 'react';
import { useServer } from '../../context/ServerContext';
import { Play, Square, RotateCcw, Archive, Terminal } from 'lucide-react';

export default function ActionButtons() {
  const { status, serverAction, setLogs } = useServer();
  const [loading, setLoading] = useState(null);

  const handleAction = useCallback(async (action) => {
    setLoading(action);
    try {
      const result = await serverAction(action);
      setLogs(prev => [...prev, `[Dashboard] ${action}: ${result.message || 'success'}`]);
    } catch (err) {
      setLogs(prev => [...prev, `[Dashboard] ${action} failed: ${err.message}`]);
    } finally {
      setLoading(null);
    }
  }, [serverAction, setLogs]);

  const buttons = [
    {
      action: 'start',
      label: 'Start',
      icon: Play,
      color: 'bg-green-600 hover:bg-green-500',
      disabled: status.running
    },
    {
      action: 'stop',
      label: 'Stop',
      icon: Square,
      color: 'bg-red-600 hover:bg-red-500',
      disabled: !status.running
    },
    {
      action: 'restart',
      label: 'Restart',
      icon: RotateCcw,
      color: 'bg-yellow-600 hover:bg-yellow-500',
      disabled: !status.running
    },
    {
      action: 'backup',
      label: 'Backup',
      icon: Archive,
      color: 'bg-blue-600 hover:bg-blue-500',
      disabled: false
    }
  ];

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-surface-400">Server Controls</h3>
        <Terminal className="w-5 h-5 text-surface-500" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {buttons.map((btn) => (
          <button
            key={btn.action}
            onClick={() => handleAction(btn.action)}
            disabled={btn.disabled || loading === btn.action}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-white font-medium transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${btn.color}`}
          >
            {loading === btn.action ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <btn.icon className="w-5 h-5" />
            )}
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
