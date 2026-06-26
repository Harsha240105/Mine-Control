import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { getDatabase, generateSlug } from '../database';
import { minecraftServer } from '../services/minecraftServer';
import { setMinecraftDir, resolvePath } from '../paths';
import { downloadVersion } from '../services/download';

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
      version: s.version || '',
      version_source: s.version_source || '',
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

// Create server (atomic: download first, then create DB record)
router.post('/', authMiddleware, requirePermission('server.start'), async (req: AuthRequest, res) => {
  const db = getDatabase();
  const { name, port, javaPath, jarFile, minRam, maxRam, motd, difficulty, gamemode, pvp, maxPlayers, viewDistance, onlineMode, software, version, seed, network } = req.body;

  if (!name) return res.status(400).json({ error: 'Server name is required' });

  let slug = generateSlug(name);
  const existing = db.prepare('SELECT id FROM servers WHERE slug = ?').get(slug);
  if (existing) slug = `${slug}-${Date.now()}`;

  const id = uuidv4();
  const dir = resolvePath('servers', slug);

  // Create directories
  for (const sub of ['plugins', 'worlds', 'backups', 'logs', 'config']) {
    const p = path.join(dir, sub);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }

  // Map software to download source
  const softwareLower = (software || '').toLowerCase();
  let downloadSource = '';
  if (softwareLower === 'paper' || softwareLower === 'spigot') downloadSource = 'paper';
  else if (softwareLower === 'purpur') downloadSource = 'purpur';
  else if (softwareLower === 'fabric') downloadSource = 'fabric';
  else if (softwareLower === 'forge' || softwareLower === 'neoforge') downloadSource = 'forge';
  else downloadSource = 'vanilla';

  let jarFileName = 'server.jar';
  let sourceName = '';
  let displaySource = '';

  // If version and software provided, download the jar before creating DB record
  if (version && software) {
    try {
      const prefix = softwareLower;
      jarFileName = `${prefix}-${version}.jar`;
      const jarPath = path.join(dir, jarFileName);
      const result = await downloadVersion(version, downloadSource, jarPath);
      sourceName = result.sourceName;
      displaySource = result.displaySource;
    } catch (downloadErr: any) {
      // Clean up directory on download failure
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      return res.status(500).json({ error: downloadErr.message || 'Failed to download server jar' });
    }
  }

  const versionToStore = version || '';
  const softwareToStore = sourceName || software || '';

  db.prepare(`
    INSERT INTO servers (id, name, slug, port, directory, version, version_source, javaPath, jarFile, minRam, maxRam, motd, difficulty, gamemode, pvp, maxPlayers, viewDistance, onlineMode, autoRestart, autoBackup, whitelistEnabled, status, seed, network)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped', ?, ?)
  `).run(
    id, name, slug,
    parseInt(port || '25565'),
    dir,
    versionToStore,
    softwareToStore,
    javaPath || 'java',
    jarFileName,
    minRam || '2G',
    maxRam || '8G',
    motd || '§bMineControl OS §7- §fMinecraft Server',
    difficulty || 'normal',
    gamemode || 'survival',
    pvp !== false ? 1 : 0,
    parseInt(maxPlayers || '20'),
    parseInt(viewDistance || '10'),
    onlineMode ? 1 : 0,
    1, 1, 0,
    seed || '',
    network || 'local'
  );

  // Write level-seed to server.properties if provided
  if (seed) {
    const propsPath = path.join(dir, 'server.properties');
    if (fs.existsSync(propsPath)) {
      let content = fs.readFileSync(propsPath, 'utf-8');
      if (content.includes('level-seed=')) {
        content = content.replace(/level-seed=.*/, `level-seed=${seed}`);
      } else {
        content += `\nlevel-seed=${seed}\n`;
      }
      fs.writeFileSync(propsPath, content);
    } else {
      fs.writeFileSync(propsPath, `level-seed=${seed}\n`);
    }
  }

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

  // Sync onlineMode to server.properties
  if (onlineMode !== undefined && updated && updated.directory) {
    const propsPath = path.join(updated.directory, 'server.properties');
    if (fs.existsSync(propsPath)) {
      let content = fs.readFileSync(propsPath, 'utf-8');
      const regex = /^online-mode=.*$/m;
      const newVal = `online-mode=${onlineMode ? 'true' : 'false'}`;
      if (regex.test(content)) {
        content = content.replace(regex, newVal);
      } else {
        content += `\n${newVal}`;
      }
      fs.writeFileSync(propsPath, content, 'utf-8');
    }
  }

  res.json({ success: true, server: updated });
});

// Delete server
router.delete('/:id', authMiddleware, requirePermission('server.start'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id) as any;
  if (!server) return res.status(404).json({ error: 'Server not found' });

  // If this is the currently active server and it's running, don't allow deletion
  if (minecraftServer.directory === server.directory && (minecraftServer.isRunning || minecraftServer.isStarting)) {
    return res.status(400).json({ error: 'Stop the server before deleting' });
  }

  try {
    // Perform robust wipe of local directory
    if (fs.existsSync(server.directory)) {
      try {
        fs.rmSync(server.directory, { recursive: true, force: true });
      } catch (rmErr) {
        console.error('Failed to wipe directory on disk (locked/EPERM), skipping:', rmErr);
      }
    }

    // Manual deletion of related schedules and notifications to ensure SQLite cascading if legacy constraint
    db.prepare('DELETE FROM schedules WHERE server_id = ?').run(req.params.id);
    db.prepare('DELETE FROM notifications WHERE server_id = ?').run(req.params.id);
    
    // Delete the server record
    db.prepare('DELETE FROM servers WHERE id = ?').run(req.params.id);

    // If it was the active server, unset it
    const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
    if (activeId === req.params.id) {
      db.prepare("DELETE FROM server_config WHERE key = 'active_server_id'").run();
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete server:', err);
    res.status(500).json({ error: 'Failed to delete server completely: ' + err.message });
  }
});

export default router;
