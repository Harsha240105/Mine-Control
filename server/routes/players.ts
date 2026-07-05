import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { emitToAll } from '../socketManager';
import { autoDetectPlayers } from '../services/playerDetection';
import { recordEvent, getPlayerHistory, getPlayerSessions, getPlayerTimeline, getRecentActivity, getRecentJoins } from '../services/playerHistory';
import { resolveMinecraftDir } from '../paths';

const router = Router();

function getActiveServerId(): string | null {
  const db = getDatabase();
  return (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value || null;
}

// ── Auto-detect players from filesystem ──
router.post('/detect', authMiddleware, requirePermission('whitelist.manage'), (_req: AuthRequest, res) => {
  const result = autoDetectPlayers();
  res.json(result);
});

// ── List all players ──
router.get('/', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const { status, approval, search } = req.query;
  let sql = 'SELECT * FROM players WHERE 1=1';
  const params: any[] = [];

  if (status && status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (approval && approval !== 'all') {
    sql += ' AND approval_status = ?';
    params.push(approval);
  }
  if (search) {
    sql += ' AND (username LIKE ? OR uuid LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY last_login DESC';
  const players = db.prepare(sql).all(...params);
  res.json(players);
});

// ── Banned players list ──
router.get('/banned', authMiddleware, (_req: AuthRequest, res) => {
  const db = getDatabase();
  const serverId = getActiveServerId();
  const banned = serverId
    ? db.prepare('SELECT * FROM banned_players WHERE server_id = ? OR server_id IS NULL ORDER BY banned_at DESC').all(serverId)
    : db.prepare('SELECT * FROM banned_players ORDER BY banned_at DESC').all();
  res.json(banned);
});

// ── Chat log ──
router.get('/chat', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const serverId = getActiveServerId();
  const limit = parseInt(req.query.limit as string) || 50;
  const chat = serverId
    ? db.prepare('SELECT * FROM chat_log WHERE server_id = ? OR server_id IS NULL ORDER BY timestamp DESC LIMIT ?').all(serverId, limit)
    : db.prepare('SELECT * FROM chat_log ORDER BY timestamp DESC LIMIT ?').all(limit);
  res.json(chat.reverse());
});

// ── Roles ──
router.get('/roles', authMiddleware, (_req: AuthRequest, res) => {
  const db = getDatabase();
  const roles = db.prepare('SELECT * FROM roles ORDER BY level DESC').all();
  const parsed = roles.map((r: any) => ({ ...r, permissions: JSON.parse(r.permissions) }));
  res.json(parsed);
});

// ── Recent activity ──
router.get('/activity', authMiddleware, (_req: AuthRequest, res) => {
  const activity = getRecentActivity(30);
  res.json(activity);
});

// ── Recent joins ──
router.get('/recent-joins', authMiddleware, (_req: AuthRequest, res) => {
  const joins = getRecentJoins(10);
  res.json(joins);
});

// ── Pending approval count ──
router.get('/pending-count', authMiddleware, (_req: AuthRequest, res) => {
  const db = getDatabase();
  const count = db.prepare("SELECT COUNT(*) as count FROM players WHERE approval_status = 'pending'").get() as any;
  res.json({ count: count?.count || 0 });
});

// ── Single player ──
router.get('/:id', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  res.json(player);
});

// ── Player history ──
router.get('/:id/history', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT id FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  const history = getPlayerTimeline(player.id, 50);
  res.json(history);
});

// ── Player sessions ──
router.get('/:id/sessions', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT id FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  const sessions = getPlayerSessions(player.id, 20);
  res.json(sessions);
});

// ── Create player ──
router.post('/', authMiddleware, requirePermission('whitelist.manage'), (req: AuthRequest, res) => {
  const { username, uuid, role } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM players WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: 'Player already exists' });
  }

  const playerId = uuidv4();
  const now = new Date().toISOString();
  const player = {
    id: playerId,
    username,
    uuid: uuid || '',
    role: role || 'Member',
    status: 'offline',
    last_login: null,
    playtime: 0,
    ip: '',
    join_date: now,
    muted: 0,
    notes: '',
    approval_status: 'approved',
    trusted: 1,
    ops: 0,
    last_ip: '',
  };

  db.prepare(
    `INSERT INTO players (id, username, uuid, role, status, last_login, playtime, ip, join_date, muted, notes, approval_status, trusted, ops, last_ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(...Object.values(player));

  emitToAll('player:added', { id: playerId, username });
  res.json(player);
});

// ── Update player ──
router.put('/:id', authMiddleware, requirePermission('permissions.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const { role, muted, notes } = req.body;
  const updates: string[] = [];
  const values: any[] = [];

  if (role !== undefined) { updates.push('role = ?'); values.push(role); }
  if (muted !== undefined) { updates.push('muted = ?'); values.push(muted ? 1 : 0); }
  if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(req.params.id);
  db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);

  emitToAll('player:updated', { id: req.params.id });
  res.json(player);
});

// ── Delete player ──
router.delete('/:id', authMiddleware, requirePermission('whitelist.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT id, username FROM players WHERE id = ?').get(req.params.id) as any;
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  // Remove from whitelist too
  db.prepare('DELETE FROM whitelist WHERE username = ?').run(player.username);
  db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);

  emitToAll('player:removed', { id: req.params.id, username: player.username });
  res.json({ success: true });
});

// ── Approve / Reject ──
router.post('/:id/approve', authMiddleware, requirePermission('whitelist.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) return res.status(404).json({ error: 'Player not found' });

  db.prepare("UPDATE players SET approval_status = 'approved', trusted = 1 WHERE id = ?").run(player.id);
  recordEvent(player.id, 'approved');

  // Add to whitelist
  const existing = db.prepare('SELECT id FROM whitelist WHERE username = ?').get(player.username);
  if (!existing) {
    db.prepare('INSERT INTO whitelist (id, username, uuid, added_by, added_at) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), player.username, player.uuid, req.user?.username || 'system', new Date().toISOString());
  }

  emitToAll('player:approved', { id: player.id, username: player.username });
  res.json({ success: true, message: `${player.username} approved` });
});

router.post('/:id/reject', authMiddleware, requirePermission('whitelist.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) return res.status(404).json({ error: 'Player not found' });

  db.prepare("UPDATE players SET approval_status = 'rejected', trusted = 0 WHERE id = ?").run(player.id);
  recordEvent(player.id, 'rejected');

  emitToAll('player:rejected', { id: player.id, username: player.username });
  res.json({ success: true, message: `${player.username} rejected` });
});

// ── OP / De-OP ──
router.post('/:id/op', authMiddleware, requirePermission('permissions.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) return res.status(404).json({ error: 'Player not found' });

  db.prepare('UPDATE players SET ops = 1 WHERE id = ?').run(player.id);
  recordEvent(player.id, 'opped');

  // Write to ops.json
  const opsPath = path.join(resolveMinecraftDir(), 'ops.json');
  let ops: any[] = [];
  if (fs.existsSync(opsPath)) {
    try { ops = JSON.parse(fs.readFileSync(opsPath, 'utf-8')); } catch {}
  }
  if (!ops.find((o: any) => o.uuid === player.uuid || o.name === player.username)) {
    ops.push({ uuid: player.uuid || uuidv4(), name: player.username, level: 4, bypassesPlayerLimit: false });
    fs.writeFileSync(opsPath, JSON.stringify(ops, null, 2));
  }

  const { minecraftServer } = require('../services/minecraftServer');
  if (minecraftServer.isRunning) {
    minecraftServer.sendCommand(`op ${player.username}`).catch(() => {});
  }

  emitToAll('player:opped', { id: player.id, username: player.username });
  res.json({ success: true, message: `${player.username} is now an operator` });
});

router.post('/:id/deop', authMiddleware, requirePermission('permissions.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) return res.status(404).json({ error: 'Player not found' });

  db.prepare('UPDATE players SET ops = 0 WHERE id = ?').run(player.id);
  recordEvent(player.id, 'deopped');

  // Remove from ops.json
  const opsPath = path.join(resolveMinecraftDir(), 'ops.json');
  if (fs.existsSync(opsPath)) {
    try {
      let ops: any[] = JSON.parse(fs.readFileSync(opsPath, 'utf-8'));
      ops = ops.filter((o: any) => o.uuid !== player.uuid && o.name !== player.username);
      fs.writeFileSync(opsPath, JSON.stringify(ops, null, 2));
    } catch {}
  }

  const { minecraftServer } = require('../services/minecraftServer');
  if (minecraftServer.isRunning) {
    minecraftServer.sendCommand(`deop ${player.username}`).catch(() => {});
  }

  emitToAll('player:deopped', { id: player.id, username: player.username });
  res.json({ success: true, message: `${player.username} is no longer an operator` });
});

// ── Whitelist / Unwhitelist ──
router.post('/:id/whitelist', authMiddleware, requirePermission('whitelist.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const existing = db.prepare('SELECT id FROM whitelist WHERE username = ?').get(player.username);
  if (existing) return res.status(400).json({ error: 'Player already in whitelist' });

  db.prepare('INSERT INTO whitelist (id, username, uuid, added_by, added_at) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), player.username, player.uuid, req.user?.username || 'system', new Date().toISOString());

  recordEvent(player.id, 'whitelisted');

  const { minecraftServer } = require('../services/minecraftServer');
  if (minecraftServer.isRunning) {
    minecraftServer.sendCommand(`whitelist add ${player.username}`).catch(() => {});
  }

  emitToAll('player:whitelisted', { id: player.id, username: player.username });
  res.json({ success: true });
});

router.post('/:id/unwhitelist', authMiddleware, requirePermission('whitelist.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) return res.status(404).json({ error: 'Player not found' });

  db.prepare('DELETE FROM whitelist WHERE username = ?').run(player.username);
  recordEvent(player.id, 'unwhitelisted');

  const { minecraftServer } = require('../services/minecraftServer');
  if (minecraftServer.isRunning) {
    minecraftServer.sendCommand(`whitelist remove ${player.username}`).catch(() => {});
  }

  emitToAll('player:unwhitelisted', { id: player.id, username: player.username });
  res.json({ success: true });
});

// ── Ban / Unban ──
router.post('/:id/ban', authMiddleware, requirePermission('player.ban'), (req: AuthRequest, res) => {
  const { reason } = req.body;
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) return res.status(404).json({ error: 'Player not found' });

  db.prepare('UPDATE players SET status = ? WHERE id = ?').run('banned', player.id);

  const serverId = getActiveServerId();
  const bannedPlayer = {
    id: uuidv4(),
    username: player.username,
    uuid: player.uuid,
    reason: reason || 'Banned by operator',
    banned_by: req.user?.username || 'unknown',
    banned_at: new Date().toISOString(),
    server_id: serverId,
  };
  db.prepare('INSERT INTO banned_players (id, username, uuid, reason, banned_by, banned_at, server_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(...Object.values(bannedPlayer));

  // Write to banned-players.json
  const bannedPath = path.join(resolveMinecraftDir(), 'banned-players.json');
  let bannedList: any[] = [];
  if (fs.existsSync(bannedPath)) {
    try { bannedList = JSON.parse(fs.readFileSync(bannedPath, 'utf-8')); } catch {}
  }
  if (!bannedList.find((b: any) => b.uuid === player.uuid)) {
    bannedList.push({
      uuid: player.uuid || uuidv4(),
      name: player.username,
      reason: reason || 'Banned by operator',
      banned_by: req.user?.username || 'unknown',
      created: new Date().toISOString(),
    });
    fs.writeFileSync(bannedPath, JSON.stringify(bannedList, null, 2));
  }

  recordEvent(player.id, 'banned', reason || '');
  emitToAll('player:banned', { id: player.id, username: player.username });

  const { minecraftServer } = require('../services/minecraftServer');
  if (minecraftServer.isRunning) {
    minecraftServer.sendCommand(`ban ${player.username} ${reason || ''}`).catch(() => {});
  }

  res.json({ success: true, message: `${player.username} has been banned` });
});

router.post('/:id/unban', authMiddleware, requirePermission('player.unban'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) return res.status(404).json({ error: 'Player not found' });

  db.prepare('UPDATE players SET status = ? WHERE id = ?').run('offline', player.id);
  db.prepare('DELETE FROM banned_players WHERE username = ?').run(player.username);

  // Remove from banned-players.json
  const bannedPath = path.join(resolveMinecraftDir(), 'banned-players.json');
  if (fs.existsSync(bannedPath)) {
    try {
      let bannedList: any[] = JSON.parse(fs.readFileSync(bannedPath, 'utf-8'));
      bannedList = bannedList.filter((b: any) => b.uuid !== player.uuid && b.name !== player.username);
      fs.writeFileSync(bannedPath, JSON.stringify(bannedList, null, 2));
    } catch {}
  }

  recordEvent(player.id, 'unbanned');
  emitToAll('player:unbanned', { id: player.id, username: player.username });

  const { minecraftServer } = require('../services/minecraftServer');
  if (minecraftServer.isRunning) {
    minecraftServer.sendCommand(`pardon ${player.username}`).catch(() => {});
  }

  res.json({ success: true, message: `${player.username} has been unbanned` });
});

// ── Kick ──
router.post('/:id/kick', authMiddleware, requirePermission('player.kick'), async (req: AuthRequest, res) => {
  const { reason } = req.body;
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const { minecraftServer } = require('../services/minecraftServer');
  try {
    await minecraftServer.sendCommand(`kick ${player.username} ${reason || 'Kicked by operator'}`);
    recordEvent(player.id, 'kicked', reason || '');
    emitToAll('player:kicked', { id: player.id, username: player.username });
    res.json({ success: true, message: `${player.username} has been kicked` });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── Mute / Unmute ──
router.post('/:id/mute', authMiddleware, requirePermission('player.mute'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) return res.status(404).json({ error: 'Player not found' });

  db.prepare('UPDATE players SET muted = ? WHERE id = ?').run(1, player.id);
  recordEvent(player.id, 'muted');
  emitToAll('player:muted', { id: player.id, username: player.username });
  res.json({ success: true, message: `${player.username} has been muted` });
});

router.post('/:id/unmute', authMiddleware, requirePermission('player.mute'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) return res.status(404).json({ error: 'Player not found' });

  db.prepare('UPDATE players SET muted = ? WHERE id = ?').run(0, player.id);
  recordEvent(player.id, 'unmuted');
  emitToAll('player:unmuted', { id: player.id, username: player.username });
  res.json({ success: true, message: `${player.username} has been unmuted` });
});

// ── Temp ban ──
router.post('/:id/temp-ban', authMiddleware, requirePermission('player.ban'), (req: AuthRequest, res) => {
  const { duration, reason } = req.body;
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) return res.status(404).json({ error: 'Player not found' });

  db.prepare('UPDATE players SET status = ? WHERE id = ?').run('banned', player.id);

  const serverId = getActiveServerId();
  const bannedPlayer = {
    id: uuidv4(),
    username: player.username,
    uuid: player.uuid,
    reason: `${reason || 'Temporarily banned'} (Duration: ${duration || 'permanent'})`,
    banned_by: req.user?.username || 'unknown',
    banned_at: new Date().toISOString(),
    server_id: serverId,
  };
  db.prepare('INSERT INTO banned_players (id, username, uuid, reason, banned_by, banned_at, server_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(...Object.values(bannedPlayer));

  recordEvent(player.id, 'banned', `Temp ban: ${duration} - ${reason || ''}`);
  emitToAll('player:banned', { id: player.id, username: player.username });
  res.json({ success: true, message: `${player.username} has been temporarily banned` });
});

// ── Whitelist (legacy routes) ──
router.get('/whitelist/all', authMiddleware, (_req: AuthRequest, res) => {
  const db = getDatabase();
  const whitelist = db.prepare('SELECT * FROM whitelist ORDER BY added_at DESC').all();
  res.json(whitelist);
});

router.post('/whitelist', authMiddleware, requirePermission('whitelist.manage'), (req: AuthRequest, res) => {
  const { username, uuid } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM whitelist WHERE username = ?').get(username);
  if (existing) return res.status(400).json({ error: 'Player already in whitelist' });

  const entry = {
    id: uuidv4(),
    username,
    uuid: uuid || null,
    added_by: req.user?.username || 'unknown',
    added_at: new Date().toISOString(),
  };

  db.prepare('INSERT INTO whitelist (id, username, uuid, added_by, added_at) VALUES (?, ?, ?, ?, ?)')
    .run(...Object.values(entry));

  const playerExists = db.prepare('SELECT id FROM players WHERE username = ?').get(username);
  if (!playerExists) {
    const playerId = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO players (id, username, uuid, role, status, join_date, approval_status, trusted, ops)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(playerId, username, uuid || '', 'Member', 'offline', now, 'approved', 1, 0);
  }

  const { minecraftServer } = require('../services/minecraftServer');
  if (minecraftServer.isRunning) {
    minecraftServer.sendCommand(`whitelist add ${username}`).catch(() => {});
  }

  emitToAll('player:added', { username });
  res.json(entry);
});

router.delete('/whitelist/:username', authMiddleware, requirePermission('whitelist.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM whitelist WHERE username = ?').run(req.params.username);
  if (result.changes === 0) return res.status(404).json({ error: 'Player not in whitelist' });

  const { minecraftServer } = require('../services/minecraftServer');
  if (minecraftServer.isRunning) {
    minecraftServer.sendCommand(`whitelist remove ${req.params.username}`).catch(() => {});
  }

  emitToAll('player:unwhitelisted', { username: req.params.username });
  res.json({ success: true });
});

// ── Export player data ──
router.get('/:id/export', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const history = db.prepare('SELECT * FROM player_history WHERE player_id = ? ORDER BY timestamp ASC').all(player.id);
  const whitelistEntry = db.prepare('SELECT * FROM whitelist WHERE username = ?').get(player.username);

  recordEvent(player.id, 'exported');

  const exportData = {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    player: {
      id: player.id,
      username: player.username,
      uuid: player.uuid,
      role: player.role,
      join_date: player.join_date,
      first_join: player.first_join,
      playtime: player.playtime,
      muted: player.muted,
      ops: player.ops,
      approval_status: player.approval_status,
      trusted: player.trusted,
      health: player.health,
      food_level: player.food_level,
      xp_level: player.xp_level,
      xp_progress: player.xp_progress,
      dimension: player.dimension,
      pos_x: player.pos_x,
      pos_y: player.pos_y,
      pos_z: player.pos_z,
      world_name: player.world_name,
      death_count: player.death_count,
      kills: player.kills,
      inventory: player.inventory,
      armor: player.armor,
      ender_chest: player.ender_chest,
      advancements: player.advancements,
      statistics: player.statistics,
      notes: player.notes,
    },
    history,
    whitelist: whitelistEntry || null,
  };

  res.json(exportData);
});

// ── Import player data ──
router.post('/import', authMiddleware, requirePermission('whitelist.manage'), (req: AuthRequest, res) => {
  const { data } = req.body;
  if (!data || !data.player) return res.status(400).json({ error: 'Invalid import data' });

  const db = getDatabase();
  const p = data.player;
  const existing = db.prepare('SELECT id FROM players WHERE uuid = ? OR username = ?').get(p.uuid, p.username) as any;

  let playerId: string;
  if (existing) {
    // Update existing player
    const updates: string[] = [];
    const values: any[] = [];
    const fields = ['role', 'playtime', 'muted', 'ops', 'approval_status', 'trusted',
      'health', 'food_level', 'xp_level', 'xp_progress', 'dimension',
      'pos_x', 'pos_y', 'pos_z', 'world_name', 'death_count', 'kills',
      'inventory', 'armor', 'ender_chest', 'advancements', 'statistics', 'notes'];
    for (const field of fields) {
      if (p[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(p[field]);
      }
    }
    if (updates.length > 0) {
      values.push(existing.id);
      db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
    playerId = existing.id;
  } else {
    // Create new player
    playerId = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO players (id, username, uuid, role, status, join_date, first_join, playtime, muted, ops, approval_status, trusted,
        health, food_level, xp_level, xp_progress, dimension, pos_x, pos_y, pos_z, world_name, death_count, kills,
        inventory, armor, ender_chest, advancements, statistics, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(playerId, p.username, p.uuid || '', p.role || 'Member', 'offline', now, p.first_join || now,
      p.playtime || 0, p.muted || 0, p.ops || 0, p.approval_status || 'approved', p.trusted || 1,
      p.health || 20, p.food_level || 20, p.xp_level || 0, p.xp_progress || 0, p.dimension || '',
      p.pos_x || 0, p.pos_y || 0, p.pos_z || 0, p.world_name || 'world', p.death_count || 0, p.kills || 0,
      p.inventory || '[]', p.armor || '[]', p.ender_chest || '[]', p.advancements || '{}', p.statistics || '{}', p.notes || '');
  }

  // Import history
  if (data.history && Array.isArray(data.history)) {
    for (const event of data.history) {
      db.prepare('INSERT INTO player_history (player_id, event_type, event_data, timestamp) VALUES (?, ?, ?, ?)')
        .run(playerId, event.event_type, event.event_data, event.timestamp);
    }
  }

  recordEvent(playerId, 'imported', `Imported ${data.history?.length || 0} history entries`);

  // Add to whitelist if was whitelisted
  if (data.whitelist) {
    const wlExists = db.prepare('SELECT id FROM whitelist WHERE username = ?').get(p.username);
    if (!wlExists) {
      db.prepare('INSERT INTO whitelist (id, username, uuid, added_by, added_at) VALUES (?, ?, ?, ?, ?)')
        .run(uuidv4(), p.username, p.uuid, 'import', new Date().toISOString());
    }
  }

  emitToAll('player:imported', { id: playerId, username: p.username });
  res.json({ success: true, playerId, message: `Imported ${p.username}` });
});

// ── Export all players ──
router.get('/export/all', authMiddleware, requirePermission('whitelist.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const players = db.prepare('SELECT * FROM players').all() as any[];
  const history = db.prepare('SELECT * FROM player_history ORDER BY timestamp ASC').all();

  res.json({
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    playerCount: players.length,
    players,
    history,
  });
});

// ── Roles update ──
router.put('/roles/:name', authMiddleware, requirePermission('permissions.manage'), (req: AuthRequest, res) => {
  const { permissions, color, level } = req.body;
  const db = getDatabase();

  if (req.params.name === 'Owner') return res.status(403).json({ error: 'Cannot modify Owner role' });

  const updates: string[] = [];
  const values: any[] = [];

  if (permissions !== undefined) { updates.push('permissions = ?'); values.push(JSON.stringify(permissions)); }
  if (color !== undefined) { updates.push('color = ?'); values.push(color); }
  if (level !== undefined) { updates.push('level = ?'); values.push(level); }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.name);
  db.prepare(`UPDATE roles SET ${updates.join(', ')} WHERE name = ?`).run(...values);
  const role = db.prepare('SELECT * FROM roles WHERE name = ?').get(req.params.name) as any;
  res.json({ ...role, permissions: JSON.parse(role.permissions) });
});

export default router;
