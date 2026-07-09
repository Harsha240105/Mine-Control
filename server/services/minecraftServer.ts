import { ChildProcess, spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';
import os from 'os';
import { EventEmitter } from 'events';
import unzipper from 'unzipper';
import { getDatabase } from '../database';
import { resolveMinecraftDir, setMinecraftDir } from '../paths';
import { JavaManager, JavaVersion } from './JavaManager';
import { buildJvmArgs, autoTune } from './performanceTuner';

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
  private _autoBackupTriggered = false;
  private crashLog: string[] = [];
  private _currentTps = 20.0;
  private _lastJavaLaunch: {
    executable: string;
    version: string;
    majorVersion: number;
    vendor: string;
    javaHome: string;
    args: string[];
    cwd: string;
    timestamp: number;
  } | null = null;
  private _lastJavaInfo: JavaVersion | null = null;

  constructor() {
    super();
    this.serverDir = resolveMinecraftDir();
    this.ensureDirectories();
  }

  get state(): ServerState { return this._state; }
  get lastError(): string | null { return this._lastError; }

  get isRunning(): boolean { return this._state === ServerState.RUNNING; }
  get isStarting(): boolean { return this._state === ServerState.STARTING; }
  get currentTps(): number { return this._currentTps; }

  private setState(newState: ServerState) {
    const prev = this._state;
    this._state = newState;
    if (newState === ServerState.FAILED) {
      this.crashLog = this.outputBuffer.slice(-50);
    }
    // Update database server status
    try {
      const { getActiveServerId } = require('../db/repository/serverConfigRepository');
      const { updateServerStatus } = require('../db/repository/serverRepository');
      const activeId = getActiveServerId();
      if (activeId) {
        updateServerStatus(activeId, newState);
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
    // Persist server state to database on load
    try {
      const { getActiveServerId } = require('../db/repository/serverConfigRepository');
      const { updateServerStatus } = require('../db/repository/serverRepository');
      const { getServerById } = require('../db/repository/serverRepository');
      const activeId = getActiveServerId();
      if (activeId) {
        const savedState = getServerById(activeId);
        if (savedState && (savedState.status === 'running' || savedState.status === 'starting')) {
          updateServerStatus(activeId, 'stopped');
          this.emit('server:output', '[MineControl] Previous server session ended. Server state reset to stopped.\n');
        }
      }
    } catch {}
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

  private _startupLog: string[] = [];

  get startupLog(): string[] { return [...this._startupLog]; }

  private appendStartupLog(msg: string) {
    this._startupLog.push(msg);
    this.emit('server:output', `[Startup] ${msg}\n`);
  }

  get startupStage(): string {
    if (this._startupLog.length === 0) return '';
    return this._startupLog[this._startupLog.length - 1];
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

  // ── Full validation pipeline — runs BEFORE entering STARTING ──
  async validateAll(): Promise<{
    valid: boolean;
    checks: Array<{ name: string; passed: boolean; message: string; actionable: boolean; action?: string }>;
    config: any;
    jarPath: string;
    javaPath: string;
    javaMajor: number;
  }> {
    const checks: Array<{ name: string; passed: boolean; message: string; actionable: boolean; action?: string }> = [];
    const config = this.getConfig();
    const jarFileName = config.jarFile || 'server.jar';
    const jarPath = path.join(this.serverDir, jarFileName);
    let javaPath = config.javaPath || 'java';
    let javaMajor = 0;

    const add = (name: string, passed: boolean, message: string, actionable = false, action?: string) =>
      checks.push({ name, passed, message, actionable, action });

    // 1. Disk writable
    try {
      const testFile = path.join(this.serverDir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      add('Disk Writable', true, 'Server directory is writable');
    } catch {
      add('Disk Writable', false, 'Server directory is not writable. Check permissions.', true, 'fix-permissions');
    }

    // 2. RAM allocation
    const minRam = parseInt(config.minRam || '2');
    const maxRam = parseInt(config.maxRam || '8');
    const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);
    add('RAM Check', maxRam <= totalMem, `Allocated ${maxRam}GB, system has ${totalMem}GB total RAM${maxRam > totalMem ? '. Reduce max RAM allocation.' : ''}`, true, 'adjust-ram');

    // 3. Jar exists — auto-download if missing
    let waitCount = 0;
    while (fs.existsSync(jarPath + '.download') && waitCount < 120) {
      if (waitCount === 0) this.emit('server:output', '[MineControl] Waiting for jar download to finish...\n');
      await new Promise(r => setTimeout(r, 2000));
      waitCount++;
    }
    if (fs.existsSync(jarPath)) {
      add('Server Jar', true, `Found: ${jarFileName}`);
    } else {
      add('Server Jar', false, `Downloading ${jarFileName}...`, true, 'download-server');
      try {
        const { downloadVersion } = require('./download');
        const version = this.getVersionFromConfig(config);
        const source = this.getSourceFromConfig(config);
        await downloadVersion(version, source, jarPath);
        add('Server Jar', true, `${jarFileName} downloaded automatically`);
      } catch (e: any) {
        add('Server Jar', false, `Missing: ${jarFileName}. Auto-download failed: ${e.message}`, true, 'download-server');
      }
    }

    // 4. EULA
    const eulaPath = path.join(this.serverDir, 'eula.txt');
    let eulaOk = false;
    try {
      const eulaContent = fs.readFileSync(eulaPath, 'utf-8');
      eulaOk = eulaContent.includes('eula=true');
    } catch {}
    if (!eulaOk) {
      fs.writeFileSync(eulaPath, 'eula=true\n');
      add('EULA', true, 'Accepted automatically by MineControl OS');
    } else {
      add('EULA', true, 'Already accepted');
    }

    // 5. Port available
    const portCheck = await this.checkPort(config.port);
    if (portCheck.available) {
      add('Port Check', true, `Port ${config.port} is available`);
    } else {
      let processName = 'unknown';
      if (portCheck.pid) {
        try {
          const taskOut = execSync(`tasklist /FI "PID eq ${portCheck.pid}" /FO CSV /NH`, { encoding: 'utf-8', timeout: 5000 });
          const match = taskOut.match(/"([^"]+)"/);
          processName = match ? match[1] : `PID ${portCheck.pid}`;
        } catch {}
      }
      const isJava = processName.toLowerCase().includes('java');
      if (isJava) {
        add('Port Check', false, `Port ${config.port} is in use by a Java process (PID: ${portCheck.pid}). Can auto-kill.`, true, 'kill-port');
      } else {
        add('Port Check', false, `Port ${config.port} is in use by ${processName}${portCheck.pid ? ` (PID: ${portCheck.pid})` : ''}.`, true, 'change-port');
      }
    }

    // 6. Java check
    const javaValidation = await this.validateJavaInternal(config, jarPath);
    javaPath = javaValidation.javaPath;
    javaMajor = javaValidation.javaMajor;
    for (const c of javaValidation.checks) add(c.name, c.passed, c.message, c.actionable, c.action);

    // 7. Fabric loader check + auto-download
    if (config.jarFile?.toLowerCase().includes('fabric')) {
      const loaderJar = path.join(this.serverDir, 'fabric-server-launch.jar');
      if (!fs.existsSync(loaderJar)) {
        add('Fabric Loader', false, 'Downloading fabric-server-launch.jar...', true, 'repair-fabric');
        try {
          const { downloadFabricVersion } = require('./download');
          const version = this.getVersionFromConfig(config);
          await downloadFabricVersion(version, loaderJar);
          add('Fabric Loader', true, 'fabric-server-launch.jar downloaded automatically');
        } catch (e: any) {
          add('Fabric Loader', false, `Fabric download failed: ${e.message}. Run Repair Fabric.`, true, 'repair-fabric');
        }
      } else {
        add('Fabric Loader', true, 'fabric-server-launch.jar found');
      }
    }

    // 8. Forge libraries check
    if (config.jarFile?.toLowerCase().includes('forge')) {
      const librariesDir = path.join(this.serverDir, 'libraries');
      const exists = fs.existsSync(librariesDir);
      add('Forge Libraries', exists, exists ? 'Forge libraries directory found' : 'Missing Forge libraries. Run Repair Forge.', true, 'repair-forge');
    }

    // 9. Quilt loader check + auto-download
    if (config.jarFile?.toLowerCase().includes('quilt')) {
      const loaderJar = path.join(this.serverDir, 'quilt-server-launch.jar');
      if (!fs.existsSync(loaderJar)) {
        add('Quilt Loader', false, 'Downloading quilt-server-launch.jar...', true, 'repair-quilt');
        try {
          const { downloadQuiltVersion } = require('./download');
          const version = this.getVersionFromConfig(config);
          await downloadQuiltVersion(version, loaderJar);
          add('Quilt Loader', true, 'quilt-server-launch.jar downloaded automatically');
        } catch (e: any) {
          add('Quilt Loader', false, `Quilt download failed: ${e.message}. Run Repair Quilt.`, true, 'repair-quilt');
        }
      } else {
        add('Quilt Loader', true, 'quilt-server-launch.jar found');
      }
    }

    // 10. Mods folder writable
    const modsDir = path.join(this.serverDir, 'mods');
    try {
      if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
      const testFile = path.join(modsDir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      add('Mods Folder', true, 'Mods directory is writable');
    } catch {
      add('Mods Folder', false, 'Mods directory is not writable. Check permissions.', true, 'fix-permissions');
    }

    // 11. World directory
    const propsPath = path.join(this.serverDir, 'server.properties');
    let levelName = 'world';
    try {
      if (fs.existsSync(propsPath)) {
        const propsContent = fs.readFileSync(propsPath, 'utf-8');
        const m = propsContent.match(/^level-name=(.*)$/m);
        if (m) levelName = m[1].trim();
      }
    } catch {}
    const worldDir = path.join(this.serverDir, levelName);
    const worldExists = fs.existsSync(path.join(worldDir, 'level.dat')) || fs.existsSync(worldDir);
    add('World', true, worldExists ? `Found at ${levelName}` : 'Will generate on first start');

    const allPassed = checks.every(c => c.passed);
    return { valid: allPassed, checks, config, jarPath, javaPath, javaMajor };
  }

  private getVersionFromConfig(config: any): string {
    const jf = config.jarFile || 'server.jar';
    // For Fabric/Quilt with fixed launcher names, use stored version
    if (jf === 'fabric-server-launch.jar' || jf === 'quilt-server-launch.jar') {
      return config.version || '1.21';
    }
    const m = jf.match(/(?:paper|vanilla|fabric|forge|neoforge|quilt|purpur|spigot|folia|pufferfish)-(.+)\.jar$/i);
    return m ? m[1] : (config.version || '1.21');
  }

  private getSourceFromConfig(config: any): string {
    const jf = config.jarFile || 'server.jar';
    // Fabric/Quilt launcher names
    if (jf === 'fabric-server-launch.jar') return 'fabric';
    if (jf === 'quilt-server-launch.jar') return 'quilt';
    const m = jf.match(/^(paper|vanilla|fabric|forge|neoforge|quilt|purpur|spigot|folia|pufferfish)/i);
    return m ? m[1].toLowerCase() : 'paper';
  }

  private async validateJavaInternal(config: any, jarPath: string): Promise<{
    javaPath: string;
    javaMajor: number;
    checks: Array<{ name: string; passed: boolean; message: string; actionable: boolean; action?: string }>;
  }> {
    const checks: Array<{ name: string; passed: boolean; message: string; actionable: boolean; action?: string }> = [];
    const add = (name: string, passed: boolean, message: string, actionable = false, action?: string) =>
      checks.push({ name, passed, message, actionable, action });

    const jarVersion = this.getVersionFromConfig(config);
    const jarSource = this.getSourceFromConfig(config);
    const required = JavaManager.getRequiredJavaVersion(jarVersion);

    let javaPath = config.javaPath || 'java';
    let javaMajor = 0;

    const checkJavaAt = async (jPath: string): Promise<number> => {
      try {
        const out = execSync(`"${jPath}" -version 2>&1`, { encoding: 'utf8', timeout: 10000 });
        const m = out.match(/version "(?:1\.)?(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      } catch { return 0; }
    };

    javaMajor = await checkJavaAt(javaPath);

    if (javaMajor >= required) {
      add('Java Check', true, `Java ${javaMajor} found at "${javaPath}"`);
      return { javaPath, javaMajor, checks };
    }

    if (javaMajor > 0) {
      add('Java Version', false, `Configured Java at "${javaPath}" is version ${javaMajor}, but Java ${required}+ is needed.`, true, 'install-java');
    }

    const installed = await JavaManager.scan();
    const viable = installed.filter((j: any) => j.majorVersion >= required).sort((a: any, b: any) => a.majorVersion - b.majorVersion);

    if (viable.length > 0) {
      javaPath = viable[0].path;
      javaMajor = viable[0].majorVersion;
      add('Java Check', true, `Auto-selected Java ${javaMajor} at "${javaPath}"`);
      return { javaPath, javaMajor, checks };
    }

    const latest = installed.sort((a: any, b: any) => b.majorVersion - a.majorVersion)[0];
    if (installed.length > 0) {
      add('Java Version', false,
        `Need Java ${required}+, but only found: ${installed.map((j: any) => `Java ${j.majorVersion}`).join(', ')}.`,
        true, 'install-java');
    } else {
      add('Java Version', false, `Java not found. Minecraft requires Java ${required}+.`, true, 'install-java');
    }

    return { javaPath: config.javaPath || 'java', javaMajor: 0, checks };
  }

  // ── Auto-repair methods ──
  async autoInstallJava(version: string, source: string): Promise<{ success: boolean; javaPath: string; message: string }> {
    try {
      const controlDir = path.resolve(this.serverDir, '..', '.minecontrol');
      const required = JavaManager.getRequiredJavaVersion(version);
      const exePath = await JavaManager.ensureJavaInstalled(required, (msg, pct) => {
        this.emit('server:output', `[MineControl] ${msg}\n`);
        if (pct !== undefined) {
          try {
            const { emitToAll } = require('../socketManager');
            emitToAll('java:progress', { majorVersion: required, pct, msg });
          } catch (e) {}
        }
      });
      if (fs.existsSync(exePath)) {
        this.saveJavaConfig(exePath, `${required}.0.0`, required, 'Eclipse Temurin', path.dirname(path.dirname(exePath)));
        return { success: true, javaPath: exePath, message: `Java ${required} installed at ${exePath}` };
      }
      return { success: false, javaPath: '', message: 'Download succeeded but java.exe not found at expected location.' };
    } catch (err: any) {
      return { success: false, javaPath: '', message: `Java auto-install failed: ${err.message}` };
    }
  }

  async autoFixPort(): Promise<{ success: boolean; message: string }> {
    const config = this.getConfig();
    const portCheck = await this.checkPort(config.port);
    if (portCheck.available) return { success: true, message: 'Port is available' };
    if (portCheck.pid) {
      try {
        execSync(`taskkill /PID ${portCheck.pid} /F`, { timeout: 5000 });
        await new Promise(r => setTimeout(r, 1000));
        const recheck = await this.checkPort(config.port);
        if (recheck.available) return { success: true, message: `Killed process holding port ${config.port}` };
      } catch {}
    }
    const newPort = 25565 + Math.floor(Math.random() * 1000);
    this.updateConfig('port', String(newPort));
    return { success: true, message: `Changed port to ${newPort}` };
  }

  // ── Auto-download server jar by source ──
  private async autoDownloadJar(config: any, jarPath: string): Promise<boolean> {
    const source = this.getSourceFromConfig(config);
    const version = this.getVersionFromConfig(config);
    this.emit('server:output', `[MineControl] Auto-downloading ${source} ${version}...\n`);
    try {
      const { downloadVersion } = require('./download');
      await downloadVersion(version, source, jarPath);
      this.emit('server:output', `[MineControl] ${source} ${version} downloaded.\n`);
      return true;
    } catch (err: any) {
      this.emit('server:output', `[MineControl] Auto-download failed: ${err.message}\n`);
      return false;
    }
  }

  // ── Auto-download Fabric loader ──
  private async autoDownloadFabricLoader(config: any): Promise<boolean> {
    const version = this.getVersionFromConfig(config);
    const loaderJar = path.join(this.serverDir, 'fabric-server-launch.jar');
    if (fs.existsSync(loaderJar)) return true;
    this.emit('server:output', `[MineControl] Downloading Fabric loader for MC ${version}...\n`);
    try {
      const { downloadFabricVersion } = require('./download');
      await downloadFabricVersion(version, loaderJar);
      this.emit('server:output', `[MineControl] Fabric loader downloaded.\n`);
      return true;
    } catch (err: any) {
      this.emit('server:output', `[MineControl] Fabric loader download failed: ${err.message}\n`);
      return false;
    }
  }

  // ── Auto-download Quilt loader ──
  private async autoDownloadQuiltLoader(config: any): Promise<boolean> {
    const version = this.getVersionFromConfig(config);
    const loaderJar = path.join(this.serverDir, 'quilt-server-launch.jar');
    if (fs.existsSync(loaderJar)) return true;
    this.emit('server:output', `[MineControl] Downloading Quilt loader for MC ${version}...\n`);
    try {
      const { downloadQuiltVersion } = require('./download');
      await downloadQuiltVersion(version, loaderJar);
      this.emit('server:output', `[MineControl] Quilt loader downloaded.\n`);
      return true;
    } catch (err: any) {
      this.emit('server:output', `[MineControl] Quilt loader download failed: ${err.message}\n`);
      return false;
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

    // Auto-download jar if missing
    if (!fs.existsSync(jarPath)) {
      const downloaded = await this.autoDownloadJar(config, jarPath);
      if (!downloaded) {
        throw new Error(`Missing: ${jarFileName}. Auto-download failed. Check your network connection and try again.`);
      }
    }

    // EULA
    const eulaPath = path.join(this.serverDir, 'eula.txt');
    const eulaContent = (() => { try { return fs.readFileSync(eulaPath, 'utf-8'); } catch { return ''; } })();
    if (!eulaContent.includes('eula=true')) {
      fs.writeFileSync(eulaPath, 'eula=true\n');
      this.emit('server:output', '[MineControl] EULA accepted automatically.\n');
    }

    // Validate server-ip in existing server.properties
    const propsPath = path.join(this.serverDir, 'server.properties');
    if (fs.existsSync(propsPath)) {
      try {
        const propsContent = fs.readFileSync(propsPath, 'utf-8');
        const ipMatch = propsContent.match(/^server-ip=(.*)$/m);
        if (ipMatch) {
          const boundIp = ipMatch[1].trim();
          if (boundIp === '127.0.0.1' || boundIp === 'localhost') {
            this.emit('server:output', `[MineControl] WARNING: server-ip is set to ${boundIp}. External connections will not work. Auto-fixing by clearing server-ip.\n`);
            const fixed = propsContent.replace(/^server-ip=.*$/m, 'server-ip=');
            fs.writeFileSync(propsPath, fixed, 'utf-8');
          }
        }
      } catch {}
    }

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
        `level-name=${(config.name || 'world').replace(/[^a-zA-Z0-9_\-]/g, '_')}`,
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

    // Ensure Fabric/Quilt loader exists
    const source = this.getSourceFromConfig(config);
    if (source === 'fabric') {
      await this.autoDownloadFabricLoader(config);
    } else if (source === 'quilt') {
      await this.autoDownloadQuiltLoader(config);
    }

    return { config, jarFileName, jarPath };
  }

  // ── Java resolution: scan .class files, find compatible JDK ──
  private syncServerProperties(config: any) {
    const propsPath = path.join(this.serverDir, 'server.properties');
    if (!fs.existsSync(propsPath)) return;
    try {
      let content = fs.readFileSync(propsPath, 'utf-8');
      const updates: Record<string, string> = {
        'server-port': String(config.port),
        'online-mode': config.onlineMode ? 'true' : 'false',
        'enforce-secure-profile': config.onlineMode ? 'true' : 'false',
        'server-ip': config.serverIp || '',
        'level-name': (config.name || 'world').replace(/[^a-zA-Z0-9_\-]/g, '_'),
      };
      let changed = false;
      for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*`, 'm');
        if (regex.test(content)) {
          const lineMatch = content.match(regex);
          if (lineMatch && lineMatch[0] !== `${key}=${value}`) {
            content = content.replace(regex, `${key}=${value}`);
            changed = true;
          }
        } else {
          content += `\n${key}=${value}`;
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(propsPath, content, 'utf-8');
        this.emit('server:output', `[MineControl] Synced server.properties to match current config.\n`);
      }
    } catch (e) {
      this.emit('server:output', `[MineControl] Warning: Could not sync server.properties: ${e}\n`);
    }
  }

  private async resolveJava(
    jarPath: string, config: any, version: string, source: string
  ): Promise<{ javaPath: string; javaMajor: number; javaVersion: string; javaVendor: string; javaHome: string }> {
    const required = JavaManager.getRequiredJavaVersion(version);

    // 1. Try per-server configured path (may be empty string for new servers)
    let configured = config.javaExecutable || config.javaPath || '';
    if (configured && configured !== 'java' && configured !== 'javaw') {
      const maj = await this.checkJavaVersion(configured);
      if (maj >= required) {
        return { javaPath: configured, javaMajor: maj, javaVersion: `${maj}.0.0`, javaVendor: 'Unknown', javaHome: config.javaHome || '' };
      }
    }

    // 2. Scan all installed JDKs
    const installed = await JavaManager.scan();
    const viable = installed.filter((j: any) => j.majorVersion >= required);

    if (viable.length > 0) {
      const best = viable.sort((a: any, b: any) => a.majorVersion - b.majorVersion)[0];
      this.saveJavaConfig(best.path, best.version, best.majorVersion, best.vendor || 'Unknown', best.javaHome || '');
      return {
        javaPath: best.path, javaMajor: best.majorVersion,
        javaVersion: best.version, javaVendor: best.vendor || 'Unknown', javaHome: best.javaHome || '',
      };
    }

    // 3. Auto-download Temurin
    this.emit('server:output', `[MineControl] No compatible Java ${required}+ found. Downloading Eclipse Temurin ${required}...\n`);
    const controlDir = path.resolve(this.serverDir, '..', '.minecontrol');
    const exePath = await JavaManager.ensureJavaInstalled(required, (msg) => {
      this.emit('server:output', `[MineControl] ${msg}\n`);
    });
    this.saveJavaConfig(exePath, `${required}.0.0`, required, 'Eclipse Temurin', path.dirname(path.dirname(exePath)));
    return {
      javaPath: exePath, javaMajor: required,
      javaVersion: `${required}.0.0`, javaVendor: 'Eclipse Temurin', javaHome: path.dirname(path.dirname(exePath)),
    };
  }

  private async checkJavaVersion(javaPath: string): Promise<number> {
    try {
      const out = execSync(`"${javaPath}" -version 2>&1`, { encoding: 'utf8', timeout: 10000 });
      const m = out.match(/version "(?:1\.)?(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    } catch { return 0; }
  }

  private saveJavaConfig(javaPath: string, javaVersion: string, javaMajor: number, javaVendor: string, javaHome: string) {
    this._lastJavaInfo = { path: javaPath, version: javaVersion, majorVersion: javaMajor, source: 'MANAGED', vendor: javaVendor, javaHome };
    try {
      const db = getDatabase();
      const serverId = this.getServerIdFromDb();
      if (serverId) {
        db.prepare("UPDATE servers SET javaPath = ?, javaVersion = ?, javaVendor = ?, javaHome = ?, updated_at = datetime('now') WHERE id = ?")
          .run(javaPath, `${javaMajor}.0.0`, javaVendor, javaHome, serverId);
      }
    } catch {}
  }

  get lastJavaLaunch() { return this._lastJavaLaunch; }
  get lastJavaInfo() { return this._lastJavaInfo; }

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
    this._startupLog = [];

    try {
      this.setState(ServerState.STARTING);

      // Phase 1: Pre-flight validation
      this.appendStartupLog('Checking server jar...');
      const { config, jarFileName, jarPath } = await this.validatePreFlight();
      this.appendStartupLog(`Server jar OK: ${jarFileName}`);

      // Determine version and source for Java requirement lookup
      const versionStr = this.getVersionFromConfig(config);
      const sourceStr = this.getSourceFromConfig(config);

      // Phase 2: Java resolution — use version-based requirement as authoritative
      this.appendStartupLog('Resolving Java runtime...');
      const requiredMajor = JavaManager.getRequiredJavaVersion(versionStr);
      this.appendStartupLog(`Required: Java ${requiredMajor}`);

      const javaResult = await this.resolveJava(jarPath, config, versionStr, sourceStr);
      const { javaPath, javaMajor, javaVersion, javaVendor } = javaResult;

      this.appendStartupLog(`Java ${javaMajor} detected — ${javaVendor} ${javaVersion}`);

      if (javaMajor < requiredMajor) {
        throw new Error(`Java ${javaMajor} detected — ${javaVendor} ${javaVersion}\nMinecraft ${versionStr} requires Java ${requiredMajor}+\n\nUse Java Manager to install Java ${requiredMajor}.\n\nIf Java ${requiredMajor} is already installed, select it as the default in Java Manager.`);
      }

      this.appendStartupLog('Launching...');

      // Phase 3: Library checks (Forge/NeoForge still need manual installer)
      if (config.jarFile?.toLowerCase().includes('forge')) {
        this.appendStartupLog('Checking Forge libraries...');
        const librariesDir = path.join(this.serverDir, 'libraries');
        if (!fs.existsSync(librariesDir)) {
          this.appendStartupLog('Forge libraries missing. Re-run Forge installer.');
        }
      }

      if (config.jarFile?.toLowerCase().includes('neoforge')) {
        this.appendStartupLog('Checking NeoForge libraries...');
        const librariesDir = path.join(this.serverDir, 'libraries');
        if (!fs.existsSync(librariesDir)) {
          this.appendStartupLog('NeoForge libraries missing. Re-run NeoForge installer.');
        }
      }

      // Phase 4: Sync config
      this.appendStartupLog('Syncing server configuration...');
      this.syncServerProperties(config);

      // Phase 5: Memory check + auto tune
      const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);
      const maxRamNum = parseInt(config.maxRam || '8');
      if (maxRamNum > totalMem) {
        this.appendStartupLog(`WARNING: Allocated ${maxRamNum}GB RAM but system has only ${totalMem}GB. Auto-reducing to ${totalMem}GB.`);
        this.updateConfig('maxRam', `${totalMem}G`);
        config.maxRam = `${totalMem}G`;
      }
      this.appendStartupLog(`Memory: ${config.minRam} min / ${config.maxRam} max`);

      // Auto-calculate view-distance and simulation-distance if not set
      if (!config.simulationDistance || config.simulationDistance === 0) {
        const tune = autoTune(maxRamNum);
        const simDist = tune.recommendedSimulationDistance;
        this.updateConfig('simulationDistance', String(simDist));
        config.simulationDistance = simDist;
        this.appendStartupLog(`Auto-tuned simulation-distance: ${simDist}`);
      }

      // Build JVM args using performance tuner
      const jvmArgs = buildJvmArgs({
        minRam: config.minRam,
        maxRam: config.maxRam,
        jvmFlags: config.jvmFlags,
      });
      this.appendStartupLog(`JVM flags: ${jvmArgs.join(' ')}`);

      // All checks passed — spawn with absolute java executable
      this.appendStartupLog(`Launching: "${javaPath}"`);

      const logFileName = `server-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
      const logPath = path.join(this.serverDir, 'logs', logFileName);
      this.logStream = fs.createWriteStream(logPath, { flags: 'a' });

      const javaArgs = [
        ...jvmArgs,
        '-jar',
        jarPath,
        '--nogui',
        '--port', `${config.port}`,
      ];

      // Record launch info
      this._lastJavaLaunch = {
        executable: javaPath,
        version: javaVersion,
        majorVersion: javaMajor,
        vendor: javaVendor || 'Unknown',
        javaHome: javaResult.javaHome,
        args: javaArgs,
        cwd: this.serverDir,
        timestamp: Date.now(),
      };

      this.emit('server:output', `[MineControl] Launching: "${javaPath}" -Xms${config.minRam} -Xmx${config.maxRam} -jar "${jarPath}" --nogui --port ${config.port}\n`);

      const proc = spawn(javaPath, javaArgs, {
        cwd: this.serverDir,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      } as any);
      this.process = proc;

      const spawnErr = await new Promise<Error | null>((resolve) => {
        const onError = (err: Error) => resolve(err);
        proc.once('error', onError);
        setTimeout(() => { proc.removeListener('error', onError); resolve(null); }, 500);
      });

      if (spawnErr) {
        this.cleanup();
        this.setState(ServerState.FAILED);
        this._lastError = `Failed to launch Java executable at "${javaPath}": ${spawnErr.message}`;
        this.emit('server:error', this._lastError);
        this.appendStartupLog(`FAILED: ${spawnErr.message}`);
        throw new Error(this._lastError!);
      }

      proc.stdout?.on('data', (data: Buffer) => this.handleOutput(data.toString()));
      proc.stderr?.on('data', (data: Buffer) => this.handleOutput(`[STDERR] ${data.toString()}`));

      proc.on('close', (code) => {
        this.startedAt = null;
        this.process = null;
        this.cleanup();

        if (this._state === ServerState.STOPPING || this._state === ServerState.STOPPED) {
          if (this._state === ServerState.STOPPING) {
            this.setState(ServerState.STOPPED);
            this.emit('server:stopped', code);
          }
          return;
        }

        const crashed = code !== 0 || !this.hasStartedSuccessfully;
        this._lastError = null;

        if (crashed) {
          const snippet = this.outputBuffer.slice(-30).join('\n');
          this._lastError = this.buildCrashReport(code, snippet, javaMajor, javaVendor, javaVersion, javaPath, this.serverDir, javaArgs);
        }

        this.setState(crashed ? ServerState.FAILED : ServerState.STOPPED);
        this.emit('server:stopped', code);

        if (this._lastError) {
          this.emit('server:error', this._lastError);
        }
      });

      proc.on('error', (err) => {
        this.process = null;
        this.cleanup();
        this._lastError = `Java runtime error: ${err.message}`;
        this.setState(ServerState.FAILED);
        this.emit('server:error', this._lastError);
        this.appendStartupLog(`RUNTIME ERROR: ${err.message}`);
      });

      let doneTimeout: NodeJS.Timeout;
      this.once('server:started', () => clearTimeout(doneTimeout));

      doneTimeout = setTimeout(() => {
        if (!this.hasStartedSuccessfully && (this._state === ServerState.STARTING)) {
          const snippet = this.outputBuffer.slice(-20).join('\n');
          this._lastError = this.buildCrashReport(null, snippet, javaMajor, javaVendor, javaVersion, javaPath, this.serverDir, javaArgs);
          this.emit('server:error', this._lastError);
          if (this.process) {
            try { this.process.kill(); } catch {}
          }
          this.cleanup();
          this.setState(ServerState.FAILED);
        }
      }, 180000);

      this.startStatsMonitoring();

    } catch (error: any) {
      this._lastError = error.message;
      this.setState(ServerState.FAILED);
      this.emit('server:error', error.message);
      throw error;
    }
  }

  private buildCrashReport(
    code: number | null, snippet: string,
    javaMajor: number, javaVendor: string, javaVersion: string,
    javaExecutable: string, cwd: string, javaArgs: string[]
  ): string {
    const lower = snippet.toLowerCase();

    // Java version mismatch (highest priority)
    if (lower.includes('unsupportedclassversionerror') || lower.includes('unsupported major.minor version') || lower.includes('major.minor version')) {
      const classMatch = snippet.match(/(?:major\.minor version|class version)\s+(\d+)/i) ||
                         snippet.match(/UnsupportedClassVersionError.*?(\d+)/i);
      const classVersion = classMatch ? parseInt(classMatch[1], 10) : null;
      const requiredJava = classVersion ? classVersion - 44 : '?';
      const classFileMatch = snippet.match(/(?:class file version|version)\s+(\d+)\.\d+/i);
      const fileVersion = classFileMatch ? parseInt(classFileMatch[1], 10) - 44 : null;
      return [
        'Java Runtime Mismatch',
        '',
        `Detected: Java ${javaMajor} (${javaVendor} ${javaVersion})`,
        `Required: Java ${fileVersion || requiredJava}`,
        `Executable: ${javaExecutable}`,
        '',
        'This server requires a newer Java version.',
        'Use the Java Manager to download and select the correct version.',
        '',
        snippet.split('\n').slice(-5).join('\n'),
      ].join('\n');
    }

    // JVM creation failure
    if (lower.includes('could not create the java virtual machine') || lower.includes('could not reserve enough space')) {
      const memMatch = snippet.match(/Xms|Xmx|initial heap size|requested array size/i);
      return [
        'Java Virtual Machine Creation Failed',
        '',
        `Java: ${javaVendor} ${javaVersion} (${javaExecutable})`,
        memMatch ? 'Cause: The allocated RAM may be too large or too small for this system.' : 'Cause: Invalid JVM arguments.',
        '',
        'Solution: Reduce Min/Max RAM in Settings > Server.',
      ].join('\n');
    }

    // Could not find / load main class
    if (lower.includes('could not find or load main class')) {
      return [
        'Server Jar Corrupted',
        '',
        `Java: ${javaVendor} ${javaVersion} (${javaExecutable})`,
        'The server jar is corrupted or invalid.',
        '',
        'Solution: Download a fresh server jar from the Software page.',
      ].join('\n');
    }

    // Missing jar file
    if (lower.includes('unable to access jarfile') || lower.includes('error: could not open')) {
      return [
        'Server Jar Missing',
        '',
        `Java: ${javaVendor} ${javaVersion} (${javaExecutable})`,
        'The server jar file is missing or inaccessible.',
        '',
        'Solution: Check that the jar file exists in the server directory.',
      ].join('\n');
    }

    // Out of memory
    if (lower.includes('out of memory') || lower.includes('outofmemory') || lower.includes('java heap space')) {
      return [
        'Server Out of Memory',
        '',
        `Java: ${javaVendor} ${javaVersion} (${javaExecutable})`,
        'The server ran out of memory during startup.',
        '',
        'Solution: Increase Max RAM in Settings > Server.',
      ].join('\n');
    }

    // Port in use
    if (lower.includes('address already in use') || lower.includes('bind failed')) {
      return [
        'Port Already in Use',
        '',
        `Java: ${javaVendor} ${javaVersion} (${javaExecutable})`,
        'The server port is already in use by another application.',
        '',
        'Solution: Change the server port in Settings > Server or stop the other application.',
      ].join('\n');
    }

    // Permission denied
    if (lower.includes('permission denied') || lower.includes('access denied')) {
      return [
        'Permission Denied',
        '',
        `Java: ${javaVendor} ${javaVersion} (${javaExecutable})`,
        'MineControl does not have access to the server directory.',
        '',
        'Solution: Run MineControl as Administrator.',
      ].join('\n');
    }

    // Fabric missing
    if (lower.includes('fabric') && (lower.includes('not found') || lower.includes('missing'))) {
      return [
        'Fabric Loader Missing',
        '',
        `Java: ${javaVendor} ${javaVersion} (${javaExecutable})`,
        'The Fabric loader library is missing or corrupted.',
        '',
        'Solution: Use Repair Fabric from the server dashboard.',
      ].join('\n');
    }

    // Forge missing
    if (lower.includes('forge') && (lower.includes('not found') || lower.includes('missing'))) {
      return [
        'Forge Libraries Missing',
        '',
        `Java: ${javaVendor} ${javaVersion} (${javaExecutable})`,
        'The Forge installer libraries are missing.',
        '',
        'Solution: Re-run the Forge installer from the Software page.',
      ].join('\n');
    }

    // Generic — never show raw exit code; always translate to meaningful description
    const exitReason = code === null ? 'Server timed out during startup' :
      code === 1 ? 'Java process exited unexpectedly (check Java version, server jar, or memory settings)' :
      code === 2 ? 'Java executable not found or invalid configuration' :
      code === -1073741510 ? 'Java executable not found (check Java Manager for available installations)' :
      code === -1073740791 ? 'Java ran out of memory during startup (increase Max RAM in Settings)' :
      code === 13 ? 'Mismatch between Java version and server jar requirements' :
      `Server process exited (code ${code}) — check Java Manager for runtime configuration`;

    return [
      'Server Stopped Unexpectedly',
      '',
      `Detected: ${javaVendor} Java ${javaVersion}`,
      `Executable: ${javaExecutable}`,
      `Working Directory: ${cwd}`,
      `Reason: ${exitReason}`,
      '',
      'Use Java Manager to install, verify, or switch Java runtimes.',
      'If the issue persists, check the server console for detailed error output.',
      '',
      'Last output:',
      snippet.split('\n').slice(-8).join('\n'),
    ].join('\n');
  }



  private async verifyPortListening(port: number): Promise<boolean> {
    try {
      await new Promise<void>((resolve, reject) => {
        const sock = new net.Socket();
        sock.setTimeout(3000);
        sock.on('connect', () => { sock.destroy(); resolve(); });
        sock.on('error', (err) => { sock.destroy(); reject(err); });
        sock.on('timeout', () => { sock.destroy(); reject(new Error('timeout')); });
        sock.connect(port, '127.0.0.1');
      });
      this.emit('server:output', `[MineControl] Port ${port} is listening for connections.\n`);
      return true;
    } catch {
      this.emit('server:output', `[MineControl] WARNING: Port ${port} is not responding after Done message.\n`);
      return false;
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
      if (this.outputBuffer.length > 1000) {
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

      // Done loading — match common Minecraft done message patterns
      const doneMatch = line.match(/Done\s*\([\d.]+s\)\s*!\s*For\s+help/i) ||
                        line.match(/Done\s*\([\d.]+s\)\s*!\s*For\s+help, type/i) ||
                        (line.includes('Done (') && line.includes(')! For help'));
      if (doneMatch) {
        this.startedAt = new Date();
        this.hasStartedSuccessfully = true;
        this.setState(ServerState.RUNNING);
        this.emit('server:started');
        // Verify port is actually listening after Done
        this.verifyPortListening(parseInt(String(this.getConfig().port || 25565)));
        // Auto-backup after first successful start (once per session)
        // Delay 10s to allow world to finish generating on first run
        if (this.startAttemptedAt && !this._autoBackupTriggered) {
          this._autoBackupTriggered = true;
          setTimeout(() => {
            try {
              const { backupService } = require('./backup');
              backupService.createBackup({
                name: `First-start-${new Date().toISOString().slice(0, 10)}`,
                reason: 'Automatic backup after first successful server start',
                type: 'auto',
              }).catch(() => {});
            } catch {}
          }, 10000);
        }
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
      const { getActiveServerId } = require('../db/repository/serverConfigRepository');
      const serverId = getActiveServerId();
      const player = db.prepare('SELECT * FROM players WHERE username = ? AND (server_id = ? OR server_id IS NULL)').get(username, serverId) as any;
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
        values.push(player.id || username, serverId);
        db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE (id = ? OR username = ?) AND server_id = ?`).run(...values);
      } else {
        // Auto-register unknown player — lookup real UUID from usercache
        let realUuid: string | undefined;
        try {
          const usercachePath = path.join(this.serverDir, 'usercache.json');
          if (fs.existsSync(usercachePath)) {
            const cache = JSON.parse(fs.readFileSync(usercachePath, 'utf-8'));
            const entry = cache.find((e: any) => e.name === username);
            if (entry) realUuid = entry.uuid;
          }
        } catch {}
        const id = require('uuid').v4();
        const uuid = realUuid || id;
        db.prepare(
          'INSERT INTO players (id, username, uuid, status, last_login, first_join, join_date, server_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(id, username, uuid, 'online', now, now, now, serverId);
        // Run enrichment after creating record with correct UUID
        if (realUuid) {
          this.enrichPlayerData(username, { uuid: realUuid, username });
        }
      }
    } catch (e) {
      // ignore
    }
  }

  private async enrichPlayerDataAsync(username: string, player: any) {
    try {
      const nbt = await import('prismarine-nbt');
      const fs = await import('fs');
      const path = await import('path');

      const serverPropsPath = path.join(this.serverDir, 'server.properties');
      let levelName = 'world';
      if (fs.existsSync(serverPropsPath)) {
        const props = fs.readFileSync(serverPropsPath, 'utf-8');
        const match = props.match(/^level-name=(.*)$/m);
        if (match) levelName = match[1].trim();
      }
      const worldDir = path.join(this.serverDir, levelName);
      const fabricPlayerDataDir = path.join(worldDir, 'players', 'data');
      const fabricStatsDir = path.join(worldDir, 'players', 'stats');
      const fabricAdvDir = path.join(worldDir, 'players', 'advancements');

      const playerDataDir = path.join(worldDir, 'playerdata');
      const statsDir = path.join(worldDir, 'stats');
      const advancementsDir = path.join(worldDir, 'advancements');

      const db = getDatabase();

      let uuid = player.uuid;
      // Cross-check UUID against usercache — correct wrong UUIDs in DB
      try {
        const usercachePath = path.join(this.serverDir, 'usercache.json');
        if (fs.existsSync(usercachePath)) {
          const cache = JSON.parse(fs.readFileSync(usercachePath, 'utf-8'));
          const entry = cache.find((e: any) => e.name === player.username);
          if (entry) {
            if (uuid && uuid !== entry.uuid) {
              db.prepare('UPDATE players SET uuid = ? WHERE uuid = ?').run(entry.uuid, uuid);
            }
            uuid = entry.uuid;
          }
        }
      } catch {}
      if (!uuid) return;
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      const resolveFile = (...paths: string[][]): string | undefined => {
        const match = paths.find(p => fs.existsSync(path.join(...p)));
        return match ? path.join(...match) : undefined;
      };

      const playerDataPath = resolveFile(
        [playerDataDir, `${uuid}.dat`],
        [fabricPlayerDataDir, `${uuid}.dat`]
      );
      if (playerDataPath) {
        try {
          const buffer = fs.readFileSync(playerDataPath);
          const { parsed } = await nbt.parse(buffer);
          const data = nbt.simplify(parsed);
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

      const statsPath = resolveFile(
        [statsDir, `${uuid}.json`],
        [fabricStatsDir, `${uuid}.json`]
      );
      if (statsPath) {
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

      const advancementsPath = resolveFile(
        [advancementsDir, `${uuid}.json`],
        [fabricAdvDir, `${uuid}.json`]
      );
      if (advancementsPath) {
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
      const player = db.prepare('SELECT uuid FROM players WHERE username = ? AND (server_id = ? OR server_id IS NULL)').get(username, this.getServerIdFromDb()) as any;
      db.prepare('INSERT INTO chat_log (username, uuid, message, server_id) VALUES (?, ?, ?, ?)')
        .run(username, player?.uuid || null, message, this.getServerIdFromDb());
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
          const { getActiveServerId } = require('../db/repository/serverConfigRepository');
          const sid = getActiveServerId();
          if (sid) {
            db.prepare('INSERT INTO system_stats (cpu, ram, tps, players, timestamp, server_id) VALUES (?, ?, ?, ?, ?, ?)')
              .run(statsData.cpu, statsData.ram, statsData.tps, statsData.players, Date.now(), sid);
          } else {
            db.prepare('INSERT INTO system_stats (cpu, ram, tps, players, timestamp) VALUES (?, ?, ?, ?, ?)')
              .run(statsData.cpu, statsData.ram, statsData.tps, statsData.players, Date.now());
          }
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
      const serverId = this.getServerIdFromDb();
      const count = serverId
        ? db.prepare('SELECT COUNT(*) as count FROM players WHERE status = ? AND (server_id = ? OR server_id IS NULL)').get('online', serverId) as any
        : db.prepare('SELECT COUNT(*) as count FROM players WHERE status = ?').get('online') as any;
      return count?.count || 0;
    } catch {
      return 0;
    }
  }

  private getServerIdFromDb(): string | null {
    try {
      const db = getDatabase();
      const { getActiveServerId } = require('../db/repository/serverConfigRepository');
      return getActiveServerId();
    } catch {
      return null;
    }
  }

  getConfig() {
    const db = getDatabase();
    const serverId = this.getServerIdFromDb();
    let server: any = null;
    if (serverId) {
      server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
    }

    const rows = db.prepare('SELECT key, value FROM server_config').all() as any[];
    const config: Record<string, string> = {};
    for (const row of rows) {
      config[row.key] = row.value;
    }

    let serverIp = '';
    try {
      const propsPath = path.join(this.serverDir, 'server.properties');
      if (fs.existsSync(propsPath)) {
        const propsContent = fs.readFileSync(propsPath, 'utf-8');
        const ipMatch = propsContent.match(/^server-ip=(.*)$/m);
        if (ipMatch) serverIp = ipMatch[1].trim();
      }
    } catch {}

    if (server) {
      return {
        name: server.name || 'MineControl OS',
        serverIp,
        version: server.version || '',
        version_source: server.version_source || '',
        javaPath: server.javaPath || 'java',
        javaExecutable: server.javaPath || 'java',
        javaVersion: server.javaVersion || '',
        javaVendor: server.javaVendor || '',
        javaHome: server.javaHome || '',
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
        simulationDistance: server.simulationDistance || 0,
        jvmFlags: server.jvm_flags || '',
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
      serverIp,
      version: config.version || '',
      version_source: config.version_source || '',
      javaPath: config.javaPath || 'java',
      javaExecutable: config.javaPath || 'java',
      javaVersion: config.javaVersion || '',
      javaVendor: config.javaVendor || '',
      javaHome: config.javaHome || '',
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
    // Sync server.properties when relevant keys change
    const propsKeys = ['port', 'onlineMode', 'serverIp'];
    const shouldSyncProps = propsKeys.includes(key);
    const prevConfig = shouldSyncProps ? this.getConfig() : null;
    const serverId = this.getServerIdFromDb();
    if (serverId) {
      // Map common keys to server columns
      const columnMap: Record<string, string> = {
        javaPath: 'javaPath',
        javaExecutable: 'javaPath',
        javaVersion: 'javaVersion',
        javaVendor: 'javaVendor',
        javaHome: 'javaHome',
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
        simulationDistance: 'simulationDistance',
        jvmFlags: 'jvm_flags',
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
        db.prepare(`UPDATE servers SET ${col} = ?, updated_at = datetime('now') WHERE id = ?`).run(val, serverId);
        return;
      }
    }
    db.prepare('INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)').run(key, value);
    // Sync server.properties after config change
    if (shouldSyncProps) {
      try {
        const updatedConfig = this.getConfig();
        this.syncServerProperties(updatedConfig);
      } catch {}
    }
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
