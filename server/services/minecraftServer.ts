import { ChildProcess, spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { EventEmitter } from 'events';
import unzipper from 'unzipper';
import { getDatabase } from '../database';
import { resolveMinecraftDir, setMinecraftDir } from '../paths';

export interface MinecraftEventMap {
  'server:output': (data: string) => void;
  'server:started': () => void;
  'server:stopped': (code: number | null) => void;
  'server:error': (error: string) => void;
  'server:crashed': (error: string) => void;
  'player:join': (username: string) => void;
  'player:leave': (username: string) => void;
  'player:chat': (username: string, message: string) => void;
  'stats:update': (stats: { cpu: number; ram: number; tps: number; players: number }) => void;
}

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

  loadServer(directory: string) {
    if (this.running || this.starting) return;
    this.serverDir = directory;
    setMinecraftDir(directory);
    this.ensureDirectories();
  }

  get directory() {
    return this.serverDir;
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

  // Scans ALL .class files in the jar and returns the highest major class version
  private async detectRequiredJava(jarPath: string): Promise<number | null> {
    try {
      const directory = await unzipper.Open.file(jarPath);
      let maxVersion = 0;
      for (const file of directory.files) {
        if (!file.path.endsWith('.class')) continue;
        const buf = await file.buffer();
        if (buf.length >= 8) {
          const ver = buf.readUInt16BE(6);
          if (ver > maxVersion) maxVersion = ver;
        }
      }
      return maxVersion > 0 ? maxVersion : null;
    } catch {
      return null;
    }
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
      const jarFileName = config.jarFile || 'server.jar';
      const jarPath = path.join(this.serverDir, jarFileName);

      // Wait if the jar is currently being downloaded
      let waitCount = 0;
      while (fs.existsSync(jarPath + '.download') && waitCount < 120) {
        if (waitCount === 0) {
          this.emit('server:output', '[MineControl] Waiting for jar download to finish...\n');
        }
        await new Promise(r => setTimeout(r, 2000));
        waitCount++;
      }

      if (!fs.existsSync(jarPath)) {
        this.starting = false;
        throw new Error(`Server jar not found: ${jarFileName} is missing. Run a Repair or download a server version from the Software page first.`);
      }

      const eulaPath = path.join(this.serverDir, 'eula.txt');
      const eulaContent = (() => { try { return fs.readFileSync(eulaPath, 'utf-8'); } catch { return ''; } })();
      if (!eulaContent.includes('eula=true')) {
        fs.writeFileSync(eulaPath, 'eula=true\n');
        this.emit('server:output', '[MineControl] EULA accepted automatically.\n');
      }

      // Check Java version and jar requirements
      let javaMajor = 0;
      try {
        const javaOut = execSync(`"${config.javaPath}" -version 2>&1`, { encoding: 'utf8', timeout: 10000 });
        const versionMatch = javaOut.match(/version "(\d+)/);
        if (versionMatch) javaMajor = parseInt(versionMatch[1], 10);
      } catch (err: any) {
        this.starting = false;
        throw new Error(`Java not found or failed to execute at "${config.javaPath}".\nError: ${err.message}\n\nPlease install Java 21+ and configure a custom Java path in Settings.`);
      }

      if (javaMajor > 0 && javaMajor < 21) {
        this.starting = false;
        throw new Error(`Java version ${javaMajor} is not supported. MineControl requires Java 21 or higher. Found Java at: "${config.javaPath}"\n\nPlease install Java 21+ and configure the path in Settings.`);
      }

      // Detect the class version from the server jar to verify Java compatibility
      const classVersion = await this.detectRequiredJava(jarPath);
      if (classVersion !== null) {
        // Class version 61=Java17, 62=18, 63=19, 64=20, 65=21, 66=22, 67=23, 68=24, 69=25
        const requiredJava = classVersion - 44;
        if (javaMajor > 0 && requiredJava > javaMajor) {
          this.starting = false;
          throw new Error(`This server jar requires Java ${requiredJava}+ (class version ${classVersion}.0), but your Java only supports up to Java ${javaMajor} (class version ${javaMajor + 44}.0).\nFound Java at: "${config.javaPath}"\n\nPlease download and install Java ${requiredJava}+ from https://adoptium.net/ and configure the path in Settings.`);
        }
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
        '-XX:G1NewSizePercent=30',
        '-XX:G1MaxNewSizePercent=40',
        '-XX:G1HeapRegionSize=8M',
        '-XX:G1ReservePercent=20',
        '-XX:G1HeapWastePercent=5',
        '-XX:G1MixedGCCountTarget=4',
        '-XX:InitiatingHeapOccupancyPercent=15',
        '-XX:G1MixedGCLiveThresholdPercent=90',
        '-XX:G1RSetUpdatingPauseTimePercent=5',
        '-XX:SurvivorRatio=32',
        '-XX:+PerfDisableSharedMem',
        '-XX:MaxTenuringThreshold=1',
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
    const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
    let server: any = null;
    if (activeId) {
      server = db.prepare('SELECT * FROM servers WHERE id = ?').get(activeId) as any;
    }

    const rows = db.prepare('SELECT key, value FROM server_config').all() as any[];
    const config: Record<string, string> = {};
    for (const row of rows) {
      config[row.key] = row.value;
    }

    if (server) {
      return {
        name: server.name || 'MineControl OS',
        javaPath: server.javaPath || 'java',
        jarFile: server.jarFile || 'server.jar',
        minRam: server.minRam || '2G',
        maxRam: server.maxRam || '8G',
        port: server.port || 25565,
        autoRestart: !!server.autoRestart,
        autoBackup: !!server.autoBackup,
        backupInterval: parseInt('60'),
        backupEncryption: false,
        whitelistEnabled: !!server.whitelistEnabled,
        viewDistance: server.viewDistance || 10,
        motd: server.motd || '§bMineControl OS §7- §fMinecraft Server',
        difficulty: server.difficulty || 'normal',
        gamemode: server.gamemode || 'survival',
        pvp: !!server.pvp,
        maxPlayers: server.maxPlayers || 4,
        discordToken: config.discordToken || '',
        discordChannel: config.discordChannel || '',
      };
    }

    // Fallback to legacy server_config
    return {
      name: config.name || 'MineControl OS',
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
      discordToken: config.discordToken || '',
      discordChannel: config.discordChannel || '',
    };
  }

  updateConfig(key: string, value: string) {
    const db = getDatabase();
    const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
    if (activeId) {
      // Map common keys to server columns
      const columnMap: Record<string, string> = {
        javaPath: 'javaPath',
        jarFile: 'jarFile',
        minRam: 'minRam',
        maxRam: 'maxRam',
        port: 'port',
        motd: 'motd',
        difficulty: 'difficulty',
        gamemode: 'gamemode',
        pvp: 'pvp',
        maxPlayers: 'maxPlayers',
        viewDistance: 'viewDistance',
        onlineMode: 'onlineMode',
        autoRestart: 'autoRestart',
        autoBackup: 'autoBackup',
        whitelistEnabled: 'whitelistEnabled',
      };
      const col = columnMap[key];
      if (col) {
        let val = value;
        if (['pvp', 'onlineMode', 'autoRestart', 'autoBackup', 'whitelistEnabled'].includes(col)) {
          val = value === 'true' || value === '1' ? '1' : '0';
        }
        db.prepare(`UPDATE servers SET ${col} = ?, updated_at = datetime('now') WHERE id = ?`).run(val, activeId);
        return;
      }
    }
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
