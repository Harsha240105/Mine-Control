import net from 'net';
import dns from 'dns';
import https from 'https';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { spawn, execSync, ChildProcess } from 'child_process';
import { getDatabase } from '../database';
import { minecraftServer } from './minecraftServer';
import { resolveMinecraftDir, resolvePath } from '../paths';
import { mcPing, mcPingWithProxy, getProxyProtocolHint } from './mcPing';
import { firewallManager } from './firewallManager';
import { emitToAll } from '../socketManager';
import { getActiveServerId } from '../db/repository/serverConfigRepository';

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
  ngrokAddress: string;
  ngrokActive: boolean;
  firewallRuleExists: boolean;
  firewallEnabled: boolean;
  firewallAdmin: boolean;
  javaProcessRunning: boolean;
  tcpPortOpen: boolean;
  recommendedMethod: 'localhost' | 'lan' | 'playit' | 'ngrok' | 'public';
  allMethods: {
    localhost: { available: boolean; address: string; status: 'ready' | 'offline'; ping?: number | null };
    lan: { available: boolean; addresses: string[]; status: 'reachable' | 'blocked' | 'offline' | 'unknown' };
    playit: { available: boolean; address: string; status: 'online' | 'offline' | 'not_configured'; latency?: number | null };
    ngrok: { available: boolean; address: string; status: 'online' | 'offline' | 'not_configured'; latency?: number | null };
    public: { available: boolean; address: string; status: 'reachable' | 'blocked' | 'offline' | 'unknown' };
  };
  lastPingResult?: any;
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
      const propsPath = path.join(mcDir, 'server.properties');
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
    let playitError: string | null = null;
    try {
      const playitKey = serverId ? `playitAddress_${serverId}` : 'playitAddress';
      const row = db.prepare("SELECT value FROM server_config WHERE key = ?").get(playitKey) as any;
      playitAddress = row?.value || '';
      if (playitAddress && playitAddress.includes('.')) {
        const host = playitAddress.replace(/:.*$/, '');
        playitTunnelActive = await new Promise<boolean>(resolve => {
          dns.resolve(host, (err) => resolve(!err));
        });
        if (!playitTunnelActive) {
          playitError = `Playit.gg domain ${host} does not resolve. The tunnel agent may not be running.`;
        } else if (running) {
          const pingPort = parseInt(playitAddress.split(':')[1] || String(port));
          const ping = await mcPing(host, pingPort, 3000);
          if (ping.online) {
            playitLatency = ping.latency || null;
          } else {
            try {
              const proxyPing = await mcPingWithProxy('127.0.0.1', port, 3000);
              if (proxyPing.online) {
                const sid = getActiveServerId();
                const versionSource = sid ? ((db.prepare("SELECT version_source FROM servers WHERE id = ?").get(sid) as any)?.version_source) || 'Unknown' : 'Unknown';
                const hint = getProxyProtocolHint(versionSource);
                playitError = `Playit tunnel resolves but Minecraft not responding through it. Proxy-protocol detected on tunnel. ${hint}`;
              } else {
                const sid = getActiveServerId();
                const versionSource = sid ? ((db.prepare("SELECT version_source FROM servers WHERE id = ?").get(sid) as any)?.version_source) || 'Unknown' : 'Unknown';
                const hint = getProxyProtocolHint(versionSource);
                playitError = `Playit tunnel resolves but Minecraft not responding through it. The tunnel likely has proxy-protocol enabled, which ${versionSource} does not support. ${hint}`;
              }
            } catch {
              playitError = `Playit tunnel resolves but Minecraft not responding through it. Check tunnel points to localhost:${port}.`;
            }
          }
        }
      } else if (playitAddress) {
        playitError = `Playit.gg address "${playitAddress}" appears invalid.`;
      }
    } catch {}

    let ngrokAddress = '';
    let ngrokActive = false;
    try {
      const row = db.prepare("SELECT value FROM server_config WHERE key = 'ngrokAddress'").get() as any;
      ngrokAddress = row?.value || '';
      if (ngrokAddress) {
        ngrokActive = this.isNgrokRunning();
      }
    } catch {}

    const firewallStatus = firewallManager.checkRule(serverId || undefined);
    const lanIps = getLanAddresses();

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

    let recommended: ConnectionStatus['recommendedMethod'] = 'localhost';
    if (running && tcpPortOpen) {
      if (ngrokActive) recommended = 'ngrok';
      else if (playitTunnelActive) recommended = 'playit';
      else if (lanResults.some(r => r.reachable)) recommended = 'lan';
    }

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
        recommended, JSON.stringify({ firewallStatus, lanResults, ngrokAddress, ngrokActive })
      );

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
      ngrokAddress,
      ngrokActive,
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
        ngrok: { available: !!ngrokAddress, address: ngrokAddress, status: !ngrokAddress ? 'not_configured' : ngrokActive ? 'online' : 'offline' },
        public: { available: !!publicIp, address: publicIp ? `${publicIp}:${port}` : '', status: !running ? 'offline' : 'unknown' },
      },
      lastPingResult: localPingOk ? { online: true, latency: localPingLatency } : { online: false, error: playitError || 'Server not responding' },
    };

    return result;
  }

  async testJoin(address?: string): Promise<any> {
    const config = minecraftServer.getConfig();
    const port = config?.port || 25565;
    const target = address || `127.0.0.1:${port}`;
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

  // ── Playit Agent Lifecycle ──

  private playitProcess: ChildProcess | null = null;

  isPlayitRunning(): boolean {
    if (this.playitProcess && !this.playitProcess.killed) return true;
    try {
      const out = execSync('tasklist /FI "IMAGENAME eq playit*" /FO CSV /NH', { encoding: 'utf-8', timeout: 3000 });
      return out.trim().length > 0 && out.includes('playit');
    } catch { return false; }
  }

  async downloadPlayitAgent(): Promise<string> {
    const agentDir = resolvePath('playit');
    const agentPath = path.join(agentDir, os.platform() === 'win32' ? 'playit.exe' : 'playit');
    if (fs.existsSync(agentPath)) return agentPath;
    const arch = os.arch() === 'x64' ? 'amd64' : os.arch();
    const platform = os.platform() === 'win32' ? 'windows' : os.platform();
    const url = `https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-${platform}-${arch}.exe`;
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(agentPath + '.download');
      https.get(url, { timeout: 30000 }, (resp) => {
        if (resp.statusCode !== 200) {
          file.close(); fs.unlinkSync(agentPath + '.download');
          return reject(new Error(`HTTP ${resp.statusCode} downloading playit agent`));
        }
        resp.pipe(file);
        file.on('finish', () => {
          file.close();
          fs.renameSync(agentPath + '.download', agentPath);
          if (os.platform() !== 'win32') fs.chmodSync(agentPath, 0o755);
          resolve(agentPath);
        });
      }).on('error', (err) => {
        file.close();
        try { fs.unlinkSync(agentPath + '.download'); } catch {}
        reject(err);
      });
    });
  }

  async startPlayitAgent(token: string): Promise<{ success: boolean; message: string }> {
    if (this.isPlayitRunning()) {
      return { success: true, message: 'Playit agent already running.' };
    }
    const agentDir = resolvePath('playit');
    const agentPath = path.join(agentDir, os.platform() === 'win32' ? 'playit.exe' : 'playit');
    if (!fs.existsSync(agentPath)) {
      try {
        await this.downloadPlayitAgent();
      } catch (err: any) {
        return { success: false, message: `Failed to download playit agent: ${err.message}. Download manually from https://playit.gg/download` };
      }
    }
    const db = getDatabase();
    db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('playitAuthToken', ?)").run(token);
    const args = os.platform() === 'win32' ? ['--secret', token] : ['--secret', token];
    try {
      this.playitProcess = spawn(agentPath, args, {
        cwd: agentDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });
      this.playitProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        const addrMatch = text.match(/(?:https?:\/\/)?([a-zA-Z0-9-]+\.playit\.(?:gg|cloud)(?::\d+)?)/);
        if (addrMatch) {
          const playitKey = `playitAddress_${getActiveServerId() || 'global'}`;
          const pathKey = `playitAgentPath_${getActiveServerId() || 'global'}`;
          db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)").run(playitKey, addrMatch[1]);
          db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)").run(pathKey, agentPath);
        }
      });
      this.playitProcess.on('exit', (code) => {
        this.playitProcess = null;
      });
      this.playitProcess.on('error', (err) => {
        this.playitProcess = null;
      });
      setTimeout(() => this.emitConnectionUpdate(), 3000);
      return { success: true, message: 'Playit agent started.' };
    } catch (err: any) {
      this.playitProcess = null;
      return { success: false, message: `Failed to start playit agent: ${err.message}` };
    }
  }

  stopPlayitAgent(): { success: boolean; message: string } {
    if (this.playitProcess && !this.playitProcess.killed) {
      this.playitProcess.kill('SIGTERM');
      this.playitProcess = null;
      setTimeout(() => this.emitConnectionUpdate(), 1000);
      return { success: true, message: 'Playit agent stopped.' };
    }
    try {
      execSync('taskkill /IM "playit*" /F', { timeout: 3000 });
      return { success: true, message: 'Playit agent stopped.' };
    } catch {
      return { success: true, message: 'Playit agent was not running.' };
    }
  }

  getPlayitStatus(): { configured: boolean; running: boolean; address: string; agentPath: string } {
    const db = getDatabase();
    const serverId = getActiveServerId();
    const playitKey = serverId ? `playitAddress_${serverId}` : 'playitAddress';
    const pathKey = serverId ? `playitAgentPath_${serverId}` : 'playitAgentPath';
    const address = (db.prepare("SELECT value FROM server_config WHERE key = ?").get(playitKey) as any)?.value || '';
    const agentPath = (db.prepare("SELECT value FROM server_config WHERE key = ?").get(pathKey) as any)?.value || '';
    return { configured: !!address, running: this.isPlayitRunning(), address, agentPath };
  }

  // ── Ngrok Tunnel Support ──

  private ngrokProcess: ChildProcess | null = null;

  isNgrokRunning(): boolean {
    if (this.ngrokProcess && !this.ngrokProcess.killed) return true;
    try {
      const out = execSync('tasklist /FI "IMAGENAME eq ngrok*" /FO CSV /NH', { encoding: 'utf-8', timeout: 3000 });
      return out.trim().length > 0 && out.includes('ngrok');
    } catch { return false; }
  }

  async downloadNgrok(): Promise<string> {
    const agentDir = resolvePath('playit');
    const agentPath = path.join(agentDir, 'ngrok.exe');
    if (fs.existsSync(agentPath)) return agentPath;
    const url = 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip';
    const zipPath = path.join(agentDir, 'ngrok.zip');
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(zipPath);
      https.get(url, { timeout: 60000 }, (resp) => {
        if (resp.statusCode !== 200) {
          file.close(); fs.unlinkSync(zipPath);
          return reject(new Error(`HTTP ${resp.statusCode} downloading ngrok`));
        }
        resp.pipe(file);
        file.on('finish', () => {
          file.close();
          try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(zipPath);
            zip.extractEntryTo('ngrok.exe', agentDir, false, true);
            fs.unlinkSync(zipPath);
            resolve(agentPath);
          } catch {
            // adm-zip may not be available; try 7z or just return path
            resolve(agentPath);
          }
        });
      }).on('error', (err) => {
        file.close();
        try { fs.unlinkSync(zipPath); } catch {}
        reject(err);
      });
    });
  }

  async startNgrok(port: number = 25565, authtoken?: string): Promise<{ success: boolean; message: string }> {
    if (this.isNgrokRunning()) {
      return { success: true, message: 'Ngrok already running.' };
    }
    const agentDir = resolvePath('playit');
    const agentPath = path.join(agentDir, 'ngrok.exe');
    if (!fs.existsSync(agentPath)) {
      try {
        await this.downloadNgrok();
      } catch (err: any) {
        return { success: false, message: `Failed to download ngrok: ${err.message}. Download manually from https://ngrok.com/download` };
      }
    }
    const db = getDatabase();
    const args: string[] = [];
    if (authtoken) {
      db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('ngrokAuthtoken', ?)").run(authtoken);
      const configDir = path.join(agentDir, '.ngrok2');
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'ngrok.yml'), `authtoken: ${authtoken}\n`);
    }
    args.push('tcp', String(port));
    try {
      this.ngrokProcess = spawn(agentPath, args, {
        cwd: agentDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });
      this.ngrokProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        const urlMatch = text.match(/url=tcp:\/\/(.+)/);
        if (urlMatch) {
          db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('ngrokAddress', ?)").run(urlMatch[1]);
        }
      });
      this.ngrokProcess.on('exit', () => { this.ngrokProcess = null; });
      this.ngrokProcess.on('error', () => { this.ngrokProcess = null; });
      setTimeout(() => this.emitConnectionUpdate(), 3000);
      return { success: true, message: 'Ngrok tunnel started.' };
    } catch (err: any) {
      this.ngrokProcess = null;
      return { success: false, message: `Failed to start ngrok: ${err.message}` };
    }
  }

  stopNgrok(): { success: boolean; message: string } {
    if (this.ngrokProcess && !this.ngrokProcess.killed) {
      this.ngrokProcess.kill('SIGTERM');
      this.ngrokProcess = null;
      setTimeout(() => this.emitConnectionUpdate(), 1000);
      return { success: true, message: 'Ngrok tunnel stopped.' };
    }
    try {
      execSync('taskkill /IM "ngrok*" /F', { timeout: 3000 });
      return { success: true, message: 'Ngrok tunnel stopped.' };
    } catch {
      return { success: true, message: 'Ngrok was not running.' };
    }
  }

  getNgrokStatus(): { configured: boolean; running: boolean; address: string } {
    const db = getDatabase();
    const address = (db.prepare("SELECT value FROM server_config WHERE key = 'ngrokAddress'").get() as any)?.value || '';
    return { configured: !!address, running: this.isNgrokRunning(), address };
  }
}

export const connectionManager = new ConnectionManager();
