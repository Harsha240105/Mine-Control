import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();
const PLUGINS_DIR = path.join(process.cwd(), 'minecraft', 'plugins');

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
    // Download from URL
    const https = require('https');
    const http = require('http');
    const jarPath = path.join(PLUGINS_DIR, `${name}.jar`);

    const client = downloadUrl.startsWith('https') ? https : http;
    client.get(downloadUrl, (response: any) => {
      if (response.statusCode !== 200) {
        return res.status(400).json({ error: `Failed to download: HTTP ${response.statusCode}` });
      }
      const file = fs.createWriteStream(jarPath);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        registerPluginInDb(name);
        res.json({ success: true, name });
      });
    }).on('error', (err: Error) => {
      res.status(400).json({ error: err.message });
    });
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
