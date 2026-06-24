import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import net from 'net';
import { minecraftServer } from '../services/minecraftServer';
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth';
import { getDatabase } from '../database';
import { resolveMinecraftDir } from '../paths';

const router = Router();

const PAPER_API = 'https://api.papermc.io/v2/projects/paper';

router.get('/status', authMiddleware, async (_req: AuthRequest, res) => {
  const db = getDatabase();
  const onlinePlayers = db.prepare('SELECT COUNT(*) as count FROM players WHERE status = ?').get('online') as any;
  const totalPlayers = db.prepare('SELECT COUNT(*) as count FROM players').get() as any;

  const latestStats = db.prepare('SELECT * FROM system_stats ORDER BY timestamp DESC LIMIT 1').get() as any;

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
      } catch (e) {}
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

// Connection Info
router.get('/connection', authMiddleware, async (_req: AuthRequest, res) => {
  let publicIp = '';
  try {
    publicIp = await new Promise((resolve) => {
      https.get('https://api.ipify.org?format=json', (resp) => {
        let data = '';
        resp.on('data', (chunk) => data += chunk);
        resp.on('end', () => {
          try { resolve(JSON.parse(data).ip); } catch { resolve(''); }
        });
      }).on('error', () => resolve(''));
    });
  } catch {}

  const config = minecraftServer.getConfig();
  const mcDir = resolveMinecraftDir();
  const propsPath = path.join(mcDir, 'server.properties');

  let serverIp = '';
  let onlineMode = true;
  try {
    const props = fs.readFileSync(propsPath, 'utf-8');
    const ipMatch = props.match(/^server-ip=(.*)$/m);
    if (ipMatch) serverIp = ipMatch[1].trim();
    const omMatch = props.match(/^online-mode=(.*)$/m);
    if (omMatch) onlineMode = omMatch[1].trim() !== 'false';
  } catch {}

  const networkInterfaces = os.networkInterfaces();
  let lanAddress = '';
  for (const [name, addrs] of Object.entries(networkInterfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('127.')) {
        lanAddress = `${addr.address}:${config.port}`;
        break;
      }
    }
    if (lanAddress) break;
  }

  const db = getDatabase();
  const playitAddress = (db.prepare('SELECT value FROM server_config WHERE key = ?').get('playitAddress') as any)?.value || '';

  res.json({
    localAddress: `localhost:${config.port}`,
    lanAddress,
    publicIp,
    port: String(config.port),
    serverIp,
    onlineMode,
    serverVersion: config.jarFile?.replace('paper-', '').replace('.jar', '') || 'Unknown',
    playitAddress,
    playitEnabled: !!playitAddress,
    boundToLocalhost: serverIp === '127.0.0.1' || serverIp === 'localhost',
  });
});

// Diagnostics
router.get('/diagnostics', authMiddleware, async (_req: AuthRequest, res) => {
  const config = minecraftServer.getConfig();
  const mcDir = resolveMinecraftDir();
  const checks: any[] = [];

  // Java check
  try {
    const { execSync } = require('child_process');
    const ver = execSync('"java" -version 2>&1', { encoding: 'utf-8', timeout: 5000 });
    checks.push({ name: 'Java Installation', status: 'pass', message: `Java found: ${ver.split('\n')[0]}` });
  } catch {
    checks.push({ name: 'Java Installation', status: 'fail', message: 'Java not found. Install Java 21+ and set JAVA_HOME.' });
  }

  // Server jar check
  const jarPath = path.join(mcDir, config.jarFile || 'server.jar');
  if (fs.existsSync(jarPath)) {
    const size = fs.statSync(jarPath).size;
    checks.push({ name: 'Server Jar', status: 'pass', message: `${config.jarFile || 'server.jar'} found (${(size / 1024 / 1024).toFixed(1)} MB)` });
  } else {
    checks.push({ name: 'Server Jar', status: 'fail', message: `Server jar not found at ${jarPath}. Use the Version Selector to download one.` });
  }

  // EULA check
  const eulaPath = path.join(mcDir, 'eula.txt');
  if (fs.existsSync(eulaPath)) {
    const eula = fs.readFileSync(eulaPath, 'utf-8');
    checks.push({ name: 'EULA', status: eula.includes('eula=true') ? 'pass' : 'warn', message: eula.includes('eula=true') ? 'EULA accepted' : 'EULA not accepted. Will be auto-accepted on start.' });
  } else {
    checks.push({ name: 'EULA', status: 'info', message: 'EULA file not found. Will be created on first start.' });
  }

  // Port binding
  const propsPath = path.join(mcDir, 'server.properties');
  let serverIp = '';
  try {
    const props = fs.readFileSync(propsPath, 'utf-8');
    const match = props.match(/^server-ip=(.*)$/m);
    if (match) serverIp = match[1].trim();
  } catch {}

  if (serverIp === '127.0.0.1' || serverIp === 'localhost') {
    checks.push({ name: 'Port Binding', status: 'warn', message: `Server bound to ${serverIp}. External connections will not work. Set server-ip= to empty.` });
  } else if (serverIp) {
    checks.push({ name: 'Port Binding', status: 'warn', message: `Server bound to ${serverIp}. Make sure this is correct.` });
  } else {
    checks.push({ name: 'Port Binding', status: 'pass', message: 'Server will listen on all interfaces (0.0.0.0)' });
  }

  // Port reachability
  try {
    await new Promise((resolve, reject) => {
      const sock = new net.Socket();
      sock.setTimeout(3000);
      sock.on('connect', () => { sock.destroy(); resolve(undefined); });
      sock.on('error', () => { sock.destroy(); reject(new Error('unreachable')); });
      sock.on('timeout', () => { sock.destroy(); reject(new Error('timeout')); });
      sock.connect(config.port, '127.0.0.1');
    });
    checks.push({ name: 'Local Port', status: 'pass', message: `Port ${config.port} is reachable locally` });
  } catch {
    checks.push({ name: 'Local Port', status: 'warn', message: `Port ${config.port} is not responding locally. Start the server first.` });
  }

  // Plugins directory
  const pluginsDir = path.join(mcDir, 'plugins');
  if (fs.existsSync(pluginsDir)) {
    const jars = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.jar'));
    checks.push({ name: 'Plugins', status: 'pass', message: `${jars.length} plugin(s) found` });
  } else {
    checks.push({ name: 'Plugins', status: 'info', message: 'Plugins directory not found. Will be created on first start.' });
  }

  // Minecraft directory
  if (fs.existsSync(mcDir)) {
    checks.push({ name: 'Minecraft Directory', status: 'pass', message: `Found at ${mcDir}` });
  } else {
    checks.push({ name: 'Minecraft Directory', status: 'fail', message: `Not found at ${mcDir}` });
  }

  // Server status
  if (minecraftServer.isRunning) {
    checks.push({ name: 'Server Status', status: 'pass', message: 'Server is running' });
  } else if (minecraftServer.isStarting) {
    checks.push({ name: 'Server Status', status: 'info', message: 'Server is starting...' });
  } else {
    checks.push({ name: 'Server Status', status: 'info', message: 'Server is stopped' });
  }

  res.json(checks);
});

// Health Check
router.post('/health-check', authMiddleware, async (_req: AuthRequest, res) => {
  const checks: any[] = [];
  let publicIp = '';
  let reachable = false;
  let cgnat = false;
  let cgnatReason: string | null = null;

  try {
    publicIp = await new Promise((resolve) => {
      https.get('https://api.ipify.org?format=json', (resp) => {
        let data = '';
        resp.on('data', (chunk) => data += chunk);
        resp.on('end', () => {
          try { resolve(JSON.parse(data).ip); } catch { resolve(''); }
        });
      }).on('error', () => resolve(''));
    });
    checks.push({ name: 'Public IP', status: publicIp ? 'pass' : 'warn', message: publicIp ? `Your public IP: ${publicIp}` : 'Could not determine public IP' });
  } catch {
    checks.push({ name: 'Public IP', status: 'warn', message: 'Could not determine public IP' });
  }

  // Check if IP is in CGNAT range
  if (publicIp) {
    const firstOctet = parseInt(publicIp.split('.')[0]);
    if (firstOctet >= 100 && firstOctet <= 100) {
      cgnat = true;
      cgnatReason = `Your IP (${publicIp}) appears to be in a CGNAT range. Port forwarding may not work. Use Playit.gg tunnel instead.`;
      checks.push({ name: 'CGNAT Detection', status: 'warn', message: cgnatReason });
    } else {
      checks.push({ name: 'CGNAT Detection', status: 'pass', message: 'No CGNAT detected' });
    }
  }

  const config = minecraftServer.getConfig();
  try {
    reachable = await new Promise((resolve) => {
      https.get(`https://api.ipify.org?format=json`, () => {
        resolve(true);
      }).on('error', () => resolve(false));
    });
  } catch {}

  const mcDir = resolveMinecraftDir();
  const propsPath = path.join(mcDir, 'server.properties');
  let serverIp = '';
  try {
    const props = fs.readFileSync(propsPath, 'utf-8');
    const match = props.match(/^server-ip=(.*)$/m);
    if (match) serverIp = match[1].trim();
  } catch {}

  if (serverIp === '127.0.0.1' || serverIp === 'localhost') {
    checks.push({ name: 'Server Binding', status: 'warn', message: `Server is bound to ${serverIp}. Set server-ip= to empty for external access.` });
  } else {
    checks.push({ name: 'Server Binding', status: 'pass', message: 'Server binding looks good' });
  }

  const jarPath = path.join(mcDir, config.jarFile || 'server.jar');
  if (fs.existsSync(jarPath)) {
    checks.push({ name: 'Server Jar', status: 'pass', message: 'Server jar found' });
  } else {
    checks.push({ name: 'Server Jar', status: 'fail', message: 'Server jar not found. Use Version Selector.' });
  }

  try {
    const { execSync } = require('child_process');
    execSync('"java" -version 2>&1', { encoding: 'utf-8', timeout: 5000 });
    checks.push({ name: 'Java', status: 'pass', message: 'Java is installed' });
  } catch {
    checks.push({ name: 'Java', status: 'fail', message: 'Java not found' });
  }

  const overall = checks.every(c => c.status === 'pass') ? 'pass' : checks.some(c => c.status === 'fail') ? 'fail' : 'warn';

  res.json({
    checks,
    reachable,
    publicIp,
    cgnat,
    cgnatReason,
    overall,
  });
});

// Version Management
router.get('/versions', authMiddleware, async (_req: AuthRequest, res) => {
  const mcDir = resolveMinecraftDir();
  const config = minecraftServer.getConfig();
  const currentVersion = config.jarFile?.replace('paper-', '').replace('.jar', '') || 'unknown';

  // Get currently downloaded jar
  let downloadedVersions: string[] = [];
  try {
    const files = fs.readdirSync(mcDir).filter(f => f.endsWith('.jar') && !f.includes('server'));
    downloadedVersions = files.map(f => f.replace('.jar', ''));
  } catch {}

  // Fetch available versions from PaperMC API
  let availableVersions: any[] = [];
  try {
    const data = await new Promise<string>((resolve, reject) => {
      https.get(`${PAPER_API}`, (resp) => {
        let d = '';
        resp.on('data', (chunk) => d += chunk);
        resp.on('end', () => resolve(d));
      }).on('error', reject);
    });
    const parsed = JSON.parse(data);
    availableVersions = (parsed.versions || []).reverse().map((v: string) => ({
      version: v,
      downloaded: downloadedVersions.some(d => d.includes(v)),
      current: currentVersion.includes(v),
    }));
  } catch {
    availableVersions = downloadedVersions.map(v => ({
      version: v,
      downloaded: true,
      current: currentVersion.includes(v),
    }));
  }

  res.json({
    currentVersion,
    availableVersions,
    downloadedVersions,
  });
});

router.post('/version', authMiddleware, requirePermission('server.start'), async (req: AuthRequest, res) => {
  const { version } = req.body;
  if (!version) {
    return res.status(400).json({ error: 'Version is required' });
  }

  try {
    if (minecraftServer.isRunning) {
      await minecraftServer.stop();
      await new Promise(r => setTimeout(r, 3000));
    }

    const mcDir = resolveMinecraftDir();
    const jarFile = `paper-${version}.jar`;
    const jarPath = path.join(mcDir, jarFile);

    if (!fs.existsSync(jarPath)) {
      // Try to download the latest build for this version
      try {
        const buildsData = await new Promise<string>((resolve, reject) => {
          https.get(`${PAPER_API}/versions/${version}/builds`, (resp) => {
            let d = '';
            resp.on('data', (chunk) => d += chunk);
            resp.on('end', () => resolve(d));
          }).on('error', reject);
        });
        const builds = JSON.parse(buildsData);
        const latestBuild = builds.builds && builds.builds[builds.builds.length - 1];
        if (!latestBuild) {
          throw new Error(`No builds found for Paper ${version}`);
        }
        const downloadUrl = `${PAPER_API}/versions/${version}/builds/${latestBuild.build}/downloads/${latestBuild.downloads.application.name}`;

        await new Promise<void>((resolve, reject) => {
          const file = fs.createWriteStream(jarPath);
          https.get(downloadUrl, (resp) => {
            if (resp.statusCode !== 200) {
              reject(new Error(`Failed to download: HTTP ${resp.statusCode}`));
              return;
            }
            resp.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
          }).on('error', reject);
        });
      } catch (err: any) {
        return res.status(400).json({ error: `Failed to download Paper ${version}: ${err.message}. Try a different version.` });
      }
    }

    minecraftServer.updateConfig('jarFile', jarFile);
    res.json({ success: true, message: `Switched to Paper ${version}. Start the server to apply.` });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Game Mode Switch
router.post('/gamemode', authMiddleware, requirePermission('server.start'), async (req: AuthRequest, res) => {
  const { mode } = req.body;
  const validModes = ['survival', 'creative', 'adventure', 'spectator'];
  if (!validModes.includes(mode)) {
    return res.status(400).json({ error: `Invalid mode. Choose from: ${validModes.join(', ')}` });
  }

  minecraftServer.updateConfig('gamemode', mode);

  const mcDir = resolveMinecraftDir();
  const propsPath = path.join(mcDir, 'server.properties');
  if (fs.existsSync(propsPath)) {
    let content = fs.readFileSync(propsPath, 'utf-8');
    const regex = /^gamemode=.*/m;
    if (regex.test(content)) {
      content = content.replace(regex, `gamemode=${mode}`);
    } else {
      content += `\ngamemode=${mode}`;
    }
    fs.writeFileSync(propsPath, content, 'utf-8');
  }

  if (minecraftServer.isRunning) {
    await minecraftServer.sendCommand(`defaultgamemode ${mode}`);
  }

  res.json({ success: true, message: `Game mode switched to ${mode}` });
});

export default router;
