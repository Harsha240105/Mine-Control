import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database';
import { resolveMinecraftDir } from '../paths';
import { v4 as uuidv4 } from 'uuid';
import { emitToAll } from '../socketManager';

function getServerDir(): string {
  return resolveMinecraftDir();
}

export function getLevelName(): string {
  const propsPath = path.join(getServerDir(), 'server.properties');
  if (fs.existsSync(propsPath)) {
    const content = fs.readFileSync(propsPath, 'utf-8');
    const match = content.match(/^level-name=(.*)$/m);
    if (match) return match[1].trim();
  }
  return 'world';
}

export function scanPlayerDataFiles(): { username?: string; uuid: string }[] {
  const serverDir = getServerDir();
  if (!fs.existsSync(serverDir)) return [];

  const levelName = getLevelName();
  const worldDir = path.join(serverDir, levelName);
  const found: { username?: string; uuid: string }[] = [];

  const scanDir = (dir: string, ext: string) => {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.endsWith(ext)) {
            const uuid = file.replace(new RegExp(`${ext}$`), '');
            if (uuid.includes('-') && !found.find(f => f.uuid === uuid)) {
              found.push({ uuid });
            }
          }
        }
      } catch {}
    }
  };

  // Scan standard & Fabric/Carpet paths
  scanDir(path.join(worldDir, 'playerdata'), '.dat');
  scanDir(path.join(worldDir, 'players', 'data'), '.dat');
  scanDir(path.join(worldDir, 'stats'), '.json');
  scanDir(path.join(worldDir, 'players', 'stats'), '.json');
  scanDir(path.join(worldDir, 'advancements'), '.json');
  scanDir(path.join(worldDir, 'players', 'advancements'), '.json');

  // Resolve usernames from usercache.json
  const usercachePath = path.join(serverDir, 'usercache.json');
  if (fs.existsSync(usercachePath)) {
    try {
      const cache = JSON.parse(fs.readFileSync(usercachePath, 'utf-8'));
      for (const entry of cache) {
        const match = found.find(f => f.uuid === entry.uuid);
        if (match) {
          match.username = entry.name;
        } else {
          found.push({ uuid: entry.uuid, username: entry.name });
        }
      }
    } catch {}
  }

  return found;
}

export function scanWhitelistFile(): { username: string; uuid?: string }[] {
  const whitelistPath = path.join(getServerDir(), 'whitelist.json');
  if (!fs.existsSync(whitelistPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(whitelistPath, 'utf-8'));
  } catch {
    return [];
  }
}

export function scanOpsFile(): { username: string; uuid?: string; level?: number }[] {
  const opsPath = path.join(getServerDir(), 'ops.json');
  if (!fs.existsSync(opsPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(opsPath, 'utf-8'));
  } catch {
    return [];
  }
}

export function scanBannedPlayersFile(): { username: string; uuid?: string; reason?: string }[] {
  const bannedPath = path.join(getServerDir(), 'banned-players.json');
  if (!fs.existsSync(bannedPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(bannedPath, 'utf-8'));
  } catch {
    return [];
  }
}

export function autoDetectPlayers(): { created: number; updated: number } {
  const db = getDatabase();
  const serverDir = getServerDir();
  let created = 0;
  let updated = 0;

  // 1. Detect from playerdata/stats/advancements
  const detected = scanPlayerDataFiles();
  for (const entry of detected) {
    if (!entry.uuid) continue;
    const existing = db.prepare('SELECT id FROM players WHERE uuid = ?').get(entry.uuid) as any;
    if (!existing) {
      const id = uuidv4();
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO players (id, username, uuid, role, status, join_date, approval_status, trusted, ops) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, entry.username || `Player-${entry.uuid.slice(0, 8)}`, entry.uuid, 'Member', 'offline', now, 'approved', 1, 0);
      created++;
    } else if (entry.username) {
      const player = db.prepare('SELECT username FROM players WHERE uuid = ?').get(entry.uuid) as any;
      if (player && (!player.username || player.username.startsWith('Player-'))) {
        db.prepare('UPDATE players SET username = ? WHERE uuid = ?').run(entry.username, entry.uuid);
        updated++;
      }
    }
  }

  // 2. Sync whitelist.json
  const whitelistEntries = scanWhitelistFile();
  for (const entry of whitelistEntries) {
    const existing = db.prepare('SELECT id FROM whitelist WHERE username = ?').get(entry.username) as any;
    if (!existing) {
      const whitelistId = uuidv4();
      db.prepare(
        'INSERT INTO whitelist (id, username, uuid, added_by, added_at) VALUES (?, ?, ?, ?, ?)'
      ).run(whitelistId, entry.username, entry.uuid || null, 'auto-detect', new Date().toISOString());
    }
    // Ensure player record exists
    const playerExists = db.prepare('SELECT id FROM players WHERE username = ?').get(entry.username) as any;
    if (!playerExists) {
      const id = uuidv4();
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO players (id, username, uuid, role, status, join_date, approval_status, trusted, ops) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, entry.username, entry.uuid || '', 'Member', 'offline', now, 'approved', 1, 0);
      created++;
    }
  }

  // 3. Sync ops.json
  const opsEntries = scanOpsFile();
  for (const entry of opsEntries) {
    db.prepare('UPDATE players SET ops = 1 WHERE username = ?').run(entry.username);
    // Ensure player record
    const playerExists = db.prepare('SELECT id FROM players WHERE username = ?').get(entry.username) as any;
    if (!playerExists) {
      const id = uuidv4();
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO players (id, username, uuid, role, status, join_date, approval_status, trusted, ops) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, entry.username, entry.uuid || '', 'Member', 'offline', now, 'approved', 1, 1);
      created++;
    }
  }

  // 4. Sync banned-players.json
  const bannedEntries = scanBannedPlayersFile();
  for (const entry of bannedEntries) {
    db.prepare('UPDATE players SET status = ? WHERE username = ?').run('banned', entry.username);
    const existing = db.prepare('SELECT id FROM banned_players WHERE username = ?').get(entry.username) as any;
    if (!existing) {
      db.prepare(
        'INSERT INTO banned_players (id, username, uuid, reason, banned_by, banned_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(uuidv4(), entry.username, entry.uuid || null, entry.reason || 'Banned', 'auto-detect', new Date().toISOString());
    }
  }

  if (created > 0 || updated > 0) {
    emitToAll('players:update', { created, updated });
  }

  return { created, updated };
}
