import { ChildProcess, spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';
import os from 'os';
import { EventEmitter } from 'events';
import unzipper from 'unzipper';
import { getDatabase } from '../database';
import { resolveMinecraftDir, setMinecraftDir } from '../paths';

export enum ServerState {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  FAILED = 'failed',
}

export interface MinecraftEventMap {
  'server:output': (data: string) => void;
  'server:state': (state: ServerState, previous: ServerState) => void;
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
  private _state: ServerState = ServerState.STOPPED;
  private _lastError: string | null = null;
  private statsInterval: NodeJS.Timeout | null = null;
  private logStream: fs.WriteStream | null = null;
  private startedAt: Date | null = null;
  private restartAttempts = 0;
  private readonly maxRestartAttempts = 3;
  private outputBuffer: string[] = [];
  private startAttemptedAt: number | null = null;
  private hasStartedSuccessfully = false;
  private crashLog: string[] = [];
  private _currentTps = 20.0;

  constructor() {
    super();
    this.serverDir = resolveMinecraftDir();
    this.ensureDirectories();
  }

  get state(): ServerState { return this._state; }
  get lastError(): string | null { return this._lastError; }

  get isRunning(): boolean { return this._state === ServerState.RUNNING; }
  get isStarting(): boolean { return this._state === ServerState.STARTING; }

  private setState(newState: ServerState) {
    const prev = this._state;
    this._state = newState;
    if (newState === ServerState.FAILED) {
      this.crashLog = this.outputBuffer.slice(-50);
    }
    // Update database server status
    try {
      const db = getDatabase();
      const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
      if (activeId) {
        db.prepare("UPDATE servers SET status = ?, updated_at = datetime('now') WHERE id = ?").run(newState, activeId);
      }
    } catch (e) { /* ignore */ }
    this.emit('server:state', newState, prev);
    this.emit('server:output', `[MineControl] State: ${prev} → ${newState}\n`);
  }

  loadServer(directory: string) {
    if (this._state === ServerState.RUNNING || this._state === ServerState.STARTING || this._state === ServerState.STOPPING) return;
    this.serverDir = directory;
    this._lastError = null;
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

  // ── Pre-flight validation: runs BEFORE entering STARTING ──
  private async validatePreFlight(): Promise<{ config: any; jarFileName: string; jarPath: string }> {
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
      throw new Error(`Server jar not found: ${jarFileName} is missing. Run a Repair or download a server version from the Software page first.`);
    }

    // EULA
    const eulaPath = path.join(this.serverDir, 'eula.txt');
    const eulaContent = (() => { try { return fs.readFileSync(eulaPath, 'utf-8'); } catch { return ''; } })();
    if (!eulaContent.includes('eula=true')) {
      fs.writeFileSync(eulaPath, 'eula=true\n');
      this.emit('server:output', '[MineControl] EULA accepted automatically.\n');
    }

    // Generate default server.properties if missing (fixes NoSuchFileException on first launch)
    const propsPath = path.join(this.serverDir, 'server.properties');
    if (!fs.existsSync(propsPath)) {
      const defaults = [
        '#Minecraft server properties',
        '#Generated by MineControl OS',
        `server-port=${config.port}`,
        'server-ip=',
        'motd=A Minecraft Server',
        'max-players=20',
        `online-mode=${config.onlineMode ? 'true' : 'false'}`,
        'gamemode=survival',
        'difficulty=easy',
        'spawn-protection=16',
        'view-distance=10',
        'simulation-distance=10',
        'max-world-size=29999984',
        'pvp=true',
        'allow-nether=true',
        'allow-end=true',
        'generate-structures=true',
        'enforce-whitelist=false',
        'whitelist=false',
        'allow-flight=false',
        'level-name=world',
        'level-type=default',
        'level-seed=',
        'enable-command-block=false',
        'enable-query=false',
        'enable-rcon=false',
        'rcon.password=',
        'rcon.port=25575',
        'broadcast-console-to-ops=true',
        'broadcast-rcon-to-ops=true',
        'max-tick-time=60000',
        'max-chained-neighbor-updates=1000000',
        'rate-limit=0',
        'sync-chunk-writes=true',
        'entity-broadcast-range-percentage=100',
        'hardcore=false',
        'spawn-npcs=true',
        'spawn-animals=true',
        'spawn-monsters=true',
        'op-permission-level=4',
        'function-permission-level=2',
        'resource-pack=',
        'resource-pack-sha1=',
        'resource-pack-prompt=',
        'require-resource-pack=false',
        'text-filtering-config=',
        'network-compression-threshold=256',
        'enable-status=true',
        'prevent-proxy-connections=false',
        'hide-online-players=false',
        `enforce-secure-profile=${config.onlineMode ? 'true' : 'false'}`,
        'initial-enabled-packs=vanilla',
        'initial-disabled-packs=',
        'bug-report-link=',
        '',
      ].join('\n');
      fs.writeFileSync(propsPath, defaults, 'utf-8');
      this.emit('server:output', '[MineControl] Generated default server.properties.\n');
    }

    // Port check
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
        try {
          execSync(`taskkill /PID ${portCheck.pid} /F`, { timeout: 5000 });
          this.emit('server:output', `[MineControl] Killed orphaned Java process (PID: ${portCheck.pid}) that was holding port ${config.port}\n`);
          await new Promise(r => setTimeout(r, 1000));
          const recheck = await this.checkPort(config.port);
          if (!recheck.available) {
            throw new Error(`Port ${config.port} is still in use after killing Java process (PID: ${portCheck.pid}). Another application is using it.`);
          }
        } catch (e: any) {
          if (e.message?.startsWith('Port')) throw e;
          throw new Error(`Port ${config.port} is in use by ${processName} (PID: ${portCheck.pid}). Failed to auto-kill. Please close it manually.`);
        }
      } else {
        throw new Error(`Port ${config.port} is in use by ${processName}${portCheck.pid ? ` (PID: ${portCheck.pid})` : ''}. Please stop that process or change the server port in Settings.`);
      }
    }

    return { config, jarFileName, jarPath };
  }

  // ── Java resolution: scan .class files, find compatible JDK ──
  private async resolveJava(jarPath: string, config: any): Promise<{ javaPath: string; javaMajor: number; classVersion: number | null }> {
    const classVersion = await this.detectRequiredJava(jarPath);
    const requiredJava = classVersion !== null ? classVersion - 44 : 21;

    // Try configured path
    let javaPath = config.javaPath;
    let javaMajor: number;

    const tryJavaAt = async (jPath: string): Promise<number> => {
      try {
        const out = execSync(`"${jPath}" -version 2>&1`, { encoding: 'utf8', timeout: 10000 });
        const m = out.match(/version "(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      } catch { return 0; }
    };

    javaMajor = await tryJavaAt(javaPath);

    if (javaMajor >= requiredJava) {
      return { javaPath, javaMajor, classVersion };
    }

    // Configured path is absent or too old — scan all installed JDKs
    const { JavaDetector } = await import('./JavaDetector');
    const installed = await JavaDetector.scan();
    const viable = installed
      .filter(j => j.majorVersion >= requiredJava)
      .sort((a, b) => a.majorVersion - b.majorVersion);

    if (viable.length > 0) {
      javaPath = viable[0].path;
      javaMajor = viable[0].majorVersion;
      this.emit('server:output', `[MineControl] Auto-selected Java at "${javaPath}" (Java ${javaMajor})\n`);
      return { javaPath, javaMajor, classVersion };
    }

    // No compatible JDK found — build error message
    const installedList = installed.map(j => `  • Java ${j.majorVersion} at "${j.path}"`).join('\n');
    const classInfo = classVersion !== null
      ? ` (class version ${classVersion}.0)`
      : '';
    throw new Error(
      `This server jar requires Java ${requiredJava}+${classInfo}, but the configured Java at "${config.javaPath}" is` +
      (javaMajor > 0 ? ` only Java ${javaMajor}.` : ` not found.`) +
      `\n\nInstalled JDKs:\n${installedList || '  (none found)'}\n\n` +
      `No compatible Java ${requiredJava}+ installation found.\n` +
      `Please install Java ${requiredJava}+ from:\n` +
      `  • https://adoptium.net/temurin/releases/?version=${requiredJava}\n` +
      `  • https://www.oracle.com/java/technologies/downloads/\n\n` +
      `After installing, either:\n` +
      `  - Add Java ${requiredJava}+ to your PATH\n` +
      `  - Configure the full path in MineControl Settings\n` +
      `  - Restart MineControl to auto-detect the new Java`
    );
  }

  async start(): Promise<void> {
    if (this._state === ServerState.RUNNING || this._state === ServerState.STARTING || this._state === ServerState.STOPPING) {
      throw new Error('Server is already running or starting');
    }

    this._lastError = null;
    this.outputBuffer = [];
    this.startAttemptedAt = Date.now();
    this.hasStartedSuccessfully = false;
    this.restartAttempts = 0;
    this.crashLog = [];

    try {
      // ── Phase 1: Pre-flight validation (no state change yet) ──
      this.emit('server:output', '[MineControl] Pre-flight validation...\n');
      const { config, jarFileName, jarPath } = await this.validatePreFlight();

      // ── Phase 2: Java resolution ──
      this.emit('server:output', '[MineControl] Resolving Java runtime...\n');
      const { javaPath, javaMajor } = await this.resolveJava(jarPath, config);

      // ── All checks passed — enter STARTING state and spawn ──
      this.setState(ServerState.STARTING);
      this.emit('server:output', `[MineControl] Starting with Java ${javaMajor} at "${javaPath}"...\n`);

      // Log file
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

      const proc = spawn(javaPath, javaArgs, {
        cwd: this.serverDir,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      } as any);
      this.process = proc;

      // Catch immediate spawn errors
      const spawnErr = await new Promise<Error | null>((resolve) => {
        const onError = (err: Error) => resolve(err);
        proc.once('error', onError);
        setTimeout(() => { proc.removeListener('error', onError); resolve(null); }, 500);
      });

      if (spawnErr) {
        this.cleanup();
        this.setState(ServerState.FAILED);
        this._lastError = spawnErr.message;
        this.emit('server:error', spawnErr.message);
        this.emit('server:output', `[MineControl] Spawn failed: ${spawnErr.message}\n`);
        throw new Error(`Failed to start Java: ${spawnErr.message}. Check that Java is installed and JAVA_HOME is set.`);
      }

      // Wire up output handlers
      proc.stdout?.on('data', (data: Buffer) => this.handleOutput(data.toString()));
      proc.stderr?.on('data', (data: Buffer) => this.handleOutput(`[STDERR] ${data.toString()}`));

      // Process close handler (only fires for unexpected exits, not during a graceful stop)
      proc.on('close', (code) => {
        this.startedAt = null;
        this.process = null;
        this.cleanup();

        // If stop() already transitioned to STOPPING → STOPPED, don't override
        if (this._state === ServerState.STOPPING || this._state === ServerState.STOPPED) {
          if (this._state === ServerState.STOPPING) {
            this.setState(ServerState.STOPPED);
            this.emit('server:stopped', code);
          }
          return;
        }

        const crashed = code !== 0 || !this.hasStartedSuccessfully;
        const finalState = crashed ? ServerState.FAILED : ServerState.STOPPED;

        this._lastError = null;
        if (crashed && code !== 0) {
          this._lastError = `Process exited with code ${code}`;
        } else if (crashed && code === 0 && !this.hasStartedSuccessfully) {
          const snippet = this.outputBuffer.slice(-30).join('\n');
          this._lastError = `Server exited with code 0 before fully starting.\nPossible causes: invalid server.jar, wrong Java version, or port already in use.\n\nLast output:\n${snippet}`;
        }

        this.setState(finalState);
        this.emit('server:stopped', code);
        this.emit('server:output', `\n[MineControl] Server stopped with code ${code} → ${finalState}\n`);

        if (this._lastError) {
          this.emit('server:error', this._lastError);
          this.emit('server:output', `[MineControl] ERROR: ${this._lastError}\n`);
        }
      });

      // Process error handler
      proc.on('error', (err) => {
        this.process = null;
        this.cleanup();
        this._lastError = err.message;
        this.setState(ServerState.FAILED);
        this.emit('server:error', err.message);
        this.emit('server:output', `[MineControl] Runtime error: ${err.message}\n`);
      });

      // Start process telemetry monitoring
      this.startStatsMonitoring();

    } catch (error: any) {
      this._lastError = error.message;
      this.setState(ServerState.FAILED);
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
        this.startedAt = new Date();
        this.hasStartedSuccessfully = true;
        this.setState(ServerState.RUNNING);
        this.emit('server:started');
        continue;
      }

      // Server crashed / error
      if (line.includes('Error: Could not create the Java Virtual Machine') ||
          line.includes('Unrecognized option') ||
          line.includes('Error: A fatal exception has occurred')) {
        this.emit('server:crashed', line);
      }

      // TPS report (Vanilla /tps, Paper /tps)
      const tpsMatch = line.match(/TPS:\s*(\d+\.?\d*)/i);
      if (tpsMatch) {
        this._currentTps = parseFloat(tpsMatch[1]);
      }

      // Paper detailed TPS: "TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0"
      const tpsDetailedMatch = line.match(/TPS from last.*:\s*(\d+\.?\d*)/i);
      if (tpsDetailedMatch) {
        this._currentTps = parseFloat(tpsDetailedMatch[1]);
      }

      // Vanilla /tps: "The server's TPS is 20.0"
      const tpsVanillaMatch = line.match(/server's TPS is\s*(\d+\.?\d*)/i);
      if (tpsVanillaMatch) {
        this._currentTps = parseFloat(tpsVanillaMatch[1]);
      }
    }
  }

  private updatePlayerStatus(username: string, status: string) {
    try {
      const db = getDatabase();
      const player = db.prepare('SELECT * FROM players WHERE username = ?').get(username) as any;
      const now = new Date().toISOString();
      if (player) {
        const updates: string[] = ['status = ?', 'last_login = ?'];
        const values: any[] = [status === 'online' ? 'online' : 'offline', now];
        if (status === 'online') {
          // Set first_join if not set
          if (!player.first_join) {
            updates.push('first_join = ?');
            values.push(now);
          }
          // Try to enrich player data from NBT files
          this.enrichPlayerData(username, player);
        } else {
          updates.push('last_disconnect = ?');
          values.push(now);
        }
        updates.push('playtime = COALESCE(playtime, 0) + ?');
        const lastLogin = player.last_login ? new Date(player.last_login).getTime() : Date.now();
        const timeDiff = Math.floor((Date.now() - lastLogin) / 1000);
        values.push(status === 'offline' ? Math.min(timeDiff, 86400) : 0);
        values.push(player.id || username);
        db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE id = ? OR username = ?`).run(...values);
      } else {
        // Auto-register unknown player
        const id = require('uuid').v4();
        const uuid = player?.uuid || '';
        db.prepare(
          'INSERT INTO players (id, username, uuid, status, last_login, first_join, join_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(id, username, uuid, 'online', now, now, now);
      }
    } catch (e) {
      // ignore
    }
  }

  private async enrichPlayerDataAsync(username: string, player: any) {
    try {
      const nbt = await import('prismarine-nbt');
      const { promisify } = await import('util');
      const parseNbt = promisify(nbt.default ? nbt.default.parse : nbt.parse);
      const fs = await import('fs');
      const path = await import('path');

      const serverPropsPath = path.join(this.serverDir, 'server.properties');
      let levelName = 'world';
      if (fs.existsSync(serverPropsPath)) {
        const props = fs.readFileSync(serverPropsPath, 'utf-8');
        const match = props.match(/^level-name=(.*)$/m);
        if (match) levelName = match[1].trim();
      }
      const playerDataDir = path.join(this.serverDir, levelName, 'playerdata');
      const statsDir = path.join(this.serverDir, levelName, 'stats');
      const advancementsDir = path.join(this.serverDir, levelName, 'advancements');

      let uuid = player.uuid;
      if (!uuid) {
        const usercachePath = path.join(this.serverDir, 'usercache.json');
        if (fs.existsSync(usercachePath)) {
          const cache = JSON.parse(fs.readFileSync(usercachePath, 'utf-8'));
          const entry = cache.find((e: any) => e.name === player.username);
          if (entry) uuid = entry.uuid;
        }
      }
      if (!uuid) return;

      const db = getDatabase();
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      const playerDataPath = path.join(playerDataDir, `${uuid}.dat`);
      if (fs.existsSync(playerDataPath)) {
        try {
          const buffer = fs.readFileSync(playerDataPath);
          const { parsed } = (await parseNbt(buffer)) as any;
          const data = (nbt.default || nbt).simplify(parsed);
          if (data.Health !== undefined) { updateFields.push('health = ?'); updateValues.push(data.Health); }
          if (data.foodLevel !== undefined) { updateFields.push('food_level = ?'); updateValues.push(data.foodLevel); }
          if (data.XpLevel !== undefined) { updateFields.push('xp_level = ?'); updateValues.push(data.XpLevel); }
          if (data.XpP !== undefined) { updateFields.push('xp_progress = ?'); updateValues.push(data.XpP); }
          if (data.Dimension !== undefined) {
            const dim = typeof data.Dimension === 'string'
              ? data.Dimension.replace('minecraft:', '')
              : String(data.Dimension === -1 ? 'nether' : data.Dimension === 1 ? 'end' : 'overworld');
            updateFields.push('dimension = ?'); updateValues.push(dim);
          }
          if (data.Pos && Array.isArray(data.Pos) && data.Pos.length >= 3) {
            updateFields.push('pos_x = ?'); updateValues.push(data.Pos[0]);
            updateFields.push('pos_y = ?'); updateValues.push(data.Pos[1]);
            updateFields.push('pos_z = ?'); updateValues.push(data.Pos[2]);
          }
          if (data.Inventory) {
            updateFields.push('inventory = ?'); updateValues.push(JSON.stringify(data.Inventory));
            const armor = data.Inventory.filter((i: any) => i.Slot >= 100 && i.Slot <= 103);
            if (armor.length > 0) {
              updateFields.push('armor = ?'); updateValues.push(JSON.stringify(armor));
            }
          }
          if (data.EnderItems) {
            updateFields.push('ender_chest = ?'); updateValues.push(JSON.stringify(data.EnderItems));
          }
        } catch (e) { /* ignore */ }
      }

      const statsPath = path.join(statsDir, `${uuid}.json`);
      if (fs.existsSync(statsPath)) {
        try {
          const stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
          updateFields.push('statistics = ?'); updateValues.push(JSON.stringify(stats));
          const deathsKey = Object.keys(stats?.stats?.minecraft?.custom || {}).find(k => k.endsWith('deaths'));
          if (deathsKey) {
            updateFields.push('death_count = ?'); updateValues.push(stats.stats.minecraft.custom[deathsKey] || 0);
          }
          const killsKey = Object.keys(stats?.stats?.minecraft?.custom || {}).find(k => k.endsWith('player_kills') || k.endsWith('mob_kills'));
          if (killsKey) {
            updateFields.push('kills = ?'); updateValues.push(stats.stats.minecraft.custom[killsKey] || 0);
          }
        } catch (e) { /* ignore */ }
      }

      const advancementsPath = path.join(advancementsDir, `${uuid}.json`);
      if (fs.existsSync(advancementsPath)) {
        try {
          updateFields.push('advancements = ?');
          updateValues.push(fs.readFileSync(advancementsPath, 'utf-8'));
        } catch (e) { /* ignore */ }
      }

      if (updateFields.length > 0) {
        updateValues.push(uuid);
        db.prepare(`UPDATE players SET ${updateFields.join(', ')} WHERE uuid = ?`).run(...updateValues);
      }
    } catch (e) {
      // ignore enrichment errors
    }
  }

  private enrichPlayerData(username: string, player: any) {
    this.enrichPlayerDataAsync(username, player).catch(() => {});
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
    const allowed = [ServerState.RUNNING, ServerState.STARTING, ServerState.FAILED];
    if (!allowed.includes(this._state)) {
      throw new Error('Server is not running');
    }

    // Already stopping
    if (this._state === ServerState.STOPPING) return;

    this.emit('server:output', '[MineControl] Stopping server...\n');
    this.setState(ServerState.STOPPING);

    // Stop stats monitoring immediately
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    const proc = this.process;
    if (!proc) {
      this.setState(ServerState.STOPPED);
      return;
    }

    return new Promise((resolve) => {
      // Reset state on close; start()'s close handler defers to STOPPING state
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
    if (this._state !== ServerState.RUNNING) {
      throw new Error('Server is not running');
    }
    const proc = this.process;
    if (!proc) return;
    proc.stdin?.write(command + '\n');
    this.emit('server:output', `> ${command}\n`);
  }

  async executeRcon(command: string): Promise<string> {
    // Fallback to stdin if RCON not configured
    await this.sendCommand(command);
    return '';
  }

  private startStatsMonitoring() {
    this.statsInterval = setInterval(async () => {
      if (this._state !== ServerState.RUNNING) return;
      const proc = this.process;
      if (!proc) return;

      try {
        const pidusage = require('pidusage');
        const stats = await pidusage(proc.pid);

        const statsData = {
          cpu: Math.min(stats.cpu, 100),
          ram: Math.round(stats.memory / 1024 / 1024), // MB
          tps: this._currentTps,
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
        onlineMode: !!server.onlineMode,
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
      onlineMode: config.onlineMode !== 'false',
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
