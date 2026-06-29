import { getDatabase } from '../database';
import { emitToAll } from '../socketManager';

export type HistoryEventType =
  | 'join'
  | 'leave'
  | 'session_end'
  | 'approved'
  | 'rejected'
  | 'banned'
  | 'unbanned'
  | 'kicked'
  | 'muted'
  | 'unmuted'
  | 'whitelisted'
  | 'unwhitelisted'
  | 'opped'
  | 'deopped'
  | 'achievement'
  | 'death'
  | 'imported'
  | 'exported';

export function recordEvent(playerId: string, eventType: HistoryEventType, eventData: string = ''): void {
  try {
    const db = getDatabase();
    db.prepare(
      'INSERT INTO player_history (player_id, event_type, event_data, timestamp) VALUES (?, ?, ?, ?)'
    ).run(playerId, eventType, eventData, new Date().toISOString());
  } catch {}
}

export function getPlayerHistory(playerId: string, limit: number = 50): any[] {
  try {
    const db = getDatabase();
    return db.prepare(
      'SELECT * FROM player_history WHERE player_id = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(playerId, limit);
  } catch {
    return [];
  }
}

export function recordSession(playerId: string, joinTime: string, leaveTime: string): void {
  try {
    const joinMs = new Date(joinTime).getTime();
    const leaveMs = new Date(leaveTime).getTime();
    const durationSec = Math.floor((leaveMs - joinMs) / 1000);
    const durationMinutes = Math.max(1, Math.round(durationSec / 60));
    recordEvent(playerId, 'session_end', JSON.stringify({
      joinTime,
      leaveTime,
      durationSec,
      durationMinutes,
    }));

    // Update total playtime
    const db = getDatabase();
    const player = db.prepare('SELECT id, playtime FROM players WHERE id = ?').get(playerId) as any;
    if (player) {
      const currentPlaytime = player.playtime || 0;
      db.prepare('UPDATE players SET playtime = ? WHERE id = ?').run(currentPlaytime + durationMinutes, playerId);
    }
  } catch {}
}

export function getPlayerSessions(playerId: string, limit: number = 20): any[] {
  try {
    const db = getDatabase();
    const sessions = db.prepare(
      "SELECT * FROM player_history WHERE player_id = ? AND event_type = 'session_end' ORDER BY timestamp DESC LIMIT ?"
    ).all(playerId, limit);
    return sessions.map((s: any) => {
      try {
        const data = JSON.parse(s.event_data);
        return { ...s, ...data };
      } catch {
        return s;
      }
    });
  } catch {
    return [];
  }
}

export function getPlayerTimeline(playerId: string, limit: number = 30): any[] {
  return getPlayerHistory(playerId, limit);
}

export function getRecentActivity(limit: number = 20): any[] {
  try {
    const db = getDatabase();
    return db.prepare(`
      SELECT ph.*, p.username FROM player_history ph
      JOIN players p ON p.id = ph.player_id
      ORDER BY ph.timestamp DESC LIMIT ?
    `).all(limit);
  } catch {
    return [];
  }
}

export function getRecentJoins(limit: number = 10): any[] {
  try {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM players
      WHERE first_join IS NOT NULL
      ORDER BY first_join DESC LIMIT ?
    `).all(limit);
  } catch {
    return [];
  }
}
