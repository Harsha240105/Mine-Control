import { Router } from 'express';
import { getDatabase } from '../database';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', authMiddleware, (_req: AuthRequest, res) => {
  const db = getDatabase();
  const players = db.prepare('SELECT * FROM players ORDER BY last_login DESC').all();
  res.json(players);
});

// Banned players list (MUST be before /:id to avoid route capture)
router.get('/banned', authMiddleware, (_req: AuthRequest, res) => {
  const db = getDatabase();
  const banned = db.prepare('SELECT * FROM banned_players ORDER BY banned_at DESC').all();
  res.json(banned);
});

// Chat log (MUST be before /:id to avoid route capture)
router.get('/chat', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const limit = parseInt(req.query.limit as string) || 50;
  const chat = db.prepare('SELECT * FROM chat_log ORDER BY timestamp DESC LIMIT ?').all(limit);
  res.json(chat.reverse());
});

// Roles (MUST be before /:id to avoid route capture)
router.get('/roles', authMiddleware, (_req: AuthRequest, res) => {
  const db = getDatabase();
  const roles = db.prepare('SELECT * FROM roles ORDER BY level DESC').all();
  const parsed = roles.map((r: any) => ({ ...r, permissions: JSON.parse(r.permissions) }));
  res.json(parsed);
});

router.get('/:id', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  res.json(player);
});

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

  const player = {
    id: uuidv4(),
    username,
    uuid: uuid || '',
    role: role || 'Member',
    status: 'offline',
    last_login: null,
    playtime: 0,
    ip: '',
    join_date: new Date().toISOString(),
    muted: 0,
    notes: '',
  };

  db.prepare(
    'INSERT INTO players (id, username, uuid, role, status, last_login, playtime, ip, join_date, muted, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(...Object.values(player));

  res.json(player);
});

router.put('/:id', authMiddleware, requirePermission('permissions.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const { role, muted, notes } = req.body;
  const updates: string[] = [];
  const values: any[] = [];

  if (role !== undefined) {
    updates.push('role = ?');
    values.push(role);
  }
  if (muted !== undefined) {
    updates.push('muted = ?');
    values.push(muted ? 1 : 0);
  }
  if (notes !== undefined) {
    updates.push('notes = ?');
    values.push(notes);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(req.params.id);
  db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  res.json(player);
});

router.delete('/:id', authMiddleware, requirePermission('whitelist.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Player not found' });
  }
  res.json({ success: true });
});

// Ban/Unban
router.post('/:id/ban', authMiddleware, requirePermission('player.ban'), (req: AuthRequest, res) => {
  const { reason } = req.body;
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  db.prepare('UPDATE players SET status = ? WHERE id = ?').run('banned', player.id);

  // Also add to banned_players table
  const bannedPlayer = {
    id: uuidv4(),
    username: player.username,
    uuid: player.uuid,
    reason: reason || 'Banned by operator',
    banned_by: req.user?.username || 'unknown',
    banned_at: new Date().toISOString(),
  };
  db.prepare(
    'INSERT INTO banned_players (id, username, uuid, reason, banned_by, banned_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(...Object.values(bannedPlayer));

  res.json({ success: true, message: `${player.username} has been banned` });
});

router.post('/:id/unban', authMiddleware, requirePermission('player.unban'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  db.prepare('UPDATE players SET status = ? WHERE id = ?').run('offline', player.id);
  db.prepare('DELETE FROM banned_players WHERE username = ?').run(player.username);

  res.json({ success: true, message: `${player.username} has been unbanned` });
});

// Kick
router.post('/:id/kick', authMiddleware, requirePermission('player.kick'), async (req: AuthRequest, res) => {
  const { reason } = req.body;
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  const { minecraftServer } = require('../services/minecraftServer');
  try {
    await minecraftServer.sendCommand(`kick ${player.username} ${reason || 'Kicked by operator'}`);
    res.json({ success: true, message: `${player.username} has been kicked` });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Mute/Unmute
router.post('/:id/mute', authMiddleware, requirePermission('player.mute'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  db.prepare('UPDATE players SET muted = ? WHERE id = ?').run(1, player.id);
  res.json({ success: true, message: `${player.username} has been muted` });
});

router.post('/:id/unmute', authMiddleware, requirePermission('player.mute'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  db.prepare('UPDATE players SET muted = ? WHERE id = ?').run(0, player.id);
  res.json({ success: true, message: `${player.username} has been unmuted` });
});

// Whitelist
router.get('/whitelist/all', authMiddleware, (_req: AuthRequest, res) => {
  const db = getDatabase();
  const whitelist = db.prepare('SELECT * FROM whitelist ORDER BY added_at DESC').all();
  res.json(whitelist);
});

router.post('/whitelist', authMiddleware, requirePermission('whitelist.manage'), (req: AuthRequest, res) => {
  const { username, uuid } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM whitelist WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: 'Player already in whitelist' });
  }

  const entry = {
    id: uuidv4(),
    username,
    uuid: uuid || null,
    added_by: req.user?.username || 'unknown',
    added_at: new Date().toISOString(),
  };

  db.prepare(
    'INSERT INTO whitelist (id, username, uuid, added_by, added_at) VALUES (?, ?, ?, ?, ?)'
  ).run(...Object.values(entry));

  // Also add to players if not exists
  const playerExists = db.prepare('SELECT id FROM players WHERE username = ?').get(username);
  if (!playerExists) {
    const playerId = uuidv4();
    db.prepare(
      'INSERT INTO players (id, username, uuid, role, status, join_date) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(playerId, username, uuid || '', 'Member', 'offline', new Date().toISOString());
  }

  // Add to Minecraft server whitelist
  const { minecraftServer } = require('../services/minecraftServer');
  if (minecraftServer.isRunning) {
    minecraftServer.sendCommand(`whitelist add ${username}`).catch(() => {});
  }

  res.json(entry);
});

router.delete('/whitelist/:username', authMiddleware, requirePermission('whitelist.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM whitelist WHERE username = ?').run(req.params.username);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Player not in whitelist' });
  }

  const { minecraftServer } = require('../services/minecraftServer');
  if (minecraftServer.isRunning) {
    minecraftServer.sendCommand(`whitelist remove ${req.params.username}`).catch(() => {});
  }

  res.json({ success: true });
});

// Temp ban
router.post('/:id/temp-ban', authMiddleware, requirePermission('player.ban'), (req: AuthRequest, res) => {
  const { duration, reason } = req.body;
  const db = getDatabase();
  const player = db.prepare('SELECT * FROM players WHERE id = ? OR username = ?').get(req.params.id, req.params.id) as any;
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  db.prepare('UPDATE players SET status = ? WHERE id = ?').run('banned', player.id);

  const bannedPlayer = {
    id: uuidv4(),
    username: player.username,
    uuid: player.uuid,
    reason: `${reason || 'Temporarily banned'} (Duration: ${duration || 'permanent'})`,
    banned_by: req.user?.username || 'unknown',
    banned_at: new Date().toISOString(),
  };
  db.prepare(
    'INSERT INTO banned_players (id, username, uuid, reason, banned_by, banned_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(...Object.values(bannedPlayer));

  res.json({ success: true, message: `${player.username} has been temporarily banned` });
});

router.put('/roles/:name', authMiddleware, requirePermission('permissions.manage'), (req: AuthRequest, res) => {
  const { permissions, color, level } = req.body;
  const db = getDatabase();

  if (req.params.name === 'Owner') {
    return res.status(403).json({ error: 'Cannot modify Owner role' });
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (permissions !== undefined) {
    updates.push('permissions = ?');
    values.push(JSON.stringify(permissions));
  }
  if (color !== undefined) {
    updates.push('color = ?');
    values.push(color);
  }
  if (level !== undefined) {
    updates.push('level = ?');
    values.push(level);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(req.params.name);
  db.prepare(`UPDATE roles SET ${updates.join(', ')} WHERE name = ?`).run(...values);
  const role = db.prepare('SELECT * FROM roles WHERE name = ?').get(req.params.name) as any;
  res.json({ ...role, permissions: JSON.parse(role.permissions) });
});

export default router;
