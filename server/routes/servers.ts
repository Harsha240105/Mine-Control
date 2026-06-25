import { Router } from 'express';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { getDatabase, generateSlug } from '../database';
import { minecraftServer } from '../services/minecraftServer';
import { setMinecraftDir, resolvePath } from '../paths';

const router = Router();

// List all servers
router.get('/', authMiddleware, (_req: AuthRequest, res) => {
  const db = getDatabase();
  const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value || '';
  const servers = db.prepare('SELECT * FROM servers ORDER BY created_at ASC').all() as any[];
  res.json({
    servers: servers.map((s: any) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      port: s.port,
      javaPath: s.javaPath,
      jarFile: s.jarFile,
      minRam: s.minRam,
      maxRam: s.maxRam,
      motd: s.motd,
      difficulty: s.difficulty,
      gamemode: s.gamemode,
      pvp: !!s.pvp,
      maxPlayers: s.maxPlayers,
      viewDistance: s.viewDistance,
      onlineMode: !!s.onlineMode,
      autoRestart: !!s.autoRestart,
      autoBackup: !!s.autoBackup,
      whitelistEnabled: !!s.whitelistEnabled,
      status: s.status,
      directory: s.directory,
      created_at: s.created_at,
      updated_at: s.updated_at,
    })),
    activeServerId: activeId,
  });
});

// Get single server
router.get('/:id', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id) as any;
  if (!server) return res.status(404).json({ error: 'Server not found' });
  res.json({ server });
});

// Create server
router.post('/', authMiddleware, requirePermission('server.start'), async (req: AuthRequest, res) => {
  const db = getDatabase();
  const { name, port, javaPath, jarFile, minRam, maxRam, motd, difficulty, gamemode, pvp, maxPlayers, viewDistance, onlineMode } = req.body;

  if (!name) return res.status(400).json({ error: 'Server name is required' });

  let slug = generateSlug(name);
  const existing = db.prepare('SELECT id FROM servers WHERE slug = ?').get(slug);
  if (existing) slug = `${slug}-${Date.now()}`;

  const id = uuidv4();
  const dir = resolvePath('servers', slug);

  // Create directories
  for (const sub of ['plugins', 'worlds', 'backups', 'logs', 'config']) {
    const p = require('path').join(dir, sub);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }

  db.prepare(`
    INSERT INTO servers (id, name, slug, port, directory, javaPath, jarFile, minRam, maxRam, motd, difficulty, gamemode, pvp, maxPlayers, viewDistance, onlineMode, autoRestart, autoBackup, whitelistEnabled, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped')
  `).run(
    id, name, slug,
    parseInt(port || '25565'),
    dir,
    javaPath || 'java',
    jarFile || 'server.jar',
    minRam || '2G',
    maxRam || '8G',
    motd || '§bMineControl OS §7- §fMinecraft Server',
    difficulty || 'normal',
    gamemode || 'survival',
    pvp !== false ? 1 : 0,
    parseInt(maxPlayers || '4'),
    parseInt(viewDistance || '10'),
    onlineMode ? 1 : 0,
    1, 1, 0,
  );

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as any;
  res.json({ success: true, server });
});

// Select active server
router.post('/:id/select', authMiddleware, async (req: AuthRequest, res) => {
  const db = getDatabase();
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id) as any;
  if (!server) return res.status(404).json({ error: 'Server not found' });

  if (minecraftServer.isRunning || minecraftServer.isStarting) {
    return res.status(400).json({ error: 'Stop the running server before switching' });
  }

  db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('active_server_id', ?)").run(server.id);
  setMinecraftDir(server.directory);
  minecraftServer.loadServer(server.directory);

  res.json({ success: true, server });
});

// Update server config
router.put('/:id', authMiddleware, requirePermission('server.start'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id) as any;
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { name, port, javaPath, jarFile, minRam, maxRam, motd, difficulty, gamemode, pvp, maxPlayers, viewDistance, onlineMode, autoRestart, autoBackup, whitelistEnabled } = req.body;

  const sets: string[] = [];
  const vals: any[] = [];
  if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
  if (port !== undefined) { sets.push('port = ?'); vals.push(parseInt(port)); }
  if (javaPath !== undefined) { sets.push('javaPath = ?'); vals.push(javaPath); }
  if (jarFile !== undefined) { sets.push('jarFile = ?'); vals.push(jarFile); }
  if (minRam !== undefined) { sets.push('minRam = ?'); vals.push(minRam); }
  if (maxRam !== undefined) { sets.push('maxRam = ?'); vals.push(maxRam); }
  if (motd !== undefined) { sets.push('motd = ?'); vals.push(motd); }
  if (difficulty !== undefined) { sets.push('difficulty = ?'); vals.push(difficulty); }
  if (gamemode !== undefined) { sets.push('gamemode = ?'); vals.push(gamemode); }
  if (pvp !== undefined) { sets.push('pvp = ?'); vals.push(pvp ? 1 : 0); }
  if (maxPlayers !== undefined) { sets.push('maxPlayers = ?'); vals.push(parseInt(maxPlayers)); }
  if (viewDistance !== undefined) { sets.push('viewDistance = ?'); vals.push(parseInt(viewDistance)); }
  if (onlineMode !== undefined) { sets.push('onlineMode = ?'); vals.push(onlineMode ? 1 : 0); }
  if (autoRestart !== undefined) { sets.push('autoRestart = ?'); vals.push(autoRestart ? 1 : 0); }
  if (autoBackup !== undefined) { sets.push('autoBackup = ?'); vals.push(autoBackup ? 1 : 0); }
  if (whitelistEnabled !== undefined) { sets.push('whitelistEnabled = ?'); vals.push(whitelistEnabled ? 1 : 0); }

  sets.push("updated_at = datetime('now')");

  if (sets.length > 1) {
    vals.push(req.params.id);
    db.prepare(`UPDATE servers SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  const updated = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id) as any;
  res.json({ success: true, server: updated });
});

// Delete server
router.delete('/:id', authMiddleware, requirePermission('server.start'), async (req: AuthRequest, res) => {
  const db = getDatabase();
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id) as any;
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value || '';
  if (server.id === activeId) {
    return res.status(400).json({ error: 'Cannot delete the active server. Switch to another server first.' });
  }

  if (minecraftServer.isRunning || minecraftServer.isStarting) {
    return res.status(400).json({ error: 'Stop the running server before deleting' });
  }

  db.prepare('DELETE FROM servers WHERE id = ?').run(server.id);

  res.json({ success: true, deletedId: server.id, deletedName: server.name });
});

export default router;
