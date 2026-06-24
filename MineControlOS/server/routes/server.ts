import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { minecraftServer } from '../services/minecraftServer';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { getDatabase } from '../database';
import { resolveMinecraftDir } from '../paths';

const router = Router();

router.get('/status', authMiddleware, async (_req: AuthRequest, res) => {
  const db = getDatabase();
  const onlinePlayers = db.prepare('SELECT COUNT(*) as count FROM players WHERE status = ?').get('online') as any;
  const totalPlayers = db.prepare('SELECT COUNT(*) as count FROM players').get() as any;

  // Get latest stats
  const latestStats = db.prepare('SELECT * FROM system_stats ORDER BY timestamp DESC LIMIT 1').get() as any;

  // Real system resources
  let systemRamTotal = 0, systemRamUsed = 0, diskTotal = 0, diskUsed = 0;
  try {
    const si = require('systeminformation');
    const [mem, disk] = await Promise.all([
      si.mem().catch(() => ({ total: 0, used: 0 })),
      si.fsSize().catch(() => []),
    ]);
    systemRamTotal = Math.round(mem.total / 1024 / 1024);
    systemRamUsed = Math.round(mem.used / 1024 / 1024);
    if (disk.length > 0) {
      const root = disk.find((d: any) => d.mount === '/') || disk[0];
      diskTotal = Math.round(root.size / 1024 / 1024 / 1024);
      diskUsed = Math.round(root.used / 1024 / 1024 / 1024);
    }
  } catch {}

  // Minecraft directory size
  let mcDirSize = 0;
  try {
    const mcDir = resolveMinecraftDir();
    if (fs.existsSync(mcDir)) {
      const getSize = (dir: string): number => {
        let total = 0;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isFile()) total += fs.statSync(p).size;
            else if (e.isDirectory()) total += getSize(p);
          }
        } catch {}
        return total;
      };
      mcDirSize = Math.round(getSize(mcDir) / 1024 / 1024);
    }
  } catch {}

  const config = minecraftServer.getConfig();
  const mcMaxRam = parseInt(config.maxRam) * 1024 || 8192;

  const status = {
    running: minecraftServer.isRunning,
    starting: minecraftServer.isStarting,
    onlinePlayers: onlinePlayers?.count || 0,
    totalPlayers: totalPlayers?.count || 0,
    maxPlayers: config.maxPlayers,
    cpuUsage: latestStats?.cpu || 0,
    ramUsage: latestStats?.ram || 0,
    ramTotal: mcMaxRam,
    systemRamTotal,
    systemRamUsed,
    tps: latestStats?.tps || 20,
    diskTotal,
    diskUsed,
    mcDirSize,
    uptime: minecraftServer.uptime,
    startedAt: minecraftServer.startedAtISO,
  };

  res.json(status);
});

router.post('/start', authMiddleware, requirePermission('server.start'), async (_req: AuthRequest, res) => {
  try {
    await minecraftServer.start();
    res.json({ success: true, message: 'Server starting...' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/stop', authMiddleware, requirePermission('server.stop'), async (_req: AuthRequest, res) => {
  try {
    await minecraftServer.stop();
    res.json({ success: true, message: 'Server stopping...' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/restart', authMiddleware, requirePermission('server.restart'), async (_req: AuthRequest, res) => {
  try {
    await minecraftServer.stop();
    setTimeout(async () => {
      try {
        await minecraftServer.start();
      } catch (e) {
        // handle later
      }
    }, 3000);
    res.json({ success: true, message: 'Server restarting...' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/command', authMiddleware, requirePermission('console.send'), async (req: AuthRequest, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }
  try {
    await minecraftServer.sendCommand(command);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/logs', authMiddleware, requirePermission('console.read'), (req: AuthRequest, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  const logs = minecraftServer.getLogs(limit, offset);
  res.json(logs);
});

router.get('/logs/search', authMiddleware, requirePermission('console.read'), (req: AuthRequest, res) => {
  const query = req.query.q as string;
  if (!query) {
    return res.status(400).json({ error: 'Search query required' });
  }
  const results = minecraftServer.searchLogs(query);
  res.json(results);
});

router.get('/config', authMiddleware, (_req: AuthRequest, res) => {
  res.json(minecraftServer.getConfig());
});

router.put('/config', authMiddleware, requirePermission('server.start'), (req: AuthRequest, res) => {
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
    minecraftServer.updateConfig(key, String(value));
  }
  res.json({ success: true, config: minecraftServer.getConfig() });
});

router.get('/stats/history', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const minutes = parseInt(req.query.minutes as string) || 30;
  const since = Date.now() - minutes * 60 * 1000;
  const stats = db.prepare(
    'SELECT * FROM system_stats WHERE timestamp > ? ORDER BY timestamp ASC'
  ).all(since);
  res.json(stats);
});

router.get('/audit-log', authMiddleware, requirePermission('server.start'), (req: AuthRequest, res) => {
  const db = getDatabase();
  const limit = parseInt(req.query.limit as string) || 50;
  const logs = db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?').all(limit);
  res.json(logs);
});

router.get('/properties', authMiddleware, (_req: AuthRequest, res) => {
  const mcDir = resolveMinecraftDir();
  const propsPath = path.join(mcDir, 'server.properties');
  if (!fs.existsSync(propsPath)) {
    return res.json({});
  }
  const content = fs.readFileSync(propsPath, 'utf-8');
  const props: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    props[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  res.json(props);
});

// Version management
router.get('/versions', authMiddleware, async (_req: AuthRequest, res) => {
  try {
    const versions = await minecraftServer.getAvailableVersions();
    const current = minecraftServer.getCurrentVersion();
    res.json({ versions, currentVersion: current });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/version', authMiddleware, requirePermission('server.start'), async (req: AuthRequest, res) => {
  try {
    const { version } = req.body;
    if (!version) return res.status(400).json({ error: 'Version is required' });
    await minecraftServer.changeVersion(version);
    res.json({ success: true, message: `Changed to Paper ${version}` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Diagnostics
router.get('/diagnostics', authMiddleware, (_req: AuthRequest, res) => {
  res.json(minecraftServer.getDiagnostics());
});

// Health check
router.post('/health-check', authMiddleware, async (_req: AuthRequest, res) => {
  try {
    const result = await minecraftServer.healthCheck();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Connection info
router.get('/connection', authMiddleware, async (_req: AuthRequest, res) => {
  const info = minecraftServer.getConnectionInfo();
  // Get public IP
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json');
    const ipData = await ipRes.json() as any;
    info.publicIp = ipData.ip;
  } catch {}
  // Get LAN IP
  try {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          info.lanAddress = `${iface.address}:${info.port}`;
          break;
        }
      }
      if (info.lanAddress) break;
    }
  } catch {}
  res.json(info);
});

// Server events
router.get('/events', authMiddleware, (req: AuthRequest, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(minecraftServer.getServerEvents(limit));
});

router.put('/properties', authMiddleware, requirePermission('server.start'), (req: AuthRequest, res) => {
  const updates: Record<string, string> = req.body;
  const mcDir = resolveMinecraftDir();
  const propsPath = path.join(mcDir, 'server.properties');
  if (!fs.existsSync(propsPath)) {
    return res.status(400).json({ error: 'server.properties not found. Start the server first to generate it.' });
  }
  let content = fs.readFileSync(propsPath, 'utf-8');
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }
  fs.writeFileSync(propsPath, content, 'utf-8');
  res.json({ success: true, message: 'Server properties updated. Restart server to apply changes.' });
});

export default router;
