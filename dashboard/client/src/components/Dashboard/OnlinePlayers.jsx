import React from 'react';
import { useServer } from '../../context/ServerContext';
import { Users } from 'lucide-react';

export default function OnlinePlayers() {
  const { status } = useServer();
  const players = status.players || [];

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-surface-400">Online Players</h3>
        <Users className="w-5 h-5 text-surface-500" />
      </div>
      {players.length === 0 ? (
        <div className="text-surface-500 text-sm py-4 text-center">
          {status.running ? 'No players online' : 'Server offline'}
        </div>
      ) : (
        <div className="space-y-2">
          {players.slice(0, 8).map((player) => (
            <div key={player.uuid || player.name} className="flex items-center gap-3 p-2 rounded-lg bg-surface-800/50">
              <div className="w-8 h-8 rounded-full bg-accent-600/20 flex items-center justify-center">
                <span className="text-sm font-bold text-accent-400">
                  {player.name?.charAt(0).toUpperCase() || '?'}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-surface-200">{player.name}</p>
                <p className="text-xs text-surface-500">{player.uuid?.slice(0, 8) || 'unknown'}...</p>
              </div>
            </div>
          ))}
          {players.length > 8 && (
            <p className="text-xs text-surface-500 text-center pt-2">
              +{players.length - 8} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}
