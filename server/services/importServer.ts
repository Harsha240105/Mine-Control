import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import { getDatabase, generateSlug } from '../database';
import { setMinecraftDir, resolvePath } from '../paths';
import { minecraftServer } from './minecraftServer';

interface ImportResult {
  success: boolean;
  server?: any;
  warnings: string[];
  errors: string[];
  detected?: DetectionResult;
}

interface DetectionResult {
  software: string;
  version: string;
  worldName: string;
  plugins: string[];
  mods: string[];
  datapacks: string[];
  playerData: string[];
  whitelist: string[];
  operators: string[];
  bannedPlayers: string[];
  serverProperties: Record<string, string>;
  size: number;
  javaVersion: string;
  saveVersion: number;
}

const SOFTWARE_PATTERNS: { pattern: string; name: string }[] = [
  { pattern: 'paper.yml', name: 'Paper' },
  { pattern: 'purpur.yml', name: 'Purpur' },
  { pattern: 'bukkit.yml', name: 'Bukkit' },
  { pattern: 'spigot.yml', name: 'Spigot' },
  { pattern: 'fabric-server-mc.versions', name: 'Fabric' },
  { pattern: 'neoforge.jar', name: 'NeoForge' },
  { pattern: 'quilt-server-launch.launch', name: 'Quilt' },
  { pattern: 'velocity.toml', name: 'Velocity' },
  { pattern: 'waterfall.yml', name: 'Waterfall' },
  { pattern: 'folia.yml', name: 'Folia' },
  { pattern: 'mohist-config.yml', name: 'Mohist' },
  { pattern: 'magma.yml', name: 'Magma' },
  { pattern: 'libraries/net/minecraftforge/forge', name: 'Forge' },
];

export class ImportService {
  async analyze(sourcePath: string): Promise<DetectionResult> {
    const stats = fs.statSync(sourcePath);
    const isDir = stats.isDirectory();

    const detection: DetectionResult = {
      software: 'Unknown',
      version: 'Unknown',
      worldName: 'world',
      plugins: [],
      mods: [],
      datapacks: [],
      playerData: [],
      whitelist: [],
      operators: [],
      bannedPlayers: [],
      serverProperties: {},
      size: isDir ? this.getDirSize(sourcePath) : stats.size,
      javaVersion: 'Unknown',
      saveVersion: 0,
    };

    if (!isDir) {
      return detection;
    }

    // Detect server software
    for (const { pattern, name } of SOFTWARE_PATTERNS) {
      if (this.findFileRecursive(sourcePath, pattern)) {
        detection.software = name;
        break;
      }
    }

    // If no specific software detected, check for server jars
    if (detection.software === 'Unknown') {
      const jars = fs.readdirSync(sourcePath).filter(f => f.endsWith('.jar') && !f.startsWith('.'));

      // Look at the largest jar (likely the server jar)
      const serverJars = jars.filter(j => {
        const low = j.toLowerCase();
        return low.includes('paper') || low.includes('purpur') || low.includes('fabric') ||
               low.includes('forge') || low.includes('spigot') || low.includes('bukkit') ||
               low.includes('vanilla') || low.includes('server');
      });

      if (serverJars.length > 0) {
        const jar = serverJars[0].toLowerCase();
        if (jar.includes('paper')) detection.software = 'Paper';
        else if (jar.includes('purpur')) detection.software = 'Purpur';
        else if (jar.includes('fabric')) detection.software = 'Fabric';
        else if (jar.includes('forge')) detection.software = 'Forge';
        else if (jar.includes('spigot')) detection.software = 'Spigot';
        else if (jar.includes('bukkit')) detection.software = 'Bukkit';
        else if (jar.includes('vanilla') || jar.includes('server')) detection.software = 'Vanilla';
      }
    }

    // Detect version from server.properties or jar
    const propsPath = path.join(sourcePath, 'server.properties');
    if (fs.existsSync(propsPath)) {
      const content = fs.readFileSync(propsPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        detection.serverProperties[key] = val;
      }
    }

    // Try to get version from level.dat or jar files
    const worldDir = this.findWorldDirectory(sourcePath);
    if (worldDir) {
      detection.worldName = path.basename(worldDir);
    }

    // Version from level.dat
    const levelDat = path.join(worldDir || sourcePath, 'level.dat');
    if (fs.existsSync(levelDat)) {
      try {
        const buf = fs.readFileSync(levelDat);
        const dataView = new Uint8Array(buf);
        // Parse NBT-like data for version (simplified - read the DataVersion int)
        const str = buf.toString('latin1');
        const versionMatch = str.match(/DataVersion[^\d]*(\d+)/);
        if (versionMatch) {
          detection.saveVersion = parseInt(versionMatch[1]);
        }
      } catch {}
    }

    // Detect version from jar filename
    const jars = fs.readdirSync(sourcePath).filter(f => f.endsWith('.jar'));
    for (const jar of jars) {
      const match = jar.match(/(\d+\.\d+(?:\.\d+)?)/);
      if (match) {
        detection.version = match[1];
        break;
      }
    }

    // Plugins
    const pluginsDir = path.join(sourcePath, 'plugins');
    if (fs.existsSync(pluginsDir)) {
      detection.plugins = fs.readdirSync(pluginsDir)
        .filter(f => f.endsWith('.jar'))
        .map(f => f.replace('.jar', ''));
    }

    // Mods
    const modsDir = path.join(sourcePath, 'mods');
    if (fs.existsSync(modsDir)) {
      detection.mods = fs.readdirSync(modsDir)
        .filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled'))
        .map(f => f.replace(/\.(jar|jar\.disabled)$/, ''));
    }

    // Datapacks
    const worldDirPath = worldDir || sourcePath;
    const datapacksDir = path.join(worldDirPath, 'datapacks');
    if (fs.existsSync(datapacksDir)) {
      detection.datapacks = fs.readdirSync(datapacksDir).filter(f => fs.statSync(path.join(datapacksDir, f)).isDirectory());
    }

    // Player data
    const playerDataDir = path.join(worldDirPath, 'playerdata');
    if (fs.existsSync(playerDataDir)) {
      detection.playerData = fs.readdirSync(playerDataDir).filter(f => f.endsWith('.dat'));
    }

    // Whitelist
    const whitelistPath = path.join(sourcePath, 'whitelist.json');
    if (fs.existsSync(whitelistPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(whitelistPath, 'utf-8'));
        detection.whitelist = (Array.isArray(data) ? data : []).map((e: any) => e.name || e.uuid || '');
      } catch {}
    }

    // Operators
    const opsPath = path.join(sourcePath, 'ops.json');
    if (fs.existsSync(opsPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(opsPath, 'utf-8'));
        detection.operators = (Array.isArray(data) ? data : []).map((e: any) => e.name || e.uuid || '');
      } catch {}
    }

    // Banned players
    const bannedPath = path.join(sourcePath, 'banned-players.json');
    if (fs.existsSync(bannedPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(bannedPath, 'utf-8'));
        detection.bannedPlayers = (Array.isArray(data) ? data : []).map((e: any) => e.name || e.uuid || '');
      } catch {}
    }

    // Java version
    try {
      const ver = execSync('"java" -version 2>&1', { encoding: 'utf-8', timeout: 5000 });
      detection.javaVersion = ver.split('\n')[0] || 'Unknown';
    } catch {}

    return detection;
  }

  async import(sourcePath: string, config: ImportConfig): Promise<ImportResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    const stats = fs.statSync(sourcePath);
    const isZip = !stats.isDirectory();
    let extractDir = sourcePath;

    if (isZip) {
      try {
        extractDir = await this.extractArchive(sourcePath);
      } catch (err: any) {
        return { success: false, warnings: [], errors: [`Failed to extract archive: ${err.message}`] };
      }
    }

    let detection: DetectionResult;
    try {
      detection = await this.analyze(extractDir);
    } catch (err: any) {
      return { success: false, warnings: [], errors: [`Failed to analyze source: ${err.message}`] };
    }

    // Create backup of current server
    try {
      await this.createBackup();
    } catch (err: any) {
      warnings.push(`Failed to create safety backup: ${err.message}`);
    }

    // Create server entry
    const db = getDatabase();
    const serverName = config.name || detection.worldName || 'Imported Server';
    let slug = generateSlug(serverName);
    const existing = db.prepare('SELECT id FROM servers WHERE slug = ?').get(slug);
    if (existing) slug = `${slug}-${Date.now()}`;

    const id = uuidv4();
    const serverDir = resolvePath('servers', slug);
    const version = config.version || detection.version || '1.21.4';
    const software = config.software || detection.software || 'Paper';
    const jarPrefix = software.toLowerCase();
    const jarFile = `${jarPrefix}-${version}.jar`;

    // Create server directories
    for (const sub of ['plugins', 'worlds', 'backups', 'logs', 'config']) {
      const p = path.join(serverDir, sub);
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    }

    // Copy world data
    const worldDir = this.findWorldDirectory(extractDir);
    const targetWorldDir = path.join(serverDir, 'worlds', detection.worldName || 'world');

    if (worldDir && fs.existsSync(worldDir)) {
      this.copyRecursive(worldDir, targetWorldDir);
    } else if (fs.existsSync(path.join(extractDir, 'world'))) {
      this.copyRecursive(path.join(extractDir, 'world'), targetWorldDir);
    }

    // Copy plugins
    const sourcePluginsDir = path.join(extractDir, 'plugins');
    const targetPluginsDir = path.join(serverDir, 'plugins');
    if (fs.existsSync(sourcePluginsDir)) {
      this.copyRecursive(sourcePluginsDir, targetPluginsDir);
    }

    // Copy mods if applicable
    const sourceModsDir = path.join(extractDir, 'mods');
    const targetModsDir = path.join(serverDir, 'mods');
    if (fs.existsSync(sourceModsDir)) {
      this.copyRecursive(sourceModsDir, targetModsDir);
    }

    // Copy server.properties
    const sourceProps = path.join(extractDir, 'server.properties');
    if (fs.existsSync(sourceProps)) {
      const content = fs.readFileSync(sourceProps, 'utf-8');
      let props = content;
      // Override key settings
      if (config.port) {
        props = props.replace(/^server-port=.*/m, `server-port=${config.port}`);
        if (!props.includes('server-port=')) props += `\nserver-port=${config.port}`;
      }
      if (config.onlineMode !== undefined) {
        props = props.replace(/^online-mode=.*/m, `online-mode=${config.onlineMode}`);
        if (!props.includes('online-mode=')) props += `\nonline-mode=${config.onlineMode}`;
      }
      if (config.maxPlayers) {
        props = props.replace(/^max-players=.*/m, `max-players=${config.maxPlayers}`);
        if (!props.includes('max-players=')) props += `\nmax-players=${config.maxPlayers}`;
      }
      props = props.replace(/^server-ip=.*/m, 'server-ip=');
      fs.writeFileSync(path.join(serverDir, 'server.properties'), props, 'utf-8');
    } else {
      // Generate default properties
      let props = `server-port=${config.port || 25565}\nonline-mode=${config.onlineMode ? 'true' : 'false'}\nmax-players=${config.maxPlayers || 4}\nserver-ip=\n`;
      fs.writeFileSync(path.join(serverDir, 'server.properties'), props, 'utf-8');
    }

    // Copy whitelist
    const sourceWhitelist = path.join(extractDir, 'whitelist.json');
    if (fs.existsSync(sourceWhitelist)) {
      fs.copyFileSync(sourceWhitelist, path.join(serverDir, 'whitelist.json'));
    }

    // Copy ops
    const sourceOps = path.join(extractDir, 'ops.json');
    if (fs.existsSync(sourceOps)) {
      fs.copyFileSync(sourceOps, path.join(serverDir, 'ops.json'));
    }

    // Copy banned players
    const sourceBanned = path.join(extractDir, 'banned-players.json');
    if (fs.existsSync(sourceBanned)) {
      fs.copyFileSync(sourceBanned, path.join(serverDir, 'banned-players.json'));
    }

    // Get server software source
    const versionSource = software === 'Paper' ? 'PaperMC' : software === 'Vanilla' ? 'Mojang' : software;

    // Insert into database
    db.prepare(`
      INSERT INTO servers (id, name, slug, port, directory, version, version_source, jarFile, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'stopped')
    `).run(
      id, serverName, slug,
      config.port || 25565,
      serverDir,
      version, versionSource,
      jarFile,
    );

    // Set as active server
    db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('active_server_id', ?)").run(id);
    setMinecraftDir(serverDir);
    minecraftServer.loadServer(serverDir);

    // Clean up extracted files if ZIP
    if (isZip && extractDir !== sourcePath) {
      try {
        fs.rmSync(extractDir, { recursive: true, force: true });
      } catch {}
    }

    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as any;

    return {
      success: true,
      server,
      warnings,
      errors,
      detected: detection,
    };
  }

  private async extractArchive(archivePath: string): Promise<string> {
    const ext = path.extname(archivePath).toLowerCase();
    const baseName = path.basename(archivePath, ext);
    const extractDir = path.join(path.dirname(archivePath), `__extracted_${baseName}_${Date.now()}`);

    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });

    if (ext === '.zip') {
      const unzipper = require('unzipper');
      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(archivePath)
          .pipe(unzipper.Extract({ path: extractDir }))
          .on('close', resolve)
          .on('error', reject);
      });
    } else if (ext === '.rar' || ext === '.7z') {
      try {
        execSync(`"${this.findExtractor()}" x "${archivePath}" -o"${extractDir}" -y`, { timeout: 120000 });
      } catch (err: any) {
        throw new Error(`Failed to extract ${ext} archive: ${err.message}. Install 7-Zip or WinRAR.`);
      }
    } else {
      throw new Error(`Unsupported archive format: ${ext}`);
    }

    return extractDir;
  }

  private findExtractor(): string {
    const candidates = [
      'C:\\Program Files\\7-Zip\\7z.exe',
      'C:\\Program Files (x86)\\7-Zip\\7z.exe',
      '7z',
    ];
    for (const c of candidates) {
      try {
        execSync(`"${c}" --help`, { timeout: 3000, stdio: 'ignore' });
        return c;
      } catch {}
    }
    return '7z';
  }

  private findWorldDirectory(dir: string): string | null {
    const candidates = ['world', 'worlds'];
    for (const c of candidates) {
      const p = path.join(dir, c);
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        // Check for level.dat
        if (fs.existsSync(path.join(p, 'level.dat'))) {
          return p;
        }
        // Check for region directory
        if (fs.existsSync(path.join(p, 'region'))) {
          return p;
        }
      }
    }

    // Scan subdirectories for level.dat
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          if (fs.existsSync(path.join(full, 'level.dat')) ||
              fs.existsSync(path.join(full, 'region'))) {
            return full;
          }
        }
      }
    } catch {}

    return null;
  }

  private getDirSize(dir: string): number {
    let total = 0;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isFile()) total += fs.statSync(p).size;
        else if (e.isDirectory()) total += this.getDirSize(p);
      }
    } catch {}
    return total;
  }

  private findFileRecursive(dir: string, target: string): boolean {
    try {
      const entries = fs.readdirSync(dir);
      if (entries.includes(target)) return true;
      for (const entry of entries) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          if (this.findFileRecursive(full, target)) return true;
        }
      }
    } catch {}
    return false;
  }

  private copyRecursive(src: string, dest: string) {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isFile()) {
        fs.copyFileSync(srcPath, destPath);
      } else if (entry.isDirectory()) {
        this.copyRecursive(srcPath, destPath);
      }
    }
  }

  private async createBackup(): Promise<void> {
    const { backupService } = require('./backup');
    await backupService.createBackup(
      `Pre-Import-Backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`,
      'auto',
      false
    );
  }
}

export interface ImportConfig {
  name: string;
  software: string;
  version: string;
  port: number;
  onlineMode: boolean;
  maxPlayers: number;
  ram?: string;
  worldName?: string;
}

export const importService = new ImportService();
