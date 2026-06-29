import net from 'net';
import dns from 'dns';
import https from 'https';
import os from 'os';
import { execSync } from 'child_process';
import { getDatabase } from '../database';
import { minecraftServer } from './minecraftServer';
import { resolveMinecraftDir } from '../paths';
import { mcPing } from './mcPing';
import { firewallManager } from './firewallManager';
import { emitToAll } from '../socketManager';

export interface ConnectionStatus {
  serverId: string | null;
  serverRunning: boolean;
  serverVersion: string;
  serverSoftware: string;
  port: number;
  onlineMode: boolean;
  localAddress: string;
  localPingOk: boolean;
  localPingLatency: number | null;
  lanAddresses: { address: string; reachable: boolean; latency: number | null }[];
  publicIp: string;
  playitAddress: string;
  playitActive: boolean;
  playitLatency: number | null;
  firewallRuleExists: boolean;
  firewallEnabled: boolean;
  firewallAdmin: boolean;
  javaProcessRunning: boolean;
  tcpPortOpen: boolean;
  recommendedMethod: 'localhost' | 'lan' | 'playit' | 'public';
  allMethods: {
    localhost: { available: boolean; address: string; status: 'ready' | 'offline'; ping?: number | null };
    lan: { available: boolean; addresses: string[]; status: 'reachable' | 'blocked' | 'offline' | 'unknown' };
    playit: { available: boolean; address: string; status: 'online' | 'offline' | 'not_configured'; latency?: number | null };
    public: { available: boolean; address: string; status: 'reachable' | 'blocked' | 'offline' | 'unknown' };
  };
  lastPingResult?: any;
}

function getActiveServerId(): string | null {
  try {
    const db = getDatabase();
    const row = db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any;
    return row?.value || null;
  } catch { return null; }
}

async function fetchPublicIp(): Promise<string> {
  try {
    return await new Promise((resolve) => {
      const req = https.get('https://api.ipify.org?format=json', { timeout: 5000 }, (resp) => {
        let data = '';
        resp.on('data', (chunk: string) => data += chunk);
        resp.on('end', () => { try { resolve(JSON.parse(data).ip); } catch { resolve(''); } });
      });
      req.on('error', () => resolve(''));
      req.setTimeout(5000, () => { req.destroy(); resolve(''); });
    });
  } catch { return ''; }
}

function getLanAddresses(): string[] {
  const addrs: string[] = [];
  try {
    const ifaces = os.networkInterfaces();
    for (const entries of Object.values(ifaces)) {
      if (!entries) continue;
      for (const entry of entries) {
        if (entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('127.')) {
          addrs.push(entry.address);
        }
      }
    }
  } catch {}
  return addrs;
}

async function checkPort(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      const sock = new net.Socket();
      sock.setTimeout(timeoutMs);
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => { sock.destroy(); reject(); });
      sock.on('timeout', () => { sock.destroy(); reject(); });
      sock.connect(port, host);
    });
    return true;
  } catch { return false; }
}

function isJavaRunning(): boolean {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq java*" /FO CSV /NH', { encoding: 'utf-8', timeout: 3000 });
    return out.trim().length > 0 && out.toLowerCase().includes('java');
  } catch { return false; }
}

export class ConnectionManager {
  async getFullStatus(): Promise<ConnectionStatus> {
    const serverId = getActiveServerId();
    const config = minecraftServer.getConfig();
    const port = config?.port || 25565;
    const running = minecraftServer.isRunning;
    const mcDir = resolveMinecraftDir();

    // Get version info from DB directly
    let serverVersion = '';
    let serverSoftware = '';
    try {
      const db2 = getDatabase();
      const serverRow = db2.prepare('SELECT version, version_source FROM servers WHERE id = ?').get(serverId) as any;
      if (serverRow) {
        serverVersion = serverRow.version || '';
        serverSoftware = serverRow.version_source || '';
      }
    } catch {}

    let onlineMode = true;
    try {
      const fs = require('fs');
      const propsPath = require('path').join(mcDir, 'server.properties');
      if (fs.existsSync(propsPath)) {
        const content = fs.readFileSync(propsPath, 'utf-8');
        const match = content.match(/^online-mode=(.*)$/m);
        if (match) onlineMode = match[1].trim() !== 'false';
      }
    } catch {}

    const db = getDatabase();
    let playitAddress = '';
    let playitTunnelActive = false;
    let playitLatency: number | null = null;
    try {
      const row = db.prepare("SELECT value FROM server_config WHERE key = 'playitAddress'").get() as any;
      playitAddress = row?.value || '';
      if (playitAddress && playitAddress.includes('.')) {
        const host = playitAddress.replace(/:.*$/, '');
        playitTunnelActive = await new Promise<boolean>(resolve => {
          dns.resolve(host, (err) => resolve(!err));
        });
        if (playitTunnelActive && running) {
          const pingPort = parseInt(playitAddress.split(':')[1] || String(port));
          const ping = await mcPing(host, pingPort, 3000);
          if (ping.online) playitLatency = ping.latency || null;
        }
      }
    } catch {}

    const firewallStatus = firewallManager.checkRule();
    const lanIps = getLanAddresses();

    // Test interfaces
    let localPingOk = false;
    let localPingLatency: number | null = null;
    let tcpPortOpen = false;
    const lanResults: { address: string; reachable: boolean; latency: number | null }[] = [];

    if (running) {
      tcpPortOpen = await checkPort('127.0.0.1', port);
      const localPing = await mcPing('127.0.0.1', port, 3000);
      localPingOk = localPing.online;
      localPingLatency = localPing.latency || null;

      for (const ip of lanIps) {
        const reachable = await checkPort(ip, port);
        let latency: number | null = null;
        if (reachable) {
          const ping = await mcPing(ip, port, 3000);
          if (ping.online) latency = ping.latency || null;
        }
        lanResults.push({ address: `${ip}:${port}`, reachable, latency });
      }
    }

    const publicIp = await fetchPublicIp();

    // Determine recommended method
    let recommended: ConnectionStatus['recommendedMethod'] = 'localhost';
    if (running && tcpPortOpen) {
      if (playitTunnelActive) recommended = 'playit';
      else if (lanResults.some(r => r.reachable)) recommended = 'lan';
    }

    // Save diagnostics to DB
    try {
      db.prepare(`
        INSERT INTO connection_diagnostics 
        (server_id, local_address, lan_address, public_ip, playit_address, port, server_running,
         firewall_active, firewall_rule_exists, lan_reachable, playit_active, playit_latency,
         local_ping_ok, local_ping_latency, tcp_port_open, java_process_running, recommended_method, diagnostics_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        serverId, `localhost:${port}`, lanIps.join(',') || '', publicIp, playitAddress, port, running ? 1 : 0,
        firewallStatus.enabled ? 1 : 0, firewallStatus.exists ? 1 : 0, lanResults.some(r => r.reachable) ? 1 : 0,
        playitTunnelActive ? 1 : 0, playitLatency,
        localPingOk ? 1 : 0, localPingLatency, tcpPortOpen ? 1 : 0, isJavaRunning() ? 1 : 0,
        recommended, JSON.stringify({ firewallStatus, lanResults })
      );

      // Update connection_config
      const existing = db.prepare('SELECT id FROM connection_config WHERE server_id = ?').get(serverId);
      if (existing) {
        db.prepare('UPDATE connection_config SET last_diagnostics_at = ? WHERE server_id = ?').run(new Date().toISOString(), serverId);
      } else {
        db.prepare('INSERT INTO connection_config (server_id, last_diagnostics_at) VALUES (?, ?)').run(serverId, new Date().toISOString());
      }
    } catch {}

    const result: ConnectionStatus = {
      serverId,
      serverRunning: running,
      serverVersion,
      serverSoftware,
      port,
      onlineMode,
      localAddress: `localhost:${port}`,
      localPingOk,
      localPingLatency,
      lanAddresses: lanResults,
      publicIp,
      playitAddress,
      playitActive: playitTunnelActive,
      playitLatency,
      firewallRuleExists: firewallStatus.exists,
      firewallEnabled: firewallStatus.enabled,
      firewallAdmin: firewallManager.isAdmin(),
      javaProcessRunning: isJavaRunning(),
      tcpPortOpen,
      recommendedMethod: recommended,
      allMethods: {
        localhost: { available: true, address: `localhost:${port}`, status: running && tcpPortOpen ? 'ready' : 'offline', ping: localPingLatency },
        lan: { available: lanIps.length > 0, addresses: lanIps.map(ip => `${ip}:${port}`), status: !running ? 'offline' : lanResults.some(r => r.reachable) ? 'reachable' : 'blocked' },
        playit: { available: !!playitAddress, address: playitAddress, status: !playitAddress ? 'not_configured' : playitTunnelActive ? 'online' : 'offline', latency: playitLatency },
        public: { available: !!publicIp, address: publicIp ? `${publicIp}:${port}` : '', status: !running ? 'offline' : 'unknown' },
      },
    };

    return result;
  }

  async testJoin(address?: string): Promise<any> {
    const config = minecraftServer.getConfig();
    const port = config?.port || 25565;
    const target = address || `localhost:${port}`;
    const [host, p] = target.split(':');
    const targetPort = parseInt(p || String(port));

    const ping = await mcPing(host, targetPort, 5000);
    return {
      ...ping,
      address: target,
      testedAt: new Date().toISOString(),
    };
  }

  async getDiagnosticsHistory(limit = 20): Promise<any[]> {
    const serverId = getActiveServerId();
    if (!serverId) return [];
    const db = getDatabase();
    return db.prepare('SELECT * FROM connection_diagnostics WHERE server_id = ? ORDER BY timestamp DESC LIMIT ?').all(serverId, limit);
  }

  getPreferredMode(): string {
    const serverId = getActiveServerId();
    if (!serverId) return 'auto';
    const db = getDatabase();
    const row = db.prepare('SELECT preferred_mode FROM connection_config WHERE server_id = ?').get(serverId) as any;
    return row?.preferred_mode || 'auto';
  }

  setPreferredMode(mode: string): void {
    const serverId = getActiveServerId();
    if (!serverId) return;
    const db = getDatabase();
    const existing = db.prepare('SELECT id FROM connection_config WHERE server_id = ?').get(serverId);
    if (existing) {
      db.prepare('UPDATE connection_config SET preferred_mode = ? WHERE server_id = ?').run(mode, serverId);
    } else {
      db.prepare('INSERT INTO connection_config (server_id, preferred_mode) VALUES (?, ?)').run(serverId, mode);
    }
  }

  async emitConnectionUpdate(): Promise<void> {
    try {
      const status = await this.getFullStatus();
      emitToAll('connection:update', status);
    } catch {}
  }
}

export const connectionManager = new ConnectionManager();
