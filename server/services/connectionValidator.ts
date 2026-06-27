import net from 'net';
import { execSync } from 'child_process';
import { mcPing } from './mcPing';

export interface ValidationResult {
  process: { status: 'pass' | 'fail'; message: string };
  tcpPort: { status: 'pass' | 'fail'; message: string };
  socketAccepting: { status: 'pass' | 'fail'; message: string };
  mcPing: { status: 'pass' | 'fail'; message: string; data?: any };
  lanAccessible: { status: 'pass' | 'fail' | 'skip'; message: string };
  firewall: { status: 'pass' | 'fail' | 'skip'; message: string };
}

export async function validateServer(port: number): Promise<ValidationResult> {
  const result: ValidationResult = {
    process: { status: 'fail', message: 'Not checked' },
    tcpPort: { status: 'fail', message: 'Not checked' },
    socketAccepting: { status: 'fail', message: 'Not checked' },
    mcPing: { status: 'fail', message: 'Not checked' },
    lanAccessible: { status: 'skip', message: 'Not checked' },
    firewall: { status: 'skip', message: 'Not checked' },
  };

  // 1. Process check
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq java*" /FO CSV /NH', { encoding: 'utf-8', timeout: 5000 });
    const hasJava = out.trim().length > 0 && out.toLowerCase().includes('java');
    result.process = {
      status: hasJava ? 'pass' : 'fail',
      message: hasJava ? 'Java process running' : 'No Java process found',
    };
  } catch {
    result.process = { status: 'fail', message: 'Could not check processes' };
  }

  // 2. TCP port check
  try {
    await new Promise<void>((resolve, reject) => {
      const sock = new net.Socket();
      sock.setTimeout(3000);
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => { sock.destroy(); reject(); });
      sock.on('timeout', () => { sock.destroy(); reject(); });
      sock.connect(port, '127.0.0.1');
    });
    result.tcpPort = { status: 'pass', message: `Port ${port} is open` };
  } catch {
    result.tcpPort = { status: 'fail', message: `Port ${port} is not reachable` };
  }

  // 3. Socket accepting (re-test to confirm)
  try {
    await new Promise<void>((resolve, reject) => {
      const sock = new net.Socket();
      sock.setTimeout(2000);
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => { sock.destroy(); reject(); });
      sock.on('timeout', () => { sock.destroy(); reject(); });
      sock.connect(port, '127.0.0.1');
    });
    result.socketAccepting = { status: 'pass', message: 'Socket accepting connections' };
  } catch {
    result.socketAccepting = { status: 'fail', message: 'Socket not accepting connections' };
  }

  // 4. Minecraft ping
  const pingResult = await mcPing('127.0.0.1', port, 4000);
  if (pingResult.online) {
    result.mcPing = {
      status: 'pass',
      message: `Server responded (${pingResult.latency}ms)`,
      data: {
        latency: pingResult.latency,
        version: pingResult.version,
        players: pingResult.players,
        motd: pingResult.description,
      },
    };
  } else {
    result.mcPing = {
      status: 'fail',
      message: pingResult.error || 'No Minecraft response',
    };
  }

  // 5. LAN accessibility
  try {
    const ifaces = require('os').networkInterfaces();
    for (const addrs of Object.values(ifaces) as any) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('127.')) {
          try {
            await new Promise<void>((resolve, reject) => {
              const sock = new net.Socket();
              sock.setTimeout(2000);
              sock.on('connect', () => { sock.destroy(); resolve(); });
              sock.on('error', () => { sock.destroy(); reject(); });
              sock.on('timeout', () => { sock.destroy(); reject(); });
              sock.connect(port, addr.address);
            });
            result.lanAccessible = { status: 'pass', message: `Reachable via ${addr.address}:${port}` };
          } catch {
            result.lanAccessible = { status: 'fail', message: `Not reachable via LAN (${addr.address})` };
          }
          break;
        }
      }
      if (result.lanAccessible.status !== 'skip') break;
    }
  } catch {
    result.lanAccessible = { status: 'skip', message: 'Could not check LAN' };
  }

  // 6. Firewall check
  try {
    const fwOut = execSync(`netsh advfirewall firewall show rule name="MineControl OS Minecraft" dir=in verbose`, { encoding: 'utf-8', timeout: 5000 });
    result.firewall = {
      status: fwOut.includes('Enabled:               Yes') ? 'pass' : 'fail',
      message: fwOut.includes('Enabled:               Yes') ? 'Firewall rule active' : 'Firewall rule not enabled',
    };
  } catch {
    result.firewall = { status: 'fail', message: 'No firewall rule found' };
  }

  return result;
}

export interface ConnectionWizardData {
  localAddress: string;
  lanAddress: string;
  lanReachable: boolean;
  publicIp: string;
  port: number;
  onlineMode: boolean;
  serverRunning: boolean;
  serverVersion: string;
  playitAddress: string;
  playitEnabled: boolean;
  playitActive: boolean;
  playitLatency: number | null;
  firewallActive: boolean;
  firewallRuleExists: boolean;
  recommendedMethod: 'localhost' | 'lan' | 'playit' | 'public';
  allMethods: {
    localhost: { available: boolean; address: string; status: 'ready' | 'blocked' | 'offline' };
    lan: { available: boolean; address: string; status: 'reachable' | 'blocked' | 'offline' | 'unknown' };
    playit: { available: boolean; address: string; status: 'online' | 'offline' | 'not_configured' };
    public: { available: boolean; address: string; status: 'reachable' | 'blocked' | 'offline' | 'unknown' };
  };
  validation: ValidationResult | null;
}

export async function getConnectionWizardData(): Promise<ConnectionWizardData> {
  const os = require('os');
  const { minecraftServer } = require('../services/minecraftServer');
  const { getDatabase } = require('../database');
  const { resolveMinecraftDir } = require('../paths');
  const dns = require('dns');
  const https = require('https');
  const fs = require('fs');
  const path = require('path');

  const config = minecraftServer.getConfig();
  const port = config.port || 25565;
  const mcDir = resolveMinecraftDir();
  const propsPath = path.join(mcDir, 'server.properties');
  const db = getDatabase();
  const playitAddress = (db.prepare("SELECT value FROM server_config WHERE key = 'playitAddress'").get() as any)?.value || '';

  // Read onlineMode
  let onlineMode = true;
  try {
    const props = fs.readFileSync(propsPath, 'utf-8');
    const match = props.match(/^online-mode=(.*)$/m);
    if (match) onlineMode = match[1].trim() !== 'false';
  } catch {}

  // Public IP
  let publicIp = '';
  try {
    publicIp = await new Promise((resolve) => {
      https.get('https://api.ipify.org?format=json', (resp: any) => {
        let data = '';
        resp.on('data', (chunk: string) => data += chunk);
        resp.on('end', () => { try { resolve(JSON.parse(data).ip); } catch { resolve(''); } });
      }).on('error', () => resolve(''));
    });
  } catch {}

  // LAN address
  const ifaces = os.networkInterfaces();
  let lanAddress = '';
  for (const addrs of Object.values(ifaces) as any) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('127.')) {
        lanAddress = `${addr.address}:${port}`;
        break;
      }
    }
    if (lanAddress) break;
  }

  // Firewall check
  let firewallActive = false;
  let firewallRuleExists = false;
  try {
    const fwOut = execSync(`netsh advfirewall firewall show rule name="MineControl OS Minecraft" dir=in verbose`, { encoding: 'utf-8', timeout: 5000 });
    firewallRuleExists = true;
    firewallActive = fwOut.includes('Enabled:               Yes');
  } catch {}

  // Playit tunnel status
  let playitActive = false;
  let playitLatency: number | null = null;
  if (playitAddress && playitAddress.includes('.')) {
    try {
      const lookup = await new Promise<boolean>((resolve) => {
        dns.resolve(playitAddress.replace(/:.*$/, ''), (err: any) => resolve(!err));
      });
      playitActive = lookup;
      if (lookup && minecraftServer.isRunning) {
        const ping = await mcPing(playitAddress.replace(/:.*$/, ''), parseInt(playitAddress.split(':')[1] || '25565'), 3000);
        if (ping.online) playitLatency = ping.latency || null;
      }
    } catch {}
  }

  const serverRunning = minecraftServer.isRunning;

  // LAN reachability
  let lanReachable = false;
  if (lanAddress && serverRunning) {
    const lanHost = lanAddress.split(':')[0];
    try {
      await new Promise<void>((resolve, reject) => {
        const sock = new net.Socket();
        sock.setTimeout(2000);
        sock.on('connect', () => { sock.destroy(); resolve(); });
        sock.on('error', () => { sock.destroy(); reject(); });
        sock.on('timeout', () => { sock.destroy(); reject(); });
        sock.connect(port, lanHost);
      });
      lanReachable = true;
    } catch {}
  }

  // Determine recommended method
  let recommendedMethod: 'localhost' | 'lan' | 'playit' | 'public' = 'localhost';
  if (!serverRunning) {
    recommendedMethod = 'localhost';
  } else if (playitActive) {
    recommendedMethod = 'playit';
  } else if (lanReachable) {
    recommendedMethod = 'lan';
  }

  // Run validation if server is running
  let validation: ValidationResult | null = null;
  if (serverRunning) {
    validation = await validateServer(port);
  }

  return {
    localAddress: `localhost:${port}`,
    lanAddress,
    lanReachable,
    publicIp,
    port,
    onlineMode,
    serverRunning,
    serverVersion: config.jarFile?.replace(/\.jar$/, '') || 'Unknown',
    playitAddress,
    playitEnabled: !!playitAddress,
    playitActive,
    playitLatency,
    firewallActive,
    firewallRuleExists,
    recommendedMethod,
    allMethods: {
      localhost: {
        available: true,
        address: `localhost:${port}`,
        status: serverRunning ? 'ready' : 'offline',
      },
      lan: {
        available: !!lanAddress,
        address: lanAddress || `${lanAddress || 'unknown'}:${port}`,
        status: !serverRunning ? 'offline' : lanReachable ? 'reachable' : 'blocked',
      },
      playit: {
        available: !!playitAddress,
        address: playitAddress || '',
        status: !playitAddress ? 'not_configured' : playitActive ? 'online' : 'offline',
      },
      public: {
        available: !!publicIp,
        address: publicIp ? `${publicIp}:${port}` : '',
        status: !serverRunning ? 'offline' : 'unknown',
      },
    },
    validation,
  };
}
