import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { getDatabase } from '../database';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { resolveMinecraftDir } from '../paths';
import { emitToAll } from '../socketManager';
import { autoBackupIfEnabled } from '../services/backup';
import {
  sanitizeWorldName, formatBytes, getFolderSize, getWorldInfo, scanDimensions,
  detectWorlds, createWorldDirectory, exportWorldAsZip, importWorldFromZip,
  importWorldFromFolder, optimizeWorld, repairWorld, readLevelDat,
  syncWorldFromServerDir, getPlayerCountForWorld, updateWorldFromServerProperties,
} from '../services/worldManager';

const router = Router();
const WORLDS_DIR = resolveMinecraftDir('worlds');
const TEMP_UPLOADS = resolveMinecraftDir('temp_uploads');
const upload = multer({ dest: TEMP_UPLOADS, limits: { fileSize: 1024 * 1024 * 1024 } });

// Ensure dirs exist
if (!fs.existsSync(WORLDS_DIR)) fs.mkdirSync(WORLDS_DIR, { recursive: true });
if (!fs.existsSync(TEMP_UPLOADS)) fs.mkdirSync(TEMP_UPLOADS, { recursive: true });

// ── Auto-detect worlds from filesystem ──
router.post('/detect', authMiddleware, requirePermission('world.manage'), (_req: AuthRequest, res) => {
  const detected = detectWorlds();
  emitToAll('worlds:update');
  res.json({ detected: detected.length, worlds: detected });
});

// ── Sync current server world ──
router.post('/sync', authMiddleware, requirePermission('world.manage'), (_req: AuthRequest, res) => {
  const result = syncWorldFromServerDir();
  if (result) {
    emitToAll('world:created', result);
    res.json({ success: true, world: result });
  } else {
    res.json({ success: true, world: null, message: 'World already tracked or not found' });
  }
});

// ── List all worlds ──
router.get('/', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const { server_id } = req.query;
  let sql = 'SELECT * FROM worlds';
  const params: any[] = [];

  if (server_id) {
    sql += ' WHERE server_id = ?';
    params.push(server_id);
  }

  sql += ' ORDER BY created_at DESC';
  const worlds = db.prepare(sql).all(...params) as any[];

  const enriched = worlds.map((w: any) => {
    const worldPath = w.folder_path || path.join(WORLDS_DIR, w.name);
    let size = w.backup_size || '0 B';

    // Get dimensions
    const dims = db.prepare('SELECT * FROM world_dimensions WHERE world_name = ? ORDER BY id').all(w.name);

    return {
      ...w,
      size,
      dimensions: dims,
      playerCount: getPlayerCountForWorld(w.name),
      lastBackup: w.last_backup || null,
    };
  });

  res.json(enriched);
});

// ── Single world details ──
router.get('/:name', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const world = db.prepare('SELECT * FROM worlds WHERE name = ?').get(sanitizeWorldName(req.params.name)) as any;
  if (!world) return res.status(404).json({ error: 'World not found' });

  const worldPath = world.folder_path || path.join(WORLDS_DIR, world.name);
  const info = getWorldInfo(worldPath);
  const lvl = readLevelDat(worldPath);
  const dims = db.prepare('SELECT * FROM world_dimensions WHERE world_name = ? ORDER BY id').all(world.name);
  const players = db.prepare("SELECT id, username, uuid, status, dimension, pos_x, pos_y, pos_z FROM players WHERE world_name = ?").all(world.name);
  const backups = db.prepare("SELECT id, name, size, created_at, type FROM backups WHERE worlds LIKE ? ORDER BY created_at DESC LIMIT 5").all(`%${world.name}%`);

  res.json({
    ...world,
    size: formatBytes(info.totalSize),
    regionSize: formatBytes(info.regionSize),
    playerdataSize: formatBytes(info.playerdataSize),
    statsSize: formatBytes(info.statsSize),
    totalChunks: info.totalChunks,
    totalRegions: info.totalRegions,
    dimensions: dims,
    scan: info,
    levelData: lvl,
    players,
    backups,
  });
});

// ── Create world ──
router.post('/', authMiddleware, requirePermission('world.manage'), async (req: AuthRequest, res) => {
  let {
    name, seed, gamemode, difficulty, generateStructures, bonusChest,
    worldType, hardcore, simulationDistance, viewDistance,
  } = req.body;
  if (!name) return res.status(400).json({ error: 'World name is required' });
  name = sanitizeWorldName(String(name));

  const db = getDatabase();
  const existing = db.prepare('SELECT name FROM worlds WHERE name = ?').get(name);
  if (existing) return res.status(400).json({ error: 'World already exists' });

  // Create world directory
  const created = await createWorldDirectory(name, {
    seed, gamemode, difficulty, generateStructures, bonusChest,
    worldType, hardcore, simulationDistance, viewDistance,
  });
  if (!created) return res.status(500).json({ error: 'Failed to create world directory' });

  const worldPath = path.join(WORLDS_DIR, name);
  const info = getWorldInfo(worldPath);
  const lvl = readLevelDat(worldPath);
  const now = new Date().toISOString();

  const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;

  const world: any = {
    name,
    seed: seed || String(lvl.seed || ''),
    gamemode: gamemode || 'survival',
    difficulty: difficulty || 'normal',
    folder_path: worldPath,
    created_at: now,
    last_played: info.lastPlayed || now,
    dimension_count: 1,
    chunk_count: info.totalChunks,
    generate_structures: generateStructures !== false ? 1 : 0,
    bonus_chest: bonusChest ? 1 : 0,
    world_type: worldType || 'default',
    hardcore: hardcore ? 1 : 0,
    simulation_distance: simulationDistance || 10,
    view_distance: viewDistance || 10,
    version: lvl.version || '',
  };
  if (activeId) world.server_id = activeId;

  const cols = Object.keys(world);
  const vals = Object.values(world);
  db.prepare(`INSERT INTO worlds (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);

  // Create default dimensions
  const dims = scanDimensions(worldPath);
  for (const dim of dims) {
    db.prepare(
      'INSERT OR IGNORE INTO world_dimensions (world_name, dimension_name, display_name, size, chunk_count) VALUES (?, ?, ?, ?, ?)'
    ).run(name, dim.dimension, dim.displayName, dim.size || '0 B', dim.chunkCount || 0);
  }

  emitToAll('world:created', { name, server_id: activeId });
  res.json({ ...world, size: formatBytes(info.totalSize), dimensions: dims });
});

// ── Update world settings ──
router.put('/:name', authMiddleware, requirePermission('world.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const safeName = sanitizeWorldName(req.params.name);
  const world = db.prepare('SELECT name FROM worlds WHERE name = ?').get(safeName);
  if (!world) return res.status(404).json({ error: 'World not found' });

  const allowedFields = ['gamemode', 'difficulty', 'seed', 'generate_structures', 'bonus_chest', 'world_type', 'hardcore', 'simulation_distance', 'view_distance'];
  const updates: string[] = [];
  const values: any[] = [];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(safeName);
  db.prepare(`UPDATE worlds SET ${updates.join(', ')} WHERE name = ?`).run(...values);

  emitToAll('world:updated', { name: safeName });
  const updated = db.prepare('SELECT * FROM worlds WHERE name = ?').get(safeName);
  res.json(updated);
});

// ── Rename world ──
router.post('/:name/rename', authMiddleware, requirePermission('world.manage'), (req: AuthRequest, res) => {
  const { newName } = req.body;
  if (!newName) return res.status(400).json({ error: 'New name is required' });

  const db = getDatabase();
  const safeOld = sanitizeWorldName(req.params.name);
  const safeNew = sanitizeWorldName(String(newName));

  if (safeOld === safeNew) return res.json({ success: true, name: safeNew });

  const world = db.prepare('SELECT * FROM worlds WHERE name = ?').get(safeOld) as any;
  if (!world) return res.status(404).json({ error: 'World not found' });

  const existing = db.prepare('SELECT name FROM worlds WHERE name = ?').get(safeNew);
  if (existing) return res.status(400).json({ error: 'World with new name already exists' });

  const oldPath = world.folder_path || path.join(WORLDS_DIR, safeOld);
  const newPath = path.join(WORLDS_DIR, safeNew);

  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    fs.renameSync(oldPath, newPath);
  }

  db.prepare('UPDATE worlds SET name = ?, folder_path = ? WHERE name = ?').run(safeNew, newPath, safeOld);
  db.prepare('UPDATE world_dimensions SET world_name = ? WHERE world_name = ?').run(safeNew, safeOld);
  db.prepare("UPDATE players SET world_name = ? WHERE world_name = ?").run(safeNew, safeOld);

  emitToAll('world:renamed', { oldName: safeOld, newName: safeNew });
  res.json({ success: true, name: safeNew });
});

// ── Delete world ──
router.delete('/:name', authMiddleware, requirePermission('world.manage'), async (req: AuthRequest, res) => {
  await autoBackupIfEnabled('World deletion: ' + req.params.name, 'autoOnWorldDelete');
  const safeName = sanitizeWorldName(req.params.name);
  const db = getDatabase();
  const world = db.prepare('SELECT * FROM worlds WHERE name = ?').get(safeName) as any;
  if (!world) return res.status(404).json({ error: 'World not found' });

  const worldPath = world.folder_path || path.join(WORLDS_DIR, safeName);
  if (fs.existsSync(worldPath)) {
    fs.rmSync(worldPath, { recursive: true, force: true });
  }

  db.prepare('DELETE FROM world_dimensions WHERE world_name = ?').run(safeName);
  db.prepare('DELETE FROM worlds WHERE name = ?').run(safeName);

  emitToAll('world:deleted', { name: safeName });
  res.json({ success: true });
});

// ── Clone world ──
router.post('/:name/clone', authMiddleware, requirePermission('world.manage'), async (req: AuthRequest, res) => {
  let { newName } = req.body;
  if (!newName) return res.status(400).json({ error: 'New world name is required' });

  newName = sanitizeWorldName(String(newName));
  const safeSource = sanitizeWorldName(req.params.name);

  const db = getDatabase();
  const sourceWorld = db.prepare('SELECT * FROM worlds WHERE name = ?').get(safeSource) as any;
  if (!sourceWorld) return res.status(404).json({ error: 'Source world not found' });

  const existing = db.prepare('SELECT name FROM worlds WHERE name = ?').get(newName);
  if (existing) return res.status(400).json({ error: 'World already exists' });

  const sourcePath = sourceWorld.folder_path || path.join(WORLDS_DIR, safeSource);
  const destPath = path.join(WORLDS_DIR, newName);

  if (fs.existsSync(sourcePath)) {
    fs.cpSync(sourcePath, destPath, { recursive: true });
  } else {
    fs.mkdirSync(destPath, { recursive: true });
  }

  const now = new Date().toISOString();
  const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
  const info = getWorldInfo(destPath);

  const world: any = {
    name: newName,
    seed: sourceWorld.seed || '',
    gamemode: sourceWorld.gamemode || 'survival',
    difficulty: sourceWorld.difficulty || 'normal',
    folder_path: destPath,
    created_at: now,
    last_played: null,
    dimension_count: info.dimensions.length || 1,
    chunk_count: info.totalChunks,
    generate_structures: sourceWorld.generate_structures ?? 1,
    bonus_chest: sourceWorld.bonus_chest ?? 0,
    world_type: sourceWorld.world_type || 'default',
    hardcore: sourceWorld.hardcore ?? 0,
    simulation_distance: sourceWorld.simulation_distance || 10,
    view_distance: sourceWorld.view_distance || 10,
    version: sourceWorld.version || '',
  };
  if (activeId) world.server_id = activeId;

  const cols = Object.keys(world);
  const vals = Object.values(world);
  db.prepare(`INSERT INTO worlds (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);

  // Clone dimensions
  const sourceDims = db.prepare('SELECT * FROM world_dimensions WHERE world_name = ?').all(safeSource);
  for (const dim of sourceDims as any[]) {
    db.prepare(
      'INSERT OR IGNORE INTO world_dimensions (world_name, dimension_name, display_name, size, chunk_count) VALUES (?, ?, ?, ?, ?)'
    ).run(newName, dim.dimension_name, dim.display_name, dim.size, dim.chunk_count);
  }

  emitToAll('world:cloned', { name: safeSource, newName });
  res.json({ success: true, name: newName, size: formatBytes(info.totalSize) });
});

// ── Optimize world ──
router.post('/:name/optimize', authMiddleware, requirePermission('world.manage'), async (req: AuthRequest, res) => {
  try {
    const result = optimizeWorld(req.params.name);
    emitToAll('world:optimized', { name: req.params.name, result });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Repair world ──
router.post('/:name/repair', authMiddleware, requirePermission('world.manage'), async (req: AuthRequest, res) => {
  try {
    const result = repairWorld(req.params.name);
    emitToAll('world:repaired', { name: req.params.name, result });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── World dimensions ──
router.get('/:name/dimensions', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const dims = db.prepare('SELECT * FROM world_dimensions WHERE world_name = ? ORDER BY id').all(sanitizeWorldName(req.params.name));
  res.json(dims);
});

// ── Export world ZIP ──
router.get('/:name/download', authMiddleware, requirePermission('world.manage'), async (req: AuthRequest, res) => {
  try {
    const safeName = sanitizeWorldName(req.params.name);
    const zipPath = await exportWorldAsZip(safeName);
    const worldPath = path.join(WORLDS_DIR, safeName);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);

    const readStream = fs.createReadStream(zipPath);
    readStream.pipe(res);
    readStream.on('end', () => {
      // Clean up temp export file
      try { fs.unlinkSync(zipPath); } catch {}
    });
    readStream.on('error', (err) => {
      console.error('Error reading stream:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Stream error' });
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Import world from ZIP ──
router.post('/import/zip', authMiddleware, requirePermission('world.manage'), upload.single('worldFile'), async (req: AuthRequest, res) => {
  await autoBackupIfEnabled('World import from ZIP', 'autoOnWorldImport');
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const worldName = sanitizeWorldName(req.body.worldName || path.basename(req.file.originalname, '.zip'));
    const finalName = await importWorldFromZip(req.file.path, worldName);

    // Clean up uploaded file
    try { fs.unlinkSync(req.file.path); } catch {}

    // Register in database
    const db = getDatabase();
    const worldPath = path.join(WORLDS_DIR, finalName);
    const info = getWorldInfo(worldPath);
    const lvl = readLevelDat(worldPath);
    const now = new Date().toISOString();
    const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;

    const world: any = {
      name: finalName,
      seed: String(lvl.seed || ''),
      gamemode: lvl.gamemode !== undefined ? ['survival', 'creative', 'adventure', 'spectator'][lvl.gamemode] || 'survival' : 'survival',
      difficulty: lvl.difficulty !== undefined ? ['peaceful', 'easy', 'normal', 'hard'][lvl.difficulty] || 'normal' : 'normal',
      folder_path: worldPath,
      created_at: now,
      last_played: info.lastPlayed,
      dimension_count: info.dimensions.length || 1,
      chunk_count: info.totalChunks,
      version: lvl.version || '',
      hardcore: lvl.hardcore || 0,
    };
    if (activeId) world.server_id = activeId;

    const cols = Object.keys(world);
    const vals = Object.values(world);
    db.prepare(`INSERT INTO worlds (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);

    // Register dimensions
    for (const dim of info.dimensions) {
      db.prepare(
        'INSERT OR IGNORE INTO world_dimensions (world_name, dimension_name, display_name, size, chunk_count) VALUES (?, ?, ?, ?, ?)'
      ).run(finalName, dim.dimension, dim.displayName, dim.size || '0 B', dim.chunkCount || 0);
    }

    emitToAll('world:created', { name: finalName, server_id: activeId });
    res.json({ success: true, name: finalName, size: formatBytes(info.totalSize) });
  } catch (err: any) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
    res.status(400).json({ error: err.message });
  }
});

// ── Import world from folder ──
router.post('/import/folder', authMiddleware, requirePermission('world.manage'), async (req: AuthRequest, res) => {
  await autoBackupIfEnabled('World import from folder', 'autoOnWorldImport');
  try {
    const { sourcePath, worldName } = req.body;
    if (!sourcePath) return res.status(400).json({ error: 'Source path is required' });
    if (!fs.existsSync(sourcePath)) return res.status(400).json({ error: 'Source path does not exist' });

    const finalName = await importWorldFromFolder(sourcePath, worldName);

    const db = getDatabase();
    const worldPath = path.join(WORLDS_DIR, finalName);
    const info = getWorldInfo(worldPath);
    const lvl = readLevelDat(worldPath);
    const now = new Date().toISOString();
    const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;

    const world: any = {
      name: finalName,
      seed: String(lvl.seed || ''),
      gamemode: lvl.gamemode !== undefined ? ['survival', 'creative', 'adventure', 'spectator'][lvl.gamemode] || 'survival' : 'survival',
      difficulty: lvl.difficulty !== undefined ? ['peaceful', 'easy', 'normal', 'hard'][lvl.difficulty] || 'normal' : 'normal',
      folder_path: worldPath,
      created_at: now,
      last_played: info.lastPlayed,
      dimension_count: info.dimensions.length || 1,
      chunk_count: info.totalChunks,
      version: lvl.version || '',
      hardcore: lvl.hardcore || 0,
    };
    if (activeId) world.server_id = activeId;

    const cols = Object.keys(world);
    const vals = Object.values(world);
    db.prepare(`INSERT INTO worlds (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);

    for (const dim of info.dimensions) {
      db.prepare(
        'INSERT OR IGNORE INTO world_dimensions (world_name, dimension_name, display_name, size, chunk_count) VALUES (?, ?, ?, ?, ?)'
      ).run(finalName, dim.dimension, dim.displayName, dim.size || '0 B', dim.chunkCount || 0);
    }

    emitToAll('world:created', { name: finalName, server_id: activeId });
    res.json({ success: true, name: finalName, size: formatBytes(info.totalSize) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Get current world info (from active server's level-name) ──
router.get('/current/info', authMiddleware, (_req: AuthRequest, res) => {
  const db = getDatabase();
  const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
  if (!activeId) return res.status(400).json({ error: 'No active server' });

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(activeId) as any;
  if (!server) return res.status(400).json({ error: 'Active server not found' });

  const levelName = (() => {
    try {
      const propsPath = path.join(server.directory, 'server.properties');
      if (fs.existsSync(propsPath)) {
        const content = fs.readFileSync(propsPath, 'utf-8');
        return content.match(/^level-name=(.*)$/m)?.[1]?.trim() || 'world';
      }
    } catch {}
    return 'world';
  })();

  // Find or sync world
  let world = db.prepare('SELECT * FROM worlds WHERE name = ?').get(levelName) as any;
  if (!world) {
    // Auto-detect from server dir
    const result = syncWorldFromServerDir();
    if (result) world = db.prepare('SELECT * FROM worlds WHERE name = ?').get(levelName) as any;
  }

  if (!world) return res.json({ name: levelName, tracked: false, exists: false });

  const worldPath = world.folder_path || path.join(WORLDS_DIR, levelName);
  const info = getWorldInfo(worldPath);
  const lvl = readLevelDat(worldPath);
  const dims = db.prepare('SELECT * FROM world_dimensions WHERE world_name = ? ORDER BY id').all(levelName);
  const online = getPlayerCountForWorld(levelName);

  res.json({
    ...world,
    tracked: true,
    exists: fs.existsSync(worldPath),
    size: formatBytes(info.totalSize),
    regionSize: formatBytes(info.regionSize),
    playerdataSize: formatBytes(info.playerdataSize),
    statsSize: formatBytes(info.statsSize),
    totalChunks: info.totalChunks,
    totalRegions: info.totalRegions,
    loadedChunks: info.loadedChunks,
    dimensions: dims,
    levelData: lvl,
    onlinePlayers: online,
    lastBackup: world.last_backup || null,
  });
});

// ── World stats ──
router.get('/stats/summary', authMiddleware, (_req: AuthRequest, res) => {
  const db = getDatabase();
  const totalWorlds = (db.prepare('SELECT COUNT(*) as c FROM worlds').get() as any)?.c || 0;
  const totalChunks = (db.prepare('SELECT SUM(chunk_count) as c FROM worlds').get() as any)?.c || 0;
  const totalPlayers = (db.prepare("SELECT COUNT(*) as c FROM players WHERE world_name != ''").get() as any)?.c || 0;

  let totalSize = 0;
  const worlds = db.prepare('SELECT name, folder_path FROM worlds').all() as any[];
  for (const w of worlds) {
    const wp = w.folder_path || path.join(WORLDS_DIR, w.name);
    totalSize += getFolderSize(wp);
  }

  res.json({
    totalWorlds,
    totalChunks,
    totalPlayers,
    totalSize: formatBytes(totalSize),
  });
});

export default router;
