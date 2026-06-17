import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { getDatabase } from '../database';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const WORLDS_DIR = path.join(process.cwd(), 'minecraft', 'worlds');

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
  const { name, seed, gamemode, difficulty } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'World name is required' });
  }

  const db = getDatabase();
  const existing = db.prepare('SELECT name FROM worlds WHERE name = ?').get(name);
  if (existing) {
    return res.status(400).json({ error: 'World already exists' });
  }

  const world = {
    name,
    seed: seed || '',
    gamemode: gamemode || 'survival',
    difficulty: difficulty || 'normal',
    size: '0 B',
    last_backup: null,
    created_at: new Date().toISOString(),
  };

  db.prepare(
    'INSERT INTO worlds (name, seed, gamemode, difficulty, last_backup, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(world.name, world.seed, world.gamemode, world.difficulty, world.last_backup, world.created_at);

  // Create world directory
  const worldPath = path.join(WORLDS_DIR, name);
  if (!fs.existsSync(worldPath)) {
    fs.mkdirSync(worldPath, { recursive: true });
  }

  res.json(world);
});

router.delete('/:name', authMiddleware, requirePermission('world.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const world = db.prepare('SELECT name FROM worlds WHERE name = ?').get(req.params.name);
  if (!world) {
    return res.status(404).json({ error: 'World not found' });
  }

  db.prepare('DELETE FROM worlds WHERE name = ?').run(req.params.name);

  const worldPath = path.join(WORLDS_DIR, req.params.name);
  if (fs.existsSync(worldPath)) {
    fs.rmSync(worldPath, { recursive: true });
  }

  res.json({ success: true });
});

router.post('/:name/clone', authMiddleware, requirePermission('world.manage'), (req: AuthRequest, res) => {
  const { newName } = req.body;
  if (!newName) {
    return res.status(400).json({ error: 'New world name is required' });
  }

  const sourcePath = path.join(WORLDS_DIR, req.params.name);
  if (!fs.existsSync(sourcePath)) {
    return res.status(404).json({ error: 'Source world not found' });
  }

  const destPath = path.join(WORLDS_DIR, newName);
  if (fs.existsSync(destPath)) {
    return res.status(400).json({ error: 'Destination world already exists' });
  }

  fs.cpSync(sourcePath, destPath, { recursive: true });

  const db = getDatabase();
  const sourceWorld = db.prepare('SELECT * FROM worlds WHERE name = ?').get(req.params.name) as any;
  if (sourceWorld) {
    db.prepare(
      'INSERT INTO worlds (name, seed, gamemode, difficulty, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(newName, sourceWorld.seed, sourceWorld.gamemode, sourceWorld.difficulty, new Date().toISOString());
  }

  res.json({ success: true, name: newName });
});

router.get('/:name/download', authMiddleware, requirePermission('world.manage'), (req: AuthRequest, res) => {
  const worldPath = path.join(WORLDS_DIR, req.params.name);
  if (!fs.existsSync(worldPath)) {
    return res.status(404).json({ error: 'World not found' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  archive.directory(worldPath, req.params.name);
  archive.finalize();
});

router.post('/upload', authMiddleware, requirePermission('world.manage'), (req: AuthRequest, res) => {
  // This would be a multipart upload in production
  // For simplicity, we accept a file path
  const { filePath: uploadPath, worldName } = req.body;
  if (!uploadPath || !worldName) {
    return res.status(400).json({ error: 'File path and world name required' });
  }

  if (!fs.existsSync(uploadPath)) {
    return res.status(400).json({ error: 'Upload file not found' });
  }

  const destPath = path.join(WORLDS_DIR, worldName);
  if (fs.existsSync(destPath)) {
    return res.status(400).json({ error: 'World already exists' });
  }

  fs.mkdirSync(destPath, { recursive: true });

  fs.createReadStream(uploadPath)
    .pipe(unzipper.Extract({ path: destPath }))
    .on('close', () => {
      const db = getDatabase();
      db.prepare(
        'INSERT INTO worlds (name, created_at) VALUES (?, ?)'
      ).run(worldName, new Date().toISOString());
      res.json({ success: true, name: worldName });
    })
    .on('error', (err: Error) => {
      res.status(400).json({ error: err.message });
    });
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
