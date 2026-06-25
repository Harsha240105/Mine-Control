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
const MOJANG_MANIFEST = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';

interface MojangVersion {
  id: string;
  type: string;
  url: string;
  time: string;
  releaseTime: string;
}

// Simple in-memory cache
const cache: { [key: string]: { data: any; expiry: number } } = {};

function cacheGet<T>(key: string): T | null {
  const entry = cache[key];
  if (entry && entry.expiry > Date.now()) return entry.data;
  return null;
}

function cacheSet(key: string, data: any, ttlMs = 300000) {
  cache[key] = { data, expiry: Date.now() + ttlMs };
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      let d = '';
      resp.on('data', (chunk) => d += chunk);
      resp.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

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

  let publicIp = '';
  try { publicIp = (await httpsGet('https://api.ipify.org?format=json')).match(/"ip":"([^"]+)"/)?.[1] || ''; } catch {}

  const status = {
    running: minecraftServer.isRunning,
    starting: minecraftServer.isStarting,
    serverName: config.motd || 'MineControl OS',
    port: config.port || 25565,
    publicIp,
    serverVersion: (config.jarFile || '').replace('paper-', '').replace('vanilla-', '').replace('.jar', '') || 'Unknown',
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
    serverVersion: (config.jarFile || '').replace('paper-', '').replace('vanilla-', '').replace('.jar', '') || 'Unknown',
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
    // Check for any paper-*.jar or vanilla-*.jar as fallback
    const jars = fs.readdirSync(mcDir).filter(f => f.endsWith('.jar') && (f.startsWith('paper-') || f.startsWith('vanilla-')));
    if (jars.length > 0) {
      checks.push({ name: 'Server Jar', status: 'warn', message: `No jar configured, but found: ${jars.join(', ')}. Select one in Version Selector.` });
    } else {
      checks.push({ name: 'Server Jar', status: 'fail', message: `Server jar not found at ${jarPath}. Use the Version Selector to download one.` });
    }
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
    const jars = fs.readdirSync(mcDir).filter(f => f.endsWith('.jar') && (f.startsWith('paper-') || f.startsWith('vanilla-')));
    if (jars.length > 0) {
      checks.push({ name: 'Server Jar', status: 'warn', message: `No jar configured. Found: ${jars.join(', ')}` });
    } else {
      checks.push({ name: 'Server Jar', status: 'fail', message: 'Server jar not found. Use Version Selector.' });
    }
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

// Version Management - All Minecraft versions
router.get('/versions', authMiddleware, async (_req: AuthRequest, res) => {
  const mcDir = resolveMinecraftDir();
  const config = minecraftServer.getConfig();

  // Read version from servers table (more reliable than parsing jar filename)
  const db = getDatabase();
  const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
  let currentVersion = 'unknown';
  let currentSource = 'unknown';
  if (activeId) {
    const server = db.prepare('SELECT version, version_source, jarFile FROM servers WHERE id = ?').get(activeId) as any;
    if (server?.version) {
      currentVersion = server.version;
      currentSource = server.version_source || 'unknown';
    } else {
      // Fallback: parse jar filename
      const jarFile = server?.jarFile || config.jarFile || 'server.jar';
      currentVersion = jarFile.replace('paper-', '').replace('vanilla-', '').replace('.jar', '');
      if (jarFile.startsWith('paper-')) currentSource = 'PaperMC';
      else if (jarFile.startsWith('vanilla-')) currentSource = 'Mojang';
    }
  }

  // Get downloaded jars
  let downloadedJars: string[] = [];
  try {
    const files = fs.readdirSync(mcDir).filter(f => f.endsWith('.jar') && !f.startsWith('server'));
    downloadedJars = files.map(f => f.replace('.jar', ''));
  } catch {}

  // Fetch PaperMC versions (for fast lookup)
  let paperVersions: string[] = [];
  const cachedPaper = cacheGet<string[]>('paperVersions');
  if (cachedPaper) {
    paperVersions = cachedPaper;
  } else {
    try {
      const data = await httpsGet(PAPER_API);
      const parsed = JSON.parse(data);
      paperVersions = parsed.versions || [];
      cacheSet('paperVersions', paperVersions);
    } catch {}
  }

  // Fetch Mojang manifest for ALL Minecraft versions
  let mojangVersions: MojangVersion[] = [];
  const cachedMojang = cacheGet<MojangVersion[]>('mojangVersions');
  if (cachedMojang) {
    mojangVersions = cachedMojang;
  } else {
    try {
      const data = await httpsGet(MOJANG_MANIFEST);
      const parsed = JSON.parse(data);
      mojangVersions = parsed.versions || [];
      cacheSet('mojangVersions', mojangVersions);
    } catch {}
  }

  // Build combined version list
  const versionSet = new Set<string>();
  const combined: any[] = [];

  // Add PaperMC versions first (preferred)
  for (const v of paperVersions) {
    if (versionSet.has(v)) continue;
    versionSet.add(v);
    const jarPrefix = `paper-${v}`;
    combined.push({
      version: v,
      type: 'release',
      source: 'PaperMC',
      downloaded: downloadedJars.some(d => d === jarPrefix),
      current: currentVersion === v && currentSource === 'PaperMC',
    });
  }

  // Add all versions from Mojang manifest (including old/beta/alpha)
  const typeOrder: Record<string, number> = {
    'release': 0,
    'snapshot': 1,
    'old_beta': 2,
    'beta': 2,
    'old_alpha': 3,
    'alpha': 3,
  };

  const typeLabels: Record<string, string> = {
    'release': 'Release',
    'snapshot': 'Snapshot',
    'old_beta': 'Beta',
    'beta': 'Beta',
    'old_alpha': 'Alpha',
    'alpha': 'Alpha',
  };

  const releaseTimeMap = new Map<string, string>();
  for (const mv of mojangVersions) {
    releaseTimeMap.set(mv.id, mv.releaseTime);
  }

  for (const mv of mojangVersions) {
    if (versionSet.has(mv.id)) continue;
    const displayType = typeLabels[mv.type] || mv.type;
    versionSet.add(mv.id);
    const jarPrefix = `vanilla-${mv.id}`;
    combined.push({
      version: mv.id,
      type: displayType,
      typeRaw: mv.type,
      source: 'Mojang',
      downloaded: downloadedJars.some(d => d === jarPrefix),
      current: currentVersion === mv.id && currentSource === 'Mojang',
      releaseTime: mv.releaseTime,
    });
  }

  // Sort: release first (by version descending), then other types
  combined.sort((a, b) => {
    const orderA = typeOrder[a.typeRaw] ?? 99;
    const orderB = typeOrder[b.typeRaw] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    const tA = a.releaseTime || '';
    const tB = b.releaseTime || '';
    return tB.localeCompare(tA);
  });

  res.json({
    currentVersion: currentVersion || 'unknown',
    currentSource: currentSource || 'unknown',
    availableVersions: combined,
    downloadedJars,
  });
});

router.post('/version', authMiddleware, requirePermission('server.start'), async (req: AuthRequest, res) => {
  const { version, source } = req.body;
  if (!version) {
    return res.status(400).json({ error: 'Version is required' });
  }

  try {
    if (minecraftServer.isRunning) {
      await minecraftServer.stop();
      await new Promise(r => setTimeout(r, 3000));
    }

    const mcDir = resolveMinecraftDir();
    const usePaper = source === 'PaperMC' || (!source && await isPaperAvailable(version));
    const jarPrefix = usePaper ? 'paper' : 'vanilla';
    const jarFile = `${jarPrefix}-${version}.jar`;
    const jarPath = path.join(mcDir, jarFile);

    if (!fs.existsSync(jarPath)) {
      if (usePaper) {
        // Download from PaperMC
        await downloadPaperVersion(version, jarPath);
      } else {
        // Download from Mojang
        await downloadVanillaVersion(version, jarPath);
      }
    }

    minecraftServer.updateConfig('jarFile', jarFile);
    // Also save version info to servers table
    const db = getDatabase();
    const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
    if (activeId) {
      const sourceName = usePaper ? 'PaperMC' : 'Mojang';
      db.prepare("UPDATE servers SET version = ?, version_source = ?, updated_at = datetime('now') WHERE id = ?").run(version, sourceName, activeId);
    }
    const displaySource = usePaper ? 'Paper' : 'Mojang';
    res.json({ success: true, message: `Switched to ${displaySource} ${version}. Start the server to apply.` });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

async function isPaperAvailable(version: string): Promise<boolean> {
  let paperVersions: string[] = [];
  const cached = cacheGet<string[]>('paperVersions');
  if (cached) {
    paperVersions = cached;
  } else {
    try {
      const data = await httpsGet(PAPER_API);
      const parsed = JSON.parse(data);
      paperVersions = parsed.versions || [];
      cacheSet('paperVersions', paperVersions);
    } catch {
      return false;
    }
  }
  return paperVersions.includes(version);
}

async function downloadPaperVersion(version: string, jarPath: string): Promise<void> {
  try {
    const buildsData = await httpsGet(`${PAPER_API}/versions/${version}/builds`);
    const builds = JSON.parse(buildsData);
    const latestBuild = builds.builds && builds.builds[builds.builds.length - 1];
    if (!latestBuild) {
      throw new Error(`No builds found for Paper ${version}`);
    }
    const downloadUrl = `${PAPER_API}/versions/${version}/builds/${latestBuild.build}/downloads/${latestBuild.downloads.application.name}`;
    await downloadFile(downloadUrl, jarPath);
  } catch (err: any) {
    throw new Error(`Failed to download Paper ${version}: ${err.message}`);
  }
}

async function downloadVanillaVersion(version: string, jarPath: string): Promise<void> {
  try {
    // Get manifest
    let mojangVersions: MojangVersion[] = [];
    const cached = cacheGet<MojangVersion[]>('mojangVersions');
    if (cached) {
      mojangVersions = cached;
    } else {
      const data = await httpsGet(MOJANG_MANIFEST);
      const parsed = JSON.parse(data);
      mojangVersions = parsed.versions || [];
      cacheSet('mojangVersions', mojangVersions);
    }

    // Find the version entry
    const versionEntry = mojangVersions.find(v => v.id === version);
    if (!versionEntry) {
      throw new Error(`Version ${version} not found in Mojang manifest`);
    }

    // Get version details (contains download URL)
    const detailsData = await httpsGet(versionEntry.url);
    const details = JSON.parse(detailsData);
    const serverDownload = details.downloads?.server;
    if (!serverDownload?.url) {
      throw new Error(`No server download available for ${version}`);
    }

    await downloadFile(serverDownload.url, jarPath);
  } catch (err: any) {
    throw new Error(`Failed to download Minecraft ${version}: ${err.message}`);
  }
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (resp) => {
      if (resp.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${resp.statusCode}`));
        return;
      }
      resp.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      file.close();
      reject(err);
    });
  });
}

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
