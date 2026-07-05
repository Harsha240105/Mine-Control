import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { resolveMinecraftDir } from '../paths';
import { emitToAll } from '../socketManager';

const router = Router();

function getModsDir(): string {
  return resolveMinecraftDir('mods');
}

router.get('/', authMiddleware, (_req: AuthRequest, res) => {
  const MODS_DIR = getModsDir();
  if (!fs.existsSync(MODS_DIR)) {
    return res.json([]);
  }

  const db = getDatabase();
  const dbMods = db.prepare('SELECT * FROM mods').all() as any[];
  const dbModNames = new Set(dbMods.map((m: any) => m.name));

  let jarMods: string[] = [];
  try {
    jarMods = fs.readdirSync(MODS_DIR).filter(f => f.endsWith('.jar'));
  } catch {}

  const mods = jarMods.map((jarFile: string) => {
    const name = jarFile.replace(/\.jar$/, '');
    const dbMod = dbMods.find((m: any) => m.name === name);
    return {
      name,
      jarFile,
      version: dbMod?.version || 'Unknown',
      enabled: dbMod?.enabled !== 0,
      description: dbMod?.description || 'Minecraft mod',
      author: dbMod?.author || 'Unknown',
      source: dbMod?.source || '',
      side: dbMod?.side || 'both',
    };
  });

  res.json(mods);
});

router.post('/install', authMiddleware, requirePermission('plugin.manage'), (req: AuthRequest, res) => {
  const { name, downloadUrl } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Mod name is required' });
  }

  const MODS_DIR = getModsDir();
  if (!fs.existsSync(MODS_DIR)) {
    fs.mkdirSync(MODS_DIR, { recursive: true });
  }

  if (downloadUrl) {
    const https = require('https');
    const http = require('http');
    const tempPath = path.join(MODS_DIR, `${name}.jar.download`);
    const jarPath = path.join(MODS_DIR, `${name}.jar`);
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

          try {
            const buffer = Buffer.alloc(4);
            const fd = fs.openSync(tempPath, 'r');
            fs.readSync(fd, buffer, 0, 4, 0);
            fs.closeSync(fd);

            if (buffer[0] !== 0x50 || buffer[1] !== 0x4B || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
              if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
              return res.status(400).json({ error: 'Downloaded file is not a valid mod archive.' });
            }
          } catch {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            return res.status(400).json({ error: 'Failed to verify downloaded mod integrity.' });
          }

          if (fs.existsSync(jarPath)) fs.unlinkSync(jarPath);
          fs.renameSync(tempPath, jarPath);
          registerModInDb(name);
          emitToAll('mod:installed', { name, version: '1.0' });
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

    if (downloadUrl.startsWith('modrinth:')) {
      const slug = downloadUrl.split(':')[1];
      const apiReq = https.get(`https://api.modrinth.com/v2/project/${slug}/version`, {
        headers: { 'User-Agent': 'MineControl-OS/1.0.71 (contact@minecontrol.dev)' }
      }, (modrinthRes: any) => {
        let data = '';
        modrinthRes.on('data', (c: string) => data += c);
        modrinthRes.on('end', () => {
          try {
            if (modrinthRes.statusCode !== 200) throw new Error(`Modrinth API Error: ${modrinthRes.statusCode}`);
            const versions = JSON.parse(data);
            const release = versions.find((v: any) => v.version_type === 'release') || versions[0];
            const fileUrl = release?.files?.[0]?.url;
            if (!fileUrl) throw new Error('No files found on Modrinth');
            startDownload(fileUrl);
          } catch (err: any) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            if (!res.headersSent) res.status(400).json({ error: err.message });
          }
        });
      });
      apiReq.on('error', (err: Error) => {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        if (!res.headersSent) res.status(400).json({ error: err.message });
      });
    } else if (downloadUrl.startsWith('curseforge:')) {
      const projectId = downloadUrl.split(':')[1];
      const apiReq = https.get(`https://api.curseforge.com/v1/mods/${projectId}/files?gameVersionTypeId=1&pageSize=1`, {
        headers: {
          'User-Agent': 'MineControl-OS/1.0.52 (contact@minecontrol.dev)',
          'x-api-key': process.env.CURSEFORGE_API_KEY || '',
        }
      }, (cfRes: any) => {
        let data = '';
        cfRes.on('data', (c: string) => data += c);
        cfRes.on('end', () => {
          try {
            if (cfRes.statusCode !== 200) throw new Error(`CurseForge API Error: ${cfRes.statusCode}`);
            const parsed = JSON.parse(data);
            const fileUrl = parsed?.data?.[0]?.downloadUrl;
            if (!fileUrl) throw new Error('No files found on CurseForge');
            startDownload(fileUrl);
          } catch (err: any) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            if (!res.headersSent) res.status(400).json({ error: err.message });
          }
        });
      });
      apiReq.on('error', (err: Error) => {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        if (!res.headersSent) res.status(400).json({ error: err.message });
      });
    } else {
      startDownload(downloadUrl);
    }
  } else {
    registerModInDb(name);
    emitToAll('mod:installed', { name, version: '1.0' });
    res.json({ success: true, name, message: 'Mod registered. Place the .jar file in the mods directory.' });
  }
});

router.delete('/:name', authMiddleware, requirePermission('plugin.manage'), (req: AuthRequest, res) => {
  const MODS_DIR = getModsDir();
  const jarPath = path.join(MODS_DIR, `${req.params.name}.jar`);
  if (fs.existsSync(jarPath)) {
    fs.unlinkSync(jarPath);
  }

  const db = getDatabase();
  db.prepare('DELETE FROM mods WHERE name = ?').run(req.params.name);

  emitToAll('mod:removed', { name: req.params.name });
  res.json({ success: true });
});

router.post('/:name/toggle', authMiddleware, requirePermission('plugin.manage'), (req: AuthRequest, res) => {
  const MODS_DIR = getModsDir();
  const db = getDatabase();
  const mod = db.prepare('SELECT * FROM mods WHERE name = ?').get(req.params.name) as any;

  if (!mod) {
    return res.status(404).json({ error: 'Mod not found' });
  }

  const newState = mod.enabled ? 0 : 1;
  db.prepare('UPDATE mods SET enabled = ? WHERE name = ?').run(newState, req.params.name);

  const jarPath = path.join(MODS_DIR, `${req.params.name}.jar`);
  const disabledPath = path.join(MODS_DIR, `${req.params.name}.jar.disabled`);

  if (newState && fs.existsSync(disabledPath)) {
    fs.renameSync(disabledPath, jarPath);
  } else if (!newState && fs.existsSync(jarPath)) {
    fs.renameSync(jarPath, disabledPath);
  }

  emitToAll('mod:toggled', { name: req.params.name, enabled: !!newState });
  res.json({ success: true, enabled: !!newState });
});

function registerModInDb(name: string) {
  const db = getDatabase();
  const existing = db.prepare('SELECT name FROM mods WHERE name = ?').get(name);
  if (!existing) {
    db.prepare(
      'INSERT INTO mods (name, version, enabled, description, author) VALUES (?, ?, ?, ?, ?)'
    ).run(name, '1.0', 1, 'Minecraft mod', 'Unknown');
  }
}

export default router;
