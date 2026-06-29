import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { resolveMinecraftDir } from '../paths';
import { emitToAll } from '../socketManager';

const router = Router();

function getShadersDir(): string {
  return resolveMinecraftDir('shaderpacks');
}

router.get('/', authMiddleware, (_req: AuthRequest, res) => {
  const SHADERS_DIR = getShadersDir();
  if (!fs.existsSync(SHADERS_DIR)) {
    return res.json([]);
  }

  const db = getDatabase();
  const dbShaders = db.prepare('SELECT * FROM shaders').all() as any[];

  let shaderFiles: string[] = [];
  try {
    shaderFiles = fs.readdirSync(SHADERS_DIR).filter(f => f.endsWith('.zip'));
  } catch {}

  const shaders = shaderFiles.map((fileName: string) => {
    const name = fileName.replace(/\.zip$/, '');
    const dbShader = dbShaders.find((s: any) => s.name === name);
    return {
      name,
      fileName,
      version: dbShader?.version || 'Unknown',
      enabled: dbShader?.enabled !== 0,
      description: dbShader?.description || 'Shader pack',
      author: dbShader?.author || 'Unknown',
      source: dbShader?.source || '',
    };
  });

  res.json(shaders);
});

router.post('/install', authMiddleware, requirePermission('plugin.manage'), (req: AuthRequest, res) => {
  const { name, downloadUrl } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Shader name is required' });
  }

  const SHADERS_DIR = getShadersDir();
  if (!fs.existsSync(SHADERS_DIR)) {
    fs.mkdirSync(SHADERS_DIR, { recursive: true });
  }

  if (downloadUrl) {
    const https = require('https');
    const http = require('http');
    const tempPath = path.join(SHADERS_DIR, `${name}.zip.download`);
    const zipPath = path.join(SHADERS_DIR, `${name}.zip`);
    let isFinished = false;

    const startDownload = (urlToDownload: string) => {
      const reqClient = urlToDownload.startsWith('https') ? https : http;
      const req = reqClient.get(urlToDownload, {
        headers: { 'User-Agent': 'MineControl-OS/1.0.52 (contact@minecontrol.dev)' }
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
          registerShaderInDb(name);
          emitToAll('shader:installed', { name, version: '1.0' });
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
    registerShaderInDb(name);
    emitToAll('shader:installed', { name, version: '1.0' });
    res.json({ success: true, name, message: 'Shader registered. Place the .zip file in the shaderpacks directory.' });
  }
});

router.delete('/:name', authMiddleware, requirePermission('plugin.manage'), (req: AuthRequest, res) => {
  const SHADERS_DIR = getShadersDir();
  const zipPath = path.join(SHADERS_DIR, `${req.params.name}.zip`);
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const db = getDatabase();
  db.prepare('DELETE FROM shaders WHERE name = ?').run(req.params.name);

  emitToAll('shader:removed', { name: req.params.name });
  res.json({ success: true });
});

router.post('/:name/toggle', authMiddleware, requirePermission('plugin.manage'), (req: AuthRequest, res) => {
  const SHADERS_DIR = getShadersDir();
  const db = getDatabase();
  const shader = db.prepare('SELECT * FROM shaders WHERE name = ?').get(req.params.name) as any;

  if (!shader) {
    return res.status(404).json({ error: 'Shader not found' });
  }

  const newState = shader.enabled ? 0 : 1;
  db.prepare('UPDATE shaders SET enabled = ? WHERE name = ?').run(newState, req.params.name);

  const zipPath = path.join(SHADERS_DIR, `${req.params.name}.zip`);
  const disabledPath = path.join(SHADERS_DIR, `${req.params.name}.zip.disabled`);

  if (newState && fs.existsSync(disabledPath)) {
    fs.renameSync(disabledPath, zipPath);
  } else if (!newState && fs.existsSync(zipPath)) {
    fs.renameSync(zipPath, disabledPath);
  }

  emitToAll('shader:toggled', { name: req.params.name, enabled: !!newState });
  res.json({ success: true, enabled: !!newState });
});

function registerShaderInDb(name: string) {
  const db = getDatabase();
  const existing = db.prepare('SELECT name FROM shaders WHERE name = ?').get(name);
  if (!existing) {
    db.prepare(
      'INSERT INTO shaders (name, version, enabled, description, author) VALUES (?, ?, ?, ?, ?)'
    ).run(name, '1.0', 1, 'Shader pack', 'Unknown');
  }
}

export default router;
