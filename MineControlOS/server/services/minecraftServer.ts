import { ChildProcess, spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { EventEmitter } from 'events';
import { getDatabase } from '../database';
import { resolveMinecraftDir } from '../paths';

export interface MinecraftEventMap {
  'server:output': (data: string) => void;
  'server:started': () => void;
  'server:stopped': (code: number | null) => void;
  'server:error': (error: string) => void;
  'server:crashed': (error: string) => void;
  'player:join': (username: string) => void;
  'player:leave': (username: string) => void;
  'player:chat': (username: string, message: string) => void;
  'player:death': (username: string, message: string) => void;
  'player:tracking': (data: any) => void;
  'stats:update': (stats: { cpu: number; ram: number; tps: number; players: number }) => void;
}

interface PaperVersion {
  version: string;
  build: number;
  url: string;
}

const PAPER_API_BASE = 'https://api.papermc.io/v2/projects/paper';

const SUPPORTED_VERSIONS = [
  '1.20.1',
  '1.20.4',
  '1.21',
  '1.21.1',
  '1.21.5',
  'latest',
];

class MinecraftServerManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private serverDir: string;
  private running = false;
  private starting = false;
  private statsInterval: NodeJS.Timeout | null = null;
  private logStream: fs.WriteStream | null = null;
  private startedAt: Date | null = null;
  private restartAttempts = 0;
  private readonly maxRestartAttempts = 3;
  private outputBuffer: string[] = [];
  private startAttemptedAt: number | null = null;
  private hasStartedSuccessfully = false;

  constructor() {
    super();
    this.serverDir = resolveMinecraftDir();
    this.ensureDirectories();
  }

  async getAvailableVersions(): Promise<PaperVersion[]> {
    try {
      const res = await fetch(`${PAPER_API_BASE}/versions`);
      const data = await res.json() as any;
      const versions: PaperVersion[] = [];
      for (const v of data.versions) {
        if (SUPPORTED_VERSIONS.includes(v)) {
          const buildRes = await fetch(`${PAPER_API_BASE}/versions/${v}/builds`);
          const buildData = await buildRes.json() as any;
          if (buildData.builds?.length > 0) {
            const latestBuild = buildData.builds[buildData.builds.length - 1];
            versions.push({
              version: v,
              build: latestBuild.build,
              url: `${PAPER_API_BASE}/versions/${v}/builds/${latestBuild.build}/downloads/paper-${v}-${latestBuild.build}.jar`,
            });
          }
        }
      }
      return versions;
    } catch (err) {
      console.error('[MinecraftServer] Failed to fetch Paper versions:', err);
      return [];
    }
  }

  getCurrentVersion(): string {
    return this.getConfig().serverVersion || '1.21.1';
  }

  async changeVersion(version: string): Promise<void> {
    if (this.running) {
      throw new Error('Server must be stopped before changing version');
    }

    const versions = await this.getAvailableVersions();
    let targetVersion = versions.find(v => v.version === version);

    if (!targetVersion && version === 'latest' && versions.length > 0) {
      targetVersion = versions[versions.length - 1];
    }

    if (!targetVersion) {
      throw new Error(`Version ${version} not found or not supported`);
    }

    const jarPath = path.join(this.serverDir, 'server.jar');
    const oldJarPath = path.join(this.serverDir, `server.jar.bak`);

    if (fs.existsSync(jarPath)) {
      try { fs.unlinkSync(oldJarPath); } catch {}
      fs.renameSync(jarPath, oldJarPath);
    }

    this.emit('server:output', `[MineControl] Downloading Paper ${targetVersion.version} (build ${targetVersion.build})...\n`);

    const res = await fetch(targetVersion.url);
    if (!res.ok) {
      if (fs.existsSync(oldJarPath)) {
        fs.renameSync(oldJarPath, jarPath);
      }
      throw new Error(`Failed to download Paper ${targetVersion.version}: ${res.statusText}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(jarPath, buffer);

    this.updateConfig('serverVersion', targetVersion.version);

    // Delete backup jar
    try { fs.unlinkSync(oldJarPath); } catch {}

    this.emit('server:output', `[MineControl] Paper ${targetVersion.version} downloaded successfully.\n`);

    // Update version history
    try {
      const vhPath = path.join(this.serverDir, 'version_history.json');
      fs.writeFileSync(vhPath, JSON.stringify({
        currentVersion: targetVersion.version,
        build: targetVersion.build,
        updatedAt: new Date().toISOString(),
      }));
    } catch {}
  }

  private ensureDirectories() {
    const dirs = ['plugins', 'worlds', 'backups', 'logs', 'config'];
    for (const dir of dirs) {
      const p = path.join(this.serverDir, dir);
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
      }
    }
  }

  private cleanup() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  private async checkPort(port: number): Promise<{ available: boolean; pid?: number }> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          try {
            const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', timeout: 5000 });
            for (const line of out.split('\n')) {
              if (!line.includes('LISTENING')) continue;
              const parts = line.trim().split(/\s+/);
              const pid = parseInt(parts[parts.length - 1]);
              if (!isNaN(pid)) { resolve({ available: false, pid }); return; }
            }
          } catch {}
          resolve({ available: false });
        } else {
          resolve({ available: true });
        }
      });
      server.once('listening', () => { server.close(); resolve({ available: true }); });
      server.listen(port, '0.0.0.0');
    });
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isStarting(): boolean {
    return this.starting;
  }

  get uptime(): number {
    if (!this.startedAt) return 0;
    return Math.floor((Date.now() - this.startedAt.getTime()) / 1000);
  }

  get startedAtISO(): string | null {
    return this.startedAt ? this.startedAt.toISOString() : null;
  }

  async start(): Promise<void> {
    if (this.running || this.starting) {
      throw new Error('Server is already running or starting');
    }

    this.starting = true;
    this.outputBuffer = [];
    this.startAttemptedAt = Date.now();
    this.hasStartedSuccessfully = false;
    this.emit('server:output', '[MineControl] Starting Minecraft server...\n');

    try {
      const config = this.getConfig();
      const jarPath = path.join(this.serverDir, config.jarFile);

      if (!fs.existsSync(jarPath)) {
        this.starting = false;
        throw new Error(`Server jar not found at ${jarPath}. Please place the PaperMC server jar in the minecraft directory.`);
      }

      const eulaPath = path.join(this.serverDir, 'eula.txt');
      const eulaContent = (() => { try { return fs.readFileSync(eulaPath, 'utf-8'); } catch { return ''; } })();
      if (!eulaContent.includes('eula=true')) {
        fs.writeFileSync(eulaPath, 'eula=true\n');
        this.emit('server:output', '[MineControl] EULA accepted automatically.\n');
      }

      try {
        execSync(`"${config.javaPath}" -version 2>&1`, { stdio: 'pipe', timeout: 10000 });
      } catch {
        this.starting = false;
        throw new Error(`Java not found at "${config.javaPath}". Please install Java 21+ and set JAVA_HOME, or configure a custom Java path in Settings.`);
      }

      // Check if server port is available
      const portCheck = await this.checkPort(config.port);
      if (!portCheck.available) {
        let processName = 'unknown';
        if (portCheck.pid) {
          try {
            const taskOut = execSync(`tasklist /FI "PID eq ${portCheck.pid}" /FO CSV /NH`, { encoding: 'utf-8', timeout: 5000 });
            const match = taskOut.match(/"([^"]+)"/);
            processName = match ? match[1] : `PID ${portCheck.pid}`;
          } catch {}
        }
        const isJava = processName.toLowerCase().includes('java');
        if (isJava && portCheck.pid) {
          // Auto-kill orphaned Java process holding the port
          try {
            execSync(`taskkill /PID ${portCheck.pid} /F`, { timeout: 5000 });
            this.emit('server:output', `[MineControl] Killed orphaned Java process (PID: ${portCheck.pid}) that was holding port ${config.port}\n`);
            // Wait for OS to release the port
            await new Promise(r => setTimeout(r, 1000));
            const recheck = await this.checkPort(config.port);
            if (!recheck.available) {
              this.starting = false;
              throw new Error(`Port ${config.port} is still in use after killing Java process (PID: ${portCheck.pid}). Another application is using it.`);
            }
          } catch (e: any) {
            if (e.message?.startsWith('Port')) throw e;
            this.starting = false;
            throw new Error(`Port ${config.port} is in use by ${processName} (PID: ${portCheck.pid}). Failed to auto-kill. Please close it manually.`);
          }
        } else {
          this.starting = false;
          throw new Error(`Port ${config.port} is in use by ${processName}${portCheck.pid ? ` (PID: ${portCheck.pid})` : ''}. Please stop that process or change the server port in Settings.`);
        }
      }

      const logFileName = `server-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
      const logPath = path.join(this.serverDir, 'logs', logFileName);
      this.logStream = fs.createWriteStream(logPath, { flags: 'a' });

      const javaArgs = [
        `-Xms${config.minRam}`,
        `-Xmx${config.maxRam}`,
        '-XX:+UseG1GC',
        '-XX:+ParallelRefProcEnabled',
        '-XX:MaxGCPauseMillis=200',
        '-XX:+UnlockExperimentalVMOptions',
        '-XX:+DisableExplicitGC',
        '-XX:+AlwaysPreTouch',
        '-XX:G1HeapWastePercent=5',
        '-XX:G1MixedGCLiveThresholdPercent=85',
        '-XX:G1MixedGCCountTarget=4',
        '-XX:G1OldCSetRegionThresholdPercent=10',
        '-XX:G1HeapRegionSize=4M',
        '-Dfile.encoding=UTF-8',
        '-jar',
        jarPath,
        '--nogui',
        '--port', `${config.port}`,
      ];

      const env = { ...process.env };
      // Set working directory
      const options: { cwd: string; env: NodeJS.ProcessEnv; stdio: ['pipe', 'pipe', 'pipe'] } = {
        cwd: this.serverDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      };

      const proc = spawn(config.javaPath, javaArgs, options);
      this.process = proc;

      // Wait briefly to catch immediate spawn errors (e.g., Java not found)
      const spawnErr = await new Promise<Error | null>((resolve) => {
        const onError = (err: Error) => resolve(err);
        proc.once('error', onError);
        setTimeout(() => {
          proc.removeListener('error', onError);
          resolve(null);
        }, 500);
      });

      if (spawnErr) {
        this.cleanup();
        this.emit('server:error', spawnErr.message);
        this.emit('server:output', `[MineControl] Spawn failed: ${spawnErr.message}\n`);
        throw new Error(`Failed to start Java: ${spawnErr.message}. Check that Java is installed and JAVA_HOME is set.`);
      }

      this.restartAttempts = 0;

      proc.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        this.handleOutput(output);
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        this.handleOutput(`[STDERR] ${output}`);
      });

      proc.on('close', (code) => {
        this.running = false;
        this.starting = false;
        this.startedAt = null;
        this.cleanup();
        this.emit('server:stopped', code);
        this.emit('server:output', `\n[MineControl] Server stopped with code ${code}\n`);

        // Detect server that exited before fully starting
        if (code === 0 && !this.hasStartedSuccessfully && this.startAttemptedAt && Date.now() - this.startAttemptedAt < 15000 && this.outputBuffer.length > 0) {
          const lastOutput = this.outputBuffer.slice(-30).join('\n');
          const errorMsg = `Server exited with code 0 before fully starting.\nPossible causes: invalid server.jar, wrong Java version (need 21+), or port already in use.\n\nLast output:\n${lastOutput}`;
          this.emit('server:error', errorMsg);
          this.emit('server:output', `[MineControl] ERROR: ${errorMsg}\n`);
        }

        if (code !== 0 && this.getConfig().autoRestart && this.restartAttempts < this.maxRestartAttempts) {
          this.restartAttempts++;
          this.emit('server:output', `[MineControl] Auto-restarting in 5 seconds (attempt ${this.restartAttempts}/${this.maxRestartAttempts})...\n`);
          setTimeout(() => this.start().catch(() => {}), 5000);
        } else if (code !== 0 && this.restartAttempts >= this.maxRestartAttempts) {
          this.emit('server:output', `[MineControl] Max restart attempts reached. Giving up.\n`);
        }
      });

      proc.on('error', (err) => {
        this.running = false;
        this.starting = false;
        this.cleanup();
        this.emit('server:error', err.message);
        this.emit('server:output', `[MineControl] Runtime error: ${err.message}\n`);
      });

      // Start monitoring
      this.startStatsMonitoring();

    } catch (error: any) {
      this.starting = false;
      this.emit('server:error', error.message);
      throw error;
    }
  }

  private handleOutput(output: string) {
    if (this.logStream) {
      this.logStream.write(output);
    }

    // Parse Minecraft log lines for events
    const lines = output.split('\n').filter(l => l.trim());

    for (const line of lines) {
      this.outputBuffer.push(line);
      if (this.outputBuffer.length > 100) {
        this.outputBuffer.shift();
      }
      this.emit('server:output', line + '\n');

      // Player join
      const joinMatch = line.match(/\[\d+:\d+:\d+\]\s+\[Server thread\/INFO\]:\s+(\w+) joined the game/);
      if (joinMatch) {
        const username = joinMatch[1];
        this.emit('player:join', username);
        this.updatePlayerStatus(username, 'online');
        continue;
      }

      // Player leave
      const leaveMatch = line.match(/\[\d+:\d+:\d+\]\s+\[Server thread\/INFO\]:\s+(\w+) left the game/);
      if (leaveMatch) {
        const username = leaveMatch[1];
        this.emit('player:leave', username);
        this.updatePlayerStatus(username, 'offline');
        continue;
      }

      // Chat message
      const chatMatch = line.match(/\[\d+:\d+:\d+\]\s+\[Server thread\/INFO\]:\s*<(\w+)>\s(.+)/);
      if (chatMatch) {
        const [, username, message] = chatMatch;
        this.emit('player:chat', username, message);
        this.logChat(username, message);
        continue;
      }

      // Death
      const deathMatch = line.match(/\[\d+:\d+:\d+\]\s+\[Server thread\/INFO\]:\s*(.+)$/);
      if (deathMatch) {
        const msg = deathMatch[1];
        const deathPatterns = [
          /(\w+) was (slain|shot|blown|killed|pricked|drowned|experienced|burned|fried|went|hit|didn't|fell|suffocated|impaled)/i,
          /(\w+) (drowned|burned|died|starved|disconnected|withered)/i,
          /(\w+) blew up/i,
          /(\w+) was squished/i,
          /(\w+) was fireballed/i,
          /(\w+) walked into/i,
          /(\w+) tried to swim/i,
        ];
        for (const pattern of deathPatterns) {
          const m = msg.match(pattern);
          if (m) {
            const username = m[1];
            this.emit('player:death', username, msg);
            this.addServerEvent('death', username, msg);
            break;
          }
        }
      }

      // Player tracking via /minecraft:list or /list
      // Also detect coordinates from /data get entity commands or plugin output

      // Done loading
      if (line.includes('Done') && line.includes('For help')) {
        this.running = true;
        this.starting = false;
        this.startedAt = new Date();
        this.hasStartedSuccessfully = true;
        this.emit('server:started');
        continue;
      }

      // Server crashed / error
      if (line.includes('Error: Could not create the Java Virtual Machine') ||
          line.includes('Unrecognized option') ||
          line.includes('Error: A fatal exception has occurred')) {
        this.emit('server:crashed', line);
      }
    }
  }

  private updatePlayerStatus(username: string, status: string) {
    try {
      const db = getDatabase();
      const player = db.prepare('SELECT * FROM players WHERE username = ?').get(username) as any;
      if (player) {
        db.prepare('UPDATE players SET status = ?, last_login = ? WHERE username = ?')
          .run(status === 'online' ? 'online' : 'offline', new Date().toISOString(), username);
      }
    } catch (e) {
      // ignore
    }
  }

  private addServerEvent(type: string, username: string | null, message: string, details?: string) {
    try {
      const db = getDatabase();
      db.prepare('INSERT INTO server_events (type, username, message, details, timestamp) VALUES (?, ?, ?, ?, ?)')
        .run(type, username, message, details || null, Date.now());
    } catch {}
  }

  getServerEvents(limit = 50): any[] {
    try {
      const db = getDatabase();
      return db.prepare('SELECT * FROM server_events ORDER BY timestamp DESC LIMIT ?').all(limit);
    } catch { return []; }
  }

  getConnectionInfo(): any {
    const props = this.getServerProperties();
    const serverIp = props['server-ip'] || '';
    const port = props['server-port'] || '25565';
    const onlineMode = props['online-mode'] !== 'false';
    const config = this.getConfig();
    return {
      localAddress: `localhost:${port}`,
      lanAddress: '',
      publicIp: '',
      port,
      serverIp,
      onlineMode,
      serverVersion: config.serverVersion || '1.21.1',
      playitAddress: config.playitAddress || '',
      playitEnabled: config.playitEnabled === 'true',
      boundToLocalhost: serverIp === '127.0.0.1' || serverIp === 'localhost' || serverIp === '',
    };
  }

  getServerProperties(): Record<string, string> {
    const propsPath = path.join(this.serverDir, 'server.properties');
    if (!fs.existsSync(propsPath)) return {};
    const content = fs.readFileSync(propsPath, 'utf-8');
    const props: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      props[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return props;
  }

  getDiagnostics(): any {
    const props = this.getServerProperties();
    const config = this.getConfig();
    const serverIp = props['server-ip'] || '';
    const port = config.port || 25565;
    const results: any[] = [];

    // Check 1: server-ip must be empty
    results.push({
      name: 'server-ip check',
      status: serverIp === '' ? 'pass' : 'warn',
      message: serverIp === ''
        ? 'server-ip is empty (correct)'
        : `server-ip is set to "${serverIp}" - friends cannot connect. Set it to empty.`,
    });

    // Check 2: Port binding
    try {
      const out = require('child_process').execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', timeout: 5000 });
      const lines = out.split('\n').filter((l: string) => l.includes('LISTENING'));
      if (lines.length === 0) {
        results.push({ name: 'Port binding', status: 'fail', message: `No process listening on port ${port}` });
      } else {
        const boundToAll = lines.some((l: string) => l.includes('0.0.0.0:'));
        const boundToLocal = lines.some((l: string) => l.includes('127.0.0.1:'));
        if (boundToAll) {
          results.push({ name: 'Port binding', status: 'pass', message: `Port ${port} is bound to 0.0.0.0 (accessible from network)` });
        } else if (boundToLocal) {
          results.push({ name: 'Port binding', status: 'warn', message: `Port ${port} is bound to 127.0.0.1 only - external connections blocked` });
        } else {
          results.push({ name: 'Port binding', status: 'warn', message: `Port ${port} is listening but binding could not be verified` });
        }
      }
    } catch {
      results.push({ name: 'Port binding', status: 'warn', message: 'Could not check port binding' });
    }

    // Check 3: Firewall
    try {
      const fwOut = require('child_process').execSync(
        `netsh advfirewall firewall show rule name=all dir=in | findstr /I "java"`,
        { encoding: 'utf-8', timeout: 5000 }
      );
      if (fwOut.trim()) {
        results.push({ name: 'Firewall', status: 'pass', message: 'Java has firewall rules (may still need to check if enabled)' });
      } else {
        results.push({ name: 'Firewall', status: 'warn', message: 'No explicit Java firewall rule found. Java may be blocked.' });
      }
    } catch {
      results.push({ name: 'Firewall', status: 'warn', message: 'Could not check firewall rules' });
    }

    // Check 4: CGNAT detection (check if public IP is in CGNAT range)
    results.push({
      name: 'CGNAT Detection',
      status: 'info',
      message: 'Run a health check to test public reachability',
    });

    // Check 5: Server reachability
    results.push({
      name: 'Server Status',
      status: this.running ? 'pass' : 'fail',
      message: this.running ? 'Server is running' : 'Server is not running',
    });

    return results;
  }

  async healthCheck(): Promise<any> {
    const results: any = { checks: [], reachable: false, publicIp: '', cgnat: false };

    // Get public IP
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json() as any;
      results.publicIp = data.ip;
    } catch {
      results.publicIp = 'unknown';
    }

    // Check if public IP is in CGNAT ranges
    if (results.publicIp && results.publicIp !== 'unknown') {
      const firstOctet = parseInt(results.publicIp.split('.')[0]);
      results.cgnat = (firstOctet >= 100 && firstOctet <= 100);
      results.cgnatReason = results.cgnat
        ? `Your IP ${results.publicIp} starts with ${firstOctet}.x.x.x which is a CGNAT range. Your ISP is blocking incoming connections.`
        : null;
    }

    // Check port reachability from external service
    const config = this.getConfig();
    const port = config.port || 25565;
    try {
      const checkRes = await fetch(`https://api.portchecker.io/v1/check/${results.publicIp}/${port}`, { signal: AbortSignal.timeout(5000) });
      if (checkRes.ok) {
        const checkData = await checkRes.json() as any;
        results.reachable = checkData.reachable === true;
        results.checks.push({
          name: 'Public Port Reachability',
          status: results.reachable ? 'pass' : 'fail',
          message: results.reachable
            ? `Port ${port} is reachable from the internet`
            : `Port ${port} is not reachable - check firewall or port forwarding`,
        });
      } else {
        results.checks.push({ name: 'Public Port Reachability', status: 'warn', message: 'Could not verify port reachability' });
      }
    } catch {
      results.checks.push({ name: 'Public Port Reachability', status: 'warn', message: 'Could not test reachability (port checker service unavailable)' });
    }

    // Local port check
    try {
      const out = require('child_process').execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', timeout: 5000 });
      if (out.includes('LISTENING')) {
        results.checks.push({ name: 'Local Port', status: 'pass', message: `Port ${port} is open on this machine` });
      } else {
        results.checks.push({ name: 'Local Port', status: 'fail', message: `Port ${port} is not open on this machine` });
      }
    } catch {
      results.checks.push({ name: 'Local Port', status: 'warn', message: 'Could not check local port' });
    }

    // server-ip check
    const props = this.getServerProperties();
    const serverIp = props['server-ip'] || '';
    if (serverIp === '') {
      results.checks.push({ name: 'server-ip config', status: 'pass', message: 'server-ip is empty (correct)' });
    } else {
      results.checks.push({ name: 'server-ip config', status: 'fail', message: `server-ip is "${serverIp}" - must be empty for external connections` });
    }

    results.overall = results.checks.every((c: any) => c.status === 'pass') ? 'pass' : results.checks.some((c: any) => c.status === 'fail') ? 'fail' : 'warn';
    return results;
  }

  private logChat(username: string, message: string) {
    try {
      const db = getDatabase();
      const player = db.prepare('SELECT uuid FROM players WHERE username = ?').get(username) as any;
      db.prepare('INSERT INTO chat_log (username, uuid, message) VALUES (?, ?, ?)')
        .run(username, player?.uuid || null, message);
    } catch (e) {
      // ignore
    }
  }

  async stop(): Promise<void> {
    if (!this.process && !this.running) {
      throw new Error('Server is not running');
    }

    this.emit('server:output', '[MineControl] Stopping server...\n');

    // Stop stats monitoring immediately
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    const proc = this.process;
    if (!proc) {
      this.running = false;
      this.starting = false;
      return;
    }

    return new Promise((resolve) => {
      // Resolve as soon as the process actually exits
      const onClose = () => {
        proc.removeListener('close', onClose);
        proc.removeListener('error', onClose);
        resolve();
      };
      proc.on('close', onClose);
      proc.on('error', onClose);

      // Send graceful stop commands
      proc.stdin?.write('say §cServer is shutting down...\n');

      setTimeout(() => {
        proc.stdin?.write('save-all\n');
        setTimeout(() => {
          proc.stdin?.write('stop\n');
          // Force kill after 15 seconds if process didn't exit
          setTimeout(() => {
            try {
              if (this.process) {
                this.process.kill();
                this.emit('server:output', '[MineControl] Force killed server process.\n');
              }
            } catch {
              // Process already exited
            }
            resolve();
          }, 15000);
        }, 3000);
      }, 2000);
    });
  }

  async sendCommand(command: string): Promise<void> {
    if (!this.process || !this.running) {
      throw new Error('Server is not running');
    }
    this.process.stdin?.write(command + '\n');
    this.emit('server:output', `> ${command}\n`);
  }

  async executeRcon(command: string): Promise<string> {
    // Fallback to stdin if RCON not configured
    await this.sendCommand(command);
    return '';
  }

  private startStatsMonitoring() {
    this.statsInterval = setInterval(async () => {
      if (!this.process || !this.running) return;

      try {
        const pidusage = require('pidusage');
        const stats = await pidusage(this.process.pid);

        const statsData = {
          cpu: Math.min(stats.cpu, 100),
          ram: Math.round(stats.memory / 1024 / 1024), // MB
          tps: 20.0,
          players: this.getOnlinePlayersCount(),
        };

        this.emit('stats:update', statsData);

        // Store stats in database
        try {
          const db = getDatabase();
          db.prepare('INSERT INTO system_stats (cpu, ram, tps, players, timestamp) VALUES (?, ?, ?, ?, ?)')
            .run(statsData.cpu, statsData.ram, statsData.tps, statsData.players, Date.now());
        } catch (e) {
          // ignore
        }
      } catch (e) {
        // ignore
      }
    }, 2000);
  }

  private getOnlinePlayersCount(): number {
    try {
      const db = getDatabase();
      const count = db.prepare('SELECT COUNT(*) as count FROM players WHERE status = ?').get('online') as any;
      return count?.count || 0;
    } catch {
      return 0;
    }
  }

  getConfig() {
    const db = getDatabase();
    const config: Record<string, string> = {};
    const rows = db.prepare('SELECT key, value FROM server_config').all() as any[];
    for (const row of rows) {
      config[row.key] = row.value;
    }

    return {
      javaPath: config.javaPath || 'java',
      jarFile: config.jarFile || 'server.jar',
      minRam: config.minRam || '2G',
      maxRam: config.maxRam || '8G',
      port: parseInt(config.port || '25565'),
      autoRestart: config.autoRestart !== 'false',
      autoBackup: config.autoBackup !== 'false',
      backupInterval: parseInt(config.backupInterval || '60'),
      backupEncryption: config.backupEncryption === 'true',
      whitelistEnabled: config.whitelistEnabled !== 'false',
      motd: config.motd || '§bMineControl OS §7- §fMinecraft Server',
      difficulty: config.difficulty || 'normal',
      gamemode: config.gamemode || 'survival',
      pvp: config.pvp !== 'false',
      maxPlayers: parseInt(config.maxPlayers || '4'),
      serverVersion: config.serverVersion || '1.21.1',
      playitAddress: config.playitAddress || '',
      playitToken: config.playitToken || '',
      playitEnabled: config.playitEnabled || 'false',
    };
  }

  updateConfig(key: string, value: string) {
    const db = getDatabase();
    db.prepare('INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)').run(key, value);
  }

  getLogs(limit = 100, offset = 0): string[] {
    const logDir = path.join(this.serverDir, 'logs');
    if (!fs.existsSync(logDir)) return [];

    const files = fs.readdirSync(logDir)
      .filter(f => f.startsWith('server-') && f.endsWith('.log'))
      .sort()
      .reverse();

    if (files.length === 0) return [];

    const latestLog = path.join(logDir, files[0]);
    const content = fs.readFileSync(latestLog, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    return lines.slice(-limit - offset).slice(0, limit);
  }

  searchLogs(query: string): string[] {
    const logDir = path.join(this.serverDir, 'logs');
    if (!fs.existsSync(logDir)) return [];

    const files = fs.readdirSync(logDir)
      .filter(f => f.startsWith('server-') && f.endsWith('.log'))
      .sort()
      .reverse()
      .slice(0, 3);

    const results: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(path.join(logDir, file), 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          results.push(line);
        }
      }
    }
    return results.slice(-200);
  }
}

export const minecraftServer = new MinecraftServerManager();
