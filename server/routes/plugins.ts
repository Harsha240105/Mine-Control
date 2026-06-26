import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { resolveMinecraftDir } from '../paths';

const router = Router();
const PLUGINS_DIR = resolveMinecraftDir('plugins');

router.get('/', authMiddleware, (_req: AuthRequest, res) => {
  if (!fs.existsSync(PLUGINS_DIR)) {
    return res.json([]);
  }

  const db = getDatabase();
  const dbPlugins = db.prepare('SELECT * FROM plugins').all() as any[];
  const dbPluginNames = new Set(dbPlugins.map((p: any) => p.name));

  // Scan actual plugins directory
  const jarPlugins = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.jar'));

  const plugins = jarPlugins.map((jarFile: string) => {
    const name = jarFile.replace(/\.jar$/, '');
    const dbPlugin = dbPlugins.find((p: any) => p.name === name);
    return {
      name,
      jarFile,
      version: dbPlugin?.version || 'Unknown',
      enabled: dbPlugin?.enabled !== 0,
      description: dbPlugin?.description || 'Minecraft plugin',
      author: dbPlugin?.author || 'Unknown',
      main: dbPlugin?.main_class || '',
    };
  });

  res.json(plugins);
});

router.post('/install', authMiddleware, requirePermission('plugin.manage'), (req: AuthRequest, res) => {
  const { name, downloadUrl } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Plugin name is required' });
  }

  if (downloadUrl) {
    // Download from URL with redirect support
    const https = require('https');
    const http = require('http');
    const tempPath = path.join(PLUGINS_DIR, `${name}.jar.download`);
    const jarPath = path.join(PLUGINS_DIR, `${name}.jar`);

    let isFinished = false;

    const getWithRedirects = (requestUrl: string) => {
      if (requestUrl.startsWith('modrinth:')) {
        const slug = requestUrl.split(':')[1];
        const apiReq = https.get(`https://api.modrinth.com/v2/project/${slug}/version`, {
          headers: { 'User-Agent': 'MineControl-OS/1.0.30 (contact@minecontrol.dev)' }
        }, (res: any) => {
          let data = '';
          res.on('data', (c: string) => data += c);
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) throw new Error(`Modrinth API Error: ${res.statusCode}`);
              const versions = JSON.parse(data);
              const fileUrl = versions[0]?.files?.[0]?.url;
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
        return;
      }
      startDownload(requestUrl);
    };

    const startDownload = (urlToDownload: string) => {
      const reqClient = urlToDownload.startsWith('https') ? https : http;
      const req = reqClient.get(urlToDownload, {
        headers: { 'User-Agent': 'MineControl-OS/1.0.30 (contact@minecontrol.dev)' }
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

          // Verify zip integrity
          try {
            const buffer = Buffer.alloc(4);
            const fd = fs.openSync(tempPath, 'r');
            fs.readSync(fd, buffer, 0, 4, 0);
            fs.closeSync(fd);

            if (buffer[0] !== 0x50 || buffer[1] !== 0x4B || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
              if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
              return res.status(400).json({ error: 'Downloaded file is not a valid plugin archive.' });
            }
          } catch (err) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            return res.status(400).json({ error: 'Failed to verify downloaded plugin integrity.' });
          }

          if (fs.existsSync(jarPath)) fs.unlinkSync(jarPath);
          fs.renameSync(tempPath, jarPath);
          registerPluginInDb(name);
          res.json({ success: true, name });
        });
      });

      req.on('error', (err: Error) => {
        isFinished = true;
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        if (!res.headersSent) res.status(400).json({ error: err.message });
      });

      req.setTimeout(60000, () => {
        if (!isFinished) {
          req.destroy();
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          if (!res.headersSent) res.status(400).json({ error: 'Download timed out after 60s' });
        }
      });
    };

    getWithRedirects(downloadUrl);
  } else {
    // Placeholder - user should manually place the .jar in plugins directory
    registerPluginInDb(name);
    res.json({ success: true, name, message: 'Plugin registered. Place the .jar file in the plugins directory.' });
  }
});

router.delete('/:name', authMiddleware, requirePermission('plugin.manage'), (req: AuthRequest, res) => {
  const jarPath = path.join(PLUGINS_DIR, `${req.params.name}.jar`);
  if (fs.existsSync(jarPath)) {
    fs.unlinkSync(jarPath);
  }

  const db = getDatabase();
  db.prepare('DELETE FROM plugins WHERE name = ?').run(req.params.name);

  res.json({ success: true });
});

router.post('/:name/toggle', authMiddleware, requirePermission('plugin.manage'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const plugin = db.prepare('SELECT * FROM plugins WHERE name = ?').get(req.params.name) as any;

  if (!plugin) {
    return res.status(404).json({ error: 'Plugin not found' });
  }

  const newState = plugin.enabled ? 0 : 1;
  db.prepare('UPDATE plugins SET enabled = ? WHERE name = ?').run(newState, req.params.name);

  // Rename jar to disable/enable (add .disabled suffix)
  const jarPath = path.join(PLUGINS_DIR, `${req.params.name}.jar`);
  const disabledPath = path.join(PLUGINS_DIR, `${req.params.name}.jar.disabled`);

  if (newState && fs.existsSync(disabledPath)) {
    fs.renameSync(disabledPath, jarPath);
  } else if (!newState && fs.existsSync(jarPath)) {
    fs.renameSync(jarPath, disabledPath);
  }

  res.json({ success: true, enabled: !!newState });
});

function registerPluginInDb(name: string) {
  const db = getDatabase();
  const existing = db.prepare('SELECT name FROM plugins WHERE name = ?').get(name);
  if (!existing) {
    db.prepare(
      'INSERT INTO plugins (name, version, enabled, description, author) VALUES (?, ?, ?, ?, ?)'
    ).run(name, '1.0', 1, 'Minecraft plugin', 'Unknown');
  }
}

export default router;
