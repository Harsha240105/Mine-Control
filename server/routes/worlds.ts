import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { getDatabase } from '../database';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { resolveMinecraftDir } from '../paths';

const router = Router();
const WORLDS_DIR = resolveMinecraftDir('worlds');
const upload = multer({ dest: resolveMinecraftDir('temp_uploads'), limits: { fileSize: 1024 * 1024 * 1024 } }); // 1GB limit

function sanitizeWorldName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 64);
}

router.get('/', authMiddleware, (_req: AuthRequest, res) => {
  if (!fs.existsSync(WORLDS_DIR)) {
    return res.json([]);
  }

  const db = getDatabase();
  const worlds = db.prepare('SELECT * FROM worlds').all() as any[];
  const worldData = worlds.map((w: any) => {
    const worldPath = path.join(WORLDS_DIR, w.name);
    let size = '0 B';
    if (fs.existsSync(worldPath)) {
      size = getFolderSize(worldPath);
    }
    return { ...w, size };
  });

  res.json(worldData);
});

router.post('/', authMiddleware, requirePermission('world.manage'), (req: AuthRequest, res) => {
  let { name, seed, gamemode, difficulty } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'World name is required' });
  }
  name = sanitizeWorldName(String(name));

  const db = getDatabase();
  const existing = db.prepare('SELECT name FROM worlds WHERE name = ?').get(name);
  if (existing) {
    return res.status(400).json({ error: 'World already exists' });
  }

  const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
  const world: Record<string, any> = {
    name,
    seed: seed || '',
    gamemode: gamemode || 'survival',
    difficulty: difficulty || 'normal',
    size: '0 B',
    last_backup: null,
    created_at: new Date().toISOString(),
  };
  if (activeId) world.server_id = activeId;

  const cols = Object.keys(world);
  const vals = Object.values(world);
  const placeholders = cols.map(() => '?').join(', ');
  db.prepare(`INSERT INTO worlds (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals);

  // Create world directory
  const worldPath = path.join(WORLDS_DIR, name);
  if (!fs.existsSync(worldPath)) {
    fs.mkdirSync(worldPath, { recursive: true });
  }

  res.json(world);
});

router.delete('/:name', authMiddleware, requirePermission('world.manage'), (req: AuthRequest, res) => {
  const safeName = sanitizeWorldName(String(req.params.name));
  const db = getDatabase();
  const world = db.prepare('SELECT name FROM worlds WHERE name = ?').get(safeName);
  if (!world) {
    return res.status(404).json({ error: 'World not found' });
  }

  db.prepare('DELETE FROM worlds WHERE name = ?').run(safeName);

  const worldPath = path.join(WORLDS_DIR, safeName);
  if (fs.existsSync(worldPath)) {
    fs.rmSync(worldPath, { recursive: true });
  }

  res.json({ success: true });
});

router.post('/:name/clone', authMiddleware, requirePermission('world.manage'), (req: AuthRequest, res) => {
  let { newName } = req.body;
  if (!newName) {
    return res.status(400).json({ error: 'New world name is required' });
  }
  newName = sanitizeWorldName(String(newName));
  const safeSource = sanitizeWorldName(String(req.params.name));

  const sourcePath = path.join(WORLDS_DIR, safeSource);
  if (!fs.existsSync(sourcePath)) {
    return res.status(404).json({ error: 'Source world not found' });
  }

  const destPath = path.join(WORLDS_DIR, newName);
  if (fs.existsSync(destPath)) {
    return res.status(400).json({ error: 'Destination world already exists' });
  }

  fs.cpSync(sourcePath, destPath, { recursive: true });

  const db = getDatabase();
  const sourceWorld = db.prepare('SELECT * FROM worlds WHERE name = ?').get(safeSource) as any;
  const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
  const world: Record<string, any> = {
    name: newName,
    seed: sourceWorld?.seed || '',
    gamemode: sourceWorld?.gamemode || 'survival',
    difficulty: sourceWorld?.difficulty || 'normal',
    created_at: new Date().toISOString(),
  };
  if (activeId) world.server_id = activeId;
  const cols = Object.keys(world);
  const vals = Object.values(world);
  db.prepare(`INSERT INTO worlds (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);

  res.json({ success: true, name: newName });
});

router.get('/:name/download', authMiddleware, requirePermission('world.manage'), (req: AuthRequest, res) => {
  const safeName = sanitizeWorldName(String(req.params.name));
  const worldPath = path.join(WORLDS_DIR, safeName);
  if (!fs.existsSync(worldPath)) {
    return res.status(404).json({ error: 'World not found' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  archive.directory(worldPath, safeName);
  archive.finalize();
});

router.post('/upload', authMiddleware, requirePermission('world.manage'), upload.single('worldFile'), (req: AuthRequest, res) => {
  // Support both multipart upload and file path
  if (req.file) {
    const uploadedFile = req.file;
    if (!uploadedFile) return res.status(400).json({ error: 'No file uploaded' });
    const worldName = sanitizeWorldName(req.body.worldName || path.basename(uploadedFile.originalname, '.zip'));
    const destPath = path.join(WORLDS_DIR, worldName);
    if (fs.existsSync(destPath)) {
      fs.unlinkSync(uploadedFile.path);
      return res.status(400).json({ error: 'World already exists' });
    }
    fs.mkdirSync(destPath, { recursive: true });
    const readStream = fs.createReadStream(uploadedFile.path);
    readStream.pipe(unzipper.Extract({ path: destPath }))
      .on('close', () => {
        fs.unlinkSync(uploadedFile.path);
        const db = getDatabase();
        const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
        const world: Record<string, any> = { name: worldName, created_at: new Date().toISOString() };
        if (activeId) world.server_id = activeId;
        const cols = Object.keys(world);
        const vals = Object.values(world);
        db.prepare(`INSERT INTO worlds (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);
        res.json({ success: true, name: worldName });
      })
      .on('error', (err: Error) => {
        fs.unlinkSync(uploadedFile.path);
        res.status(400).json({ error: err.message });
      });
  } else {
    // Fallback: accept file path (for back-compat)
    const { filePath: uploadPath, worldName } = req.body;
    if (!uploadPath || !worldName) {
      return res.status(400).json({ error: 'File path and world name required' });
    }
    if (!fs.existsSync(uploadPath)) {
      return res.status(400).json({ error: 'Upload file not found' });
    }
    const safeName = sanitizeWorldName(String(worldName));
    const destPath = path.join(WORLDS_DIR, safeName);
    if (fs.existsSync(destPath)) {
      return res.status(400).json({ error: 'World already exists' });
    }
    fs.mkdirSync(destPath, { recursive: true });
    fs.createReadStream(uploadPath)
      .pipe(unzipper.Extract({ path: destPath }))
      .on('close', () => {
        const db = getDatabase();
        const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
        const world: Record<string, any> = { name: safeName, created_at: new Date().toISOString() };
        if (activeId) world.server_id = activeId;
        const cols = Object.keys(world);
        const vals = Object.values(world);
        db.prepare(`INSERT INTO worlds (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);
        res.json({ success: true, name: safeName });
      })
      .on('error', (err: Error) => {
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(400).json({ error: err.message });
      });
  }
});

function getFolderSize(dirPath: string): string {
  let totalSize = 0;
  try {
    const files = fs.readdirSync(dirPath, { recursive: true }) as string[];
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          totalSize += stats.size;
        }
      } catch {}
    }
  } catch {}

  if (totalSize < 1024) return `${totalSize} B`;
  if (totalSize < 1024 * 1024) return `${(totalSize / 1024).toFixed(1)} KB`;
  if (totalSize < 1024 * 1024 * 1024) return `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;
  return `${(totalSize / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default router;
