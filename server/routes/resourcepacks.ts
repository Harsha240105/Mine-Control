import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { getDatabase } from '../database';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { resolveMinecraftDir } from '../paths';
import { emitToAll } from '../socketManager';

const router = Router();

function getActiveServerId(): string | null {
  const db = getDatabase();
  return (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value || null;
}

const upload = multer({
  dest: path.join(require('os').tmpdir(), 'mc-resourcepack-uploads'),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.zip') return cb(null, true);
    cb(new Error('Only .zip files are allowed'));
  },
});

function getResourcePacksDir(): string {
  return resolveMinecraftDir('resourcepacks');
}

router.get('/', authMiddleware, (_req: AuthRequest, res) => {
  const RP_DIR = getResourcePacksDir();
  const serverId = getActiveServerId();
  if (!fs.existsSync(RP_DIR)) {
    return res.json([]);
  }

  const db = getDatabase();
  const dbPacks = serverId
    ? db.prepare('SELECT * FROM resource_packs WHERE server_id = ? OR server_id IS NULL').all(serverId) as any[]
    : db.prepare('SELECT * FROM resource_packs').all() as any[];

  let packFiles: string[] = [];
  try {
    packFiles = fs.readdirSync(RP_DIR).filter(f => f.endsWith('.zip'));
  } catch {}

  const packs = packFiles.map((fileName: string) => {
    const name = fileName.replace(/\.zip$/, '');
    const dbPack = dbPacks.find((p: any) => p.name === name);
    return {
      name,
      fileName,
      version: dbPack?.version || 'Unknown',
      enabled: dbPack?.enabled !== 0,
      description: dbPack?.description || 'Resource pack',
      author: dbPack?.author || 'Unknown',
      source: dbPack?.source || '',
    };
  });

  res.json(packs);
});

router.post('/install', authMiddleware, requirePermission('plugin.manage'), (req: AuthRequest, res) => {
  const { name, downloadUrl } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Resource pack name is required' });
  }

  const RP_DIR = getResourcePacksDir();
  if (!fs.existsSync(RP_DIR)) {
    fs.mkdirSync(RP_DIR, { recursive: true });
  }

  if (downloadUrl) {
    const https = require('https');
    const http = require('http');
    const tempPath = path.join(RP_DIR, `${name}.zip.download`);
    const zipPath = path.join(RP_DIR, `${name}.zip`);
    let isFinished = false;

    const startDownload = (urlToDownload: string) => {
      const reqClient = urlToDownload.startsWith('https') ? https : http;
      const req = reqClient.get(urlToDownload, {
        headers: { 'User-Agent': 'MineControl-OS/1.0.71 (contact@minecontrol.dev)' }
      }, (response: any) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          let newUrl = response.headers.location;
          if (!newUrl.startsWith('http')) {
            const urlObj = new URL(urlToDownload);
            newUrl = `${urlObj.protocol}//${urlObj.host}${newUrl}`;
          }
          startDownload(newUrl);
          return;
        }
        if (response.statusCode !== 200) {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          return res.status(400).json({ error: `Failed to download: HTTP ${response.statusCode}` });
        }
        const file = fs.createWriteStream(tempPath);
        response.pipe(file);

        file.on('finish', () => {
          isFinished = true;
          file.close();

          if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
          fs.renameSync(tempPath, zipPath);
          registerPackInDb(name);
          emitToAll('resourcepack:installed', { name, version: '1.0' });
          res.json({ success: true, name });
        });
      });

      req.on('error', (err: Error) => {
        isFinished = true;
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        if (!res.headersSent) res.status(400).json({ error: err.message });
      });

      req.setTimeout(300000, () => {
        if (!isFinished) {
          req.destroy();
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          if (!res.headersSent) res.status(400).json({ error: 'Download timed out after 300s' });
        }
      });
    };

    startDownload(downloadUrl);
  } else {
    registerPackInDb(name);
    emitToAll('resourcepack:installed', { name, version: '1.0' });
    res.json({ success: true, name, message: 'Resource pack registered. Place the .zip file in the resourcepacks directory.' });
  }
});

router.post('/upload', authMiddleware, requirePermission('plugin.manage'), upload.single('file'), (req: AuthRequest, res) => {
  const RP_DIR = getResourcePacksDir();
  if (!fs.existsSync(RP_DIR)) {
    fs.mkdirSync(RP_DIR, { recursive: true });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const originalName = req.body.name || req.file.originalname.replace(/\.zip$/i, '');
  const destPath = path.join(RP_DIR, `${originalName}.zip`);

  if (fs.existsSync(destPath)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'A resource pack with this name already exists' });
  }

  fs.renameSync(req.file.path, destPath);
  registerPackInDb(originalName);
  emitToAll('resourcepack:installed', { name: originalName, version: '1.0' });
  res.json({ success: true, name: originalName });
});

router.delete('/:name', authMiddleware, requirePermission('plugin.manage'), (req: AuthRequest, res) => {
  const RP_DIR = getResourcePacksDir();
  const zipPath = path.join(RP_DIR, `${req.params.name}.zip`);
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const db = getDatabase();
  db.prepare('DELETE FROM resource_packs WHERE name = ?').run(req.params.name);

  emitToAll('resourcepack:removed', { name: req.params.name });
  res.json({ success: true });
});

router.post('/:name/toggle', authMiddleware, requirePermission('plugin.manage'), (req: AuthRequest, res) => {
  const RP_DIR = getResourcePacksDir();
  const db = getDatabase();
  const pack = db.prepare('SELECT * FROM resource_packs WHERE name = ?').get(req.params.name) as any;

  if (!pack) {
    return res.status(404).json({ error: 'Resource pack not found' });
  }

  const newState = pack.enabled ? 0 : 1;
  db.prepare('UPDATE resource_packs SET enabled = ? WHERE name = ?').run(newState, req.params.name);

  const zipPath = path.join(RP_DIR, `${req.params.name}.zip`);
  const disabledPath = path.join(RP_DIR, `${req.params.name}.zip.disabled`);

  if (newState && fs.existsSync(disabledPath)) {
    fs.renameSync(disabledPath, zipPath);
  } else if (!newState && fs.existsSync(zipPath)) {
    fs.renameSync(zipPath, disabledPath);
  }

  emitToAll('resourcepack:toggled', { name: req.params.name, enabled: !!newState });
  res.json({ success: true, enabled: !!newState });
});

function registerPackInDb(name: string) {
  const db = getDatabase();
  const serverId = getActiveServerId();
  const existing = db.prepare('SELECT name FROM resource_packs WHERE name = ? AND (server_id = ? OR server_id IS NULL)').get(name, serverId);
  if (!existing) {
    db.prepare(
      'INSERT INTO resource_packs (name, version, enabled, description, author, server_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, '1.0', 1, 'Resource pack', 'Unknown', serverId);
  }
}

export default router;
