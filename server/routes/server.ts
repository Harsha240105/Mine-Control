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
import { JavaDetector } from '../services/JavaDetector';
import {
  cacheGet, cacheSet, httpsGet, downloadFile, isPaperAvailable,
  downloadPaperVersion, downloadFabricVersion, downloadPurpurVersion,
  downloadForgeVersion, downloadVanillaVersion, downloadVersion,
  MojangVersion, PAPER_API, MOJANG_MANIFEST, FABRIC_API, FORGE_API, PURPUR_API
} from '../services/download';

const router = Router();

router.get('/java/scan', authMiddleware, async (_req, res) => {
  try {
    const installs = await JavaDetector.scan();
    res.json(installs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

let cachedSysStats = { systemRamTotal: 0, systemRamUsed: 0, diskTotal: 0, diskUsed: 0, mcDirSize: 0 };
let cachedPublicIp = '';
let cachedCpuPercent = 0;
let previousCpuTimes = { idle: 0, total: 0 };

// Update live system stats (no systeminformation dependency needed)
function collectSystemStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const systemRamTotal = Math.round(totalMem / 1024 / 1024);
  const systemRamUsed = Math.round((totalMem - freeMem) / 1024 / 1024);

  // CPU: delta between two samples
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  if (previousCpuTimes.total > 0) {
    const idleDelta = idle - previousCpuTimes.idle;
    const totalDelta = total - previousCpuTimes.total;
    if (totalDelta > 0) {
      cachedCpuPercent = Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100));
    }
  }
  previousCpuTimes = { idle, total };

  let diskTotal = 0, diskUsed = 0;
  try {
    const { execSync } = require('child_process');
    const out = execSync('powershell "Get-CimInstance Win32_LogicalDisk -Filter DriveType=3 | Select-Object Size,FreeSpace | ConvertTo-Csv -NoHeader"', { encoding: 'utf-8', timeout: 5000 });
    const lines = out.trim().split('\n').filter((l: string) => l.trim());
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const totalBytes = parseInt(parts[0]);
        const freeBytes = parseInt(parts[1]);
        if (!isNaN(totalBytes) && totalBytes > 0) {
          diskTotal = Math.round(totalBytes / 1024 / 1024 / 1024);
          diskUsed = Math.round((totalBytes - freeBytes) / 1024 / 1024 / 1024);
          break;
        }
      }
    }
  } catch (e) { console.error('Disk stats error:', e); }

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
  } catch (e) { console.error('mcDirSize error:', e); }

  cachedSysStats = { systemRamTotal, systemRamUsed, diskTotal, diskUsed, mcDirSize };
}
// Seed CPU times and collect stats after a small delay so the first measurement has a real delta
const seedCpus = os.cpus();
let seedIdle = 0, seedTotal = 0;
for (const cpu of seedCpus) {
  seedIdle += cpu.times.idle;
  seedTotal += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
}
previousCpuTimes = { idle: seedIdle, total: seedTotal };
setTimeout(collectSystemStats, 100);
setInterval(collectSystemStats, 5000);

// Background IP fetcher
setInterval(async () => {
  try {
    const ip = (await httpsGet('https://api.ipify.org?format=json')).match(/"ip":"([^"]+)"/)?.[1];
    if (ip) cachedPublicIp = ip;
  } catch {}
}, 600000); // 10 minutes

router.get('/status', authMiddleware, async (_req: AuthRequest, res) => {
  const db = getDatabase();
  const onlinePlayers = db.prepare('SELECT COUNT(*) as count FROM players WHERE status = ?').get('online') as any;
  const totalPlayers = db.prepare('SELECT COUNT(*) as count FROM players').get() as any;

  const latestStats = db.prepare('SELECT * FROM system_stats ORDER BY timestamp DESC LIMIT 1').get() as any;

  const config = minecraftServer.getConfig();
  const mcMaxRam = parseInt(config.maxRam) * 1024 || 8192;

  // Read server details from servers table
  const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
  let serverVersion = 'Unknown';
  let serverSoftware = '';
  let serverNameFromDb = '';
  let serverPortFromDb = 0;
  if (activeId) {
    const srv = db.prepare('SELECT name, port, version, version_source FROM servers WHERE id = ?').get(activeId) as any;
    if (srv) {
      serverNameFromDb = srv.name || '';
      serverPortFromDb = srv.port || 0;
      serverSoftware = srv.version_source || '';
      if (srv.version) serverVersion = srv.version;
      else if (srv.version_source) serverVersion = `${srv.version_source} (select version)`;
    }
  }

  // Kickstart IP fetch if empty
  if (!cachedPublicIp) {
    httpsGet('https://api.ipify.org?format=json')
      .then(d => {
         const match = d.match(/"ip":"([^"]+)"/);
         if (match) cachedPublicIp = match[1];
      }).catch(()=>{});
  }

  const running = minecraftServer.isRunning;
  const status = {
    serverId: activeId,
    running,
    starting: minecraftServer.isStarting,
    serverName: config.name || serverNameFromDb || 'MineControl OS',
    port: config.port || serverPortFromDb || 25565,
    publicIp: cachedPublicIp,
    serverVersion,
    serverSoftware,
    installationStatus: serverVersion && serverSoftware ? 'installed' : 'not_configured',
    onlinePlayers: running ? (onlinePlayers?.count || 0) : null,
    totalPlayers: running ? (totalPlayers?.count || 0) : null,
    maxPlayers: config.maxPlayers,
    cpuUsage: running ? (latestStats?.cpu ?? cachedCpuPercent) : null,
    ramUsage: running ? (latestStats?.ram || 0) : null,
    ramTotal: mcMaxRam,
    systemRamTotal: cachedSysStats.systemRamTotal,
    systemRamUsed: cachedSysStats.systemRamUsed,
    tps: running ? (latestStats?.tps || 20) : null,
    diskTotal: cachedSysStats.diskTotal,
    diskUsed: cachedSysStats.diskUsed,
    mcDirSize: cachedSysStats.mcDirSize,
    uptime: minecraftServer.uptime,
    startedAt: minecraftServer.startedAtISO,
    osVersion: require('../../package.json').version,
  };

  res.json(status);
});

router.post('/start', authMiddleware, requirePermission('server.start'), async (_req: AuthRequest, res) => {
  try {
    if (minecraftServer.isRunning || minecraftServer.isStarting) {
      return res.status(400).json({ error: 'Server is already running or starting' });
    }
    // Await the start promise so pre-check errors (missing jar, incompatible Java)
    // propagate to the HTTP response instead of being swallowed.
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
    if (minecraftServer.isStarting) {
      return res.status(400).json({ error: 'Server is currently starting' });
    }
    minecraftServer.stop().then(() => {
      setTimeout(() => {
        minecraftServer.start().catch((err: any) => console.error('[Start Error]', err.message));
      }, 1000);
    }).catch((err: any) => console.error('[Stop Error]', err.message));
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

  // Java check — scan all installed JDKs
  try {
    const installs = await JavaDetector.scan();
    if (installs.length === 0) {
      checks.push({ name: 'Java Installation', status: 'fail', message: 'No Java installation found. Install Java 21+ from https://adoptium.net/' });
    } else {
      const sorted = [...installs].sort((a, b) => b.majorVersion - a.majorVersion);
      const best = sorted[0];
      const configuredPath = config.javaPath || 'java';
      const configured = installs.find(j => j.path === configuredPath);
      const configuredInfo = configured
        ? `Java ${configured.majorVersion}`
        : `"${configuredPath}" (not found in scan)`;

      // Check if the configured Java is sufficient for the server jar
      const jarPath = path.join(mcDir, config.jarFile || 'server.jar');
      let classVersion: number | null = null;
      if (fs.existsSync(jarPath)) {
        try {
          const { minecraftServer: ms } = await import('../services/minecraftServer');
          // Access the private method via prototype for diagnostics
          // Instead, reimplement a quick class version check
          const unzipper = require('unzipper');
          const directory = await unzipper.Open.file(jarPath);
          for (const file of directory.files) {
            if (!file.path.endsWith('.class')) continue;
            const buf = await file.buffer();
            if (buf.length >= 8) {
              const ver = buf.readUInt16BE(6);
              if (ver > (classVersion ?? 0)) classVersion = ver;
            }
          }
        } catch {}
      }

      const requiredJava = classVersion !== null ? classVersion - 44 : 21;
      const hasCompatible = sorted.some(j => j.majorVersion >= requiredJava);

      if (best.majorVersion < 21) {
        checks.push({ name: 'Java Version', status: 'fail', message: `Java ${best.majorVersion} is below minimum (21+). Install Java 21+ from https://adoptium.net/` });
      } else if (!hasCompatible && classVersion !== null) {
        checks.push({ name: 'Java Compatibility', status: 'fail', message: `Server jar requires Java ${requiredJava}+, but highest installed is Java ${best.majorVersion}. Install Java ${requiredJava}+ from https://adoptium.net/temurin/releases/?version=${requiredJava}` });
      } else if (configured && configured.majorVersion < requiredJava && hasCompatible) {
        checks.push({ name: 'Java Compatibility', status: 'warn', message: `Configured Java is ${configuredInfo} (requires ${requiredJava}+), but Java ${best.majorVersion} is available at "${best.path}". Auto-selection is active.` });
      } else {
        checks.push({ name: 'Java Version', status: 'pass', message: `Java ${best.majorVersion} found (${installs.length} installation${installs.length > 1 ? 's' : ''})` });
      }
    }
  } catch (err: any) {
    checks.push({ name: 'Java Installation', status: 'fail', message: `Java detection error: ${err.message}` });
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

  // World directory check
  const worldDir = path.join(mcDir, 'world');
  if (fs.existsSync(worldDir)) {
    const worlds = fs.readdirSync(worldDir).filter(f => f.endsWith('.mca') || f === 'level.dat');
    checks.push({ name: 'World Data', status: 'pass', message: `World directory found with ${worlds.length} region files` });
  } else {
    checks.push({ name: 'World Data', status: 'info', message: 'World directory not yet created. Will be generated on first start.' });
  }

  // server.properties check
  if (fs.existsSync(propsPath)) {
    const content = fs.readFileSync(propsPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
    checks.push({ name: 'server.properties', status: 'pass', message: `Found with ${lines} configuration entries` });
  } else {
    checks.push({ name: 'server.properties', status: 'info', message: 'server.properties not found. Will be generated on first start.' });
  }

  // Disk space check
  try {
    const { execSync } = require('child_process');
    const dfOut = execSync('wmic logicaldisk get size,freespace,caption 2>nul', { encoding: 'utf-8', timeout: 5000 });
    const driveMatch = mcDir.match(/^([A-Za-z]):/);
    if (driveMatch) {
      const driveLetter = driveMatch[1];
      const lines = dfOut.split('\n').filter((l: string) => l.trim().toUpperCase().startsWith(driveLetter.toUpperCase()));
      if (lines.length > 0) {
        const parts = lines[0].trim().split(/\s+/);
        const freeBytes = parseInt(parts[1]);
        const totalBytes = parseInt(parts[2]);
        if (freeBytes && totalBytes) {
          const freeGB = (freeBytes / 1024 / 1024 / 1024).toFixed(1);
          const totalGB = (totalBytes / 1024 / 1024 / 1024).toFixed(1);
          const pct = (freeBytes / totalBytes) * 100;
          if (pct < 10) {
            checks.push({ name: 'Disk Space', status: 'warn', message: `Low disk space: ${freeGB} GB free of ${totalGB} GB (${pct.toFixed(0)}%)` });
          } else {
            checks.push({ name: 'Disk Space', status: 'pass', message: `${freeGB} GB free of ${totalGB} GB (${pct.toFixed(0)}% free)` });
          }
        }
      }
    }
  } catch {}

  // Java memory check
  const maxRam = parseInt(config.maxRam) || 8;
  const totalMemGB = Math.round(os.totalmem() / 1024 / 1024 / 1024);
  if (maxRam >= totalMemGB) {
    checks.push({ name: 'Java Memory', status: 'warn', message: `Allocated ${maxRam}G but system only has ${totalMemGB}G total RAM. Reduce max RAM.` });
  } else if (maxRam < 1) {
    checks.push({ name: 'Java Memory', status: 'warn', message: `Allocated ${maxRam}G is very low for a server` });
  } else {
    checks.push({ name: 'Java Memory', status: 'pass', message: `${maxRam}G allocated to Java, ${totalMemGB}G total system RAM` });
  }

  // Folder permissions check
  try {
    const testFile = path.join(mcDir, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    checks.push({ name: 'Folder Permissions', status: 'pass', message: 'Write permissions OK' });
  } catch {
    checks.push({ name: 'Folder Permissions', status: 'fail', message: `Cannot write to ${mcDir}. Check folder permissions.` });
  }

  // Download cache check
  const cacheDir = path.join(mcDir, 'download.cache');
  if (fs.existsSync(cacheDir)) {
    try {
      const cacheFiles = fs.readdirSync(cacheDir);
      checks.push({ name: 'Download Cache', status: 'pass', message: `${cacheFiles.length} cached files` });
    } catch {
      checks.push({ name: 'Download Cache', status: 'info', message: 'Cache directory exists but is not accessible' });
    }
  } else {
    checks.push({ name: 'Download Cache', status: 'info', message: 'No download cache directory' });
  }

  // Minecraft Version check
  if (config.jarFile) {
    const versionMatch = config.jarFile.match(/(?:paper|vanilla|fabric|purpur|forge)-(.+)\.jar$/);
    if (versionMatch) {
      checks.push({ name: 'Minecraft Version', status: 'pass', message: `Version ${versionMatch[1]} detected from jar file` });
    } else {
      checks.push({ name: 'Minecraft Version', status: 'info', message: `Using jar: ${config.jarFile}` });
    }
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
    const installs = await JavaDetector.scan();
    if (installs.length === 0) {
      checks.push({ name: 'Java', status: 'fail', message: 'No Java installation found' });
    } else {
      const sorted = [...installs].sort((a, b) => b.majorVersion - a.majorVersion);
      checks.push({ name: 'Java', status: 'pass', message: `Java ${sorted[0].majorVersion} installed (${installs.length} runtime${installs.length > 1 ? 's' : ''})` });
    }
  } catch {
    checks.push({ name: 'Java', status: 'fail', message: 'Java detection failed' });
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

  // Fetch Fabric versions
  let fabricVersions: any[] = [];
  const cachedFabric = cacheGet<any[]>('fabricVersions');
  if (cachedFabric) {
    fabricVersions = cachedFabric;
  } else {
    try {
      const data = await httpsGet(`${FABRIC_API}/versions/game`);
      fabricVersions = JSON.parse(data) || [];
      cacheSet('fabricVersions', fabricVersions);
    } catch {}
  }

  // Fetch Forge versions
  let forgeVersions: string[] = [];
  const cachedForge = cacheGet<string[]>('forgeVersions');
  if (cachedForge) {
    forgeVersions = cachedForge;
  } else {
    try {
      const data = await httpsGet(FORGE_API);
      const parsed = JSON.parse(data);
      const promos = parsed.promos || {};
      const uniqueVersions = new Set<string>();
      for (const key of Object.keys(promos)) {
        if (key.endsWith('-latest') || key.endsWith('-recommended')) {
          uniqueVersions.add(key.split('-')[0]);
        }
      }
      forgeVersions = Array.from(uniqueVersions).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      cacheSet('forgeVersions', forgeVersions);
    } catch {}
  }

  // Fetch Purpur versions
  let purpurVersions: string[] = [];
  const cachedPurpur = cacheGet<string[]>('purpurVersions');
  if (cachedPurpur) {
    purpurVersions = cachedPurpur;
  } else {
    try {
      const data = await httpsGet(PURPUR_API);
      const parsed = JSON.parse(data);
      purpurVersions = parsed.versions || [];
      purpurVersions = purpurVersions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      cacheSet('purpurVersions', purpurVersions);
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

  // Add Purpur versions
  for (const v of purpurVersions) {
    const jarPrefix = `purpur-${v}`;
    combined.push({
      version: v,
      type: 'release',
      source: 'Purpur',
      downloaded: downloadedJars.some(d => d === jarPrefix),
      current: currentVersion === v && currentSource === 'Purpur',
    });
  }

  // Add Fabric versions (only Minecraft game versions, skip loader-only entries)
  for (const v of fabricVersions) {
    const ver = v.version;
    if (!/^\d+\.\d+/.test(ver)) continue;
    const jarPrefix = `fabric-${ver}`;
    combined.push({
      version: ver,
      type: v.stable ? 'release' : 'snapshot',
      source: 'Fabric',
      downloaded: downloadedJars.some(d => d === jarPrefix),
      current: currentVersion === ver && currentSource === 'Fabric',
    });
  }

  // Add Forge versions
  for (const ver of forgeVersions) {
    const jarPrefix = `forge-${ver}`;
    combined.push({
      version: ver,
      type: 'release',
      source: 'Forge',
      downloaded: downloadedJars.some(d => d === jarPrefix),
      current: currentVersion === ver && currentSource === 'Forge',
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
    const sourceLower = (source || '').toLowerCase();
    const usePaper = sourceLower === 'paper' || sourceLower === 'papermc' || (!source && await isPaperAvailable(version));
    const useFabric = sourceLower === 'fabric';
    const usePurpur = sourceLower === 'purpur';
    const useForge = sourceLower === 'forge';
    const useVanilla = sourceLower === 'vanilla' || sourceLower === 'mojang';
    let jarPrefix = 'vanilla';
    if (usePaper) jarPrefix = 'paper';
    else if (useFabric) jarPrefix = 'fabric';
    else if (usePurpur) jarPrefix = 'purpur';
    else if (useForge) jarPrefix = 'forge';
    const jarFile = `${jarPrefix}-${version}.jar`;
    const jarPath = path.join(mcDir, jarFile);

    if (!fs.existsSync(jarPath)) {
      if (useFabric) {
        await downloadFabricVersion(version, jarPath);
      } else if (usePurpur) {
        await downloadPurpurVersion(version, jarPath);
      } else if (useForge) {
        await downloadForgeVersion(version, jarPath);
      } else if (usePaper) {
        await downloadPaperVersion(version, jarPath);
      } else {
        await downloadVanillaVersion(version, jarPath);
      }
    }

    const oldJarFile = minecraftServer.getConfig().jarFile;
    const oldJarPath = oldJarFile ? path.join(mcDir, oldJarFile) : null;

    minecraftServer.updateConfig('jarFile', jarFile);
    
    // Delete old jar if it exists and is different from the new one
    if (oldJarPath && oldJarFile !== jarFile && fs.existsSync(oldJarPath)) {
      try {
        fs.unlinkSync(oldJarPath);
      } catch (e) {}
    }

    // Also save version info to servers table
    const db = getDatabase();
    const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
    if (activeId) {
      let sourceName = 'Mojang';
      if (usePaper) sourceName = 'PaperMC';
      else if (useFabric) sourceName = 'Fabric';
      else if (usePurpur) sourceName = 'Purpur';
      else if (useForge) sourceName = 'Forge';
      db.prepare("UPDATE servers SET version = ?, version_source = ?, updated_at = datetime('now') WHERE id = ?").run(version, sourceName, activeId);
    }
    let displaySource = 'Vanilla';
    if (usePaper) displaySource = 'Paper';
    else if (useFabric) displaySource = 'Fabric';
    else if (usePurpur) displaySource = 'Purpur';
    else if (useForge) displaySource = 'Forge';
    res.json({ success: true, message: `Switched to ${displaySource} ${version}. Start the server to apply.` });
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
