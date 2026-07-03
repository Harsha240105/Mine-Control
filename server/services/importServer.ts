import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import { getDatabase, generateSlug } from '../database';
import { setMinecraftDir, resolvePath } from '../paths';
import { minecraftServer } from './minecraftServer';
import { emitToAll } from '../socketManager';

interface ImportResult {
  success: boolean;
  server?: any;
  warnings: string[];
  errors: string[];
  summary?: ImportSummary;
}

interface WorldAnalysis {
  worldName: string;
  worldUuid: string;
  minecraftVersion: string;
  serverSoftware: string;
  seed: string;
  worldSize: number;
  worldSizeFormatted: string;
  regionCount: number;
  loadedChunks: number;
  dimensionCount: number;
  hasOverworld: boolean;
  hasNether: boolean;
  hasEnd: boolean;
  playerCount: number;
  playerNames: string[];
  lastPlayed: string | null;
  gameMode: string;
  difficulty: string;
  hardcore: boolean;
  onlineMode: boolean;
  datapacks: string[];
  mods: string[];
  plugins: string[];
}

interface PlayerAnalysis {
  username: string;
  uuid: string;
  inventory: any[];
  xpLevel: number;
  health: number;
  food: number;
  coordinates: { x: number; y: number; z: number };
  dimension: string;
  lastSeen: string | null;
  playTime: number;
  deaths: number;
  advancements: Record<string, any>;
  statistics: Record<string, any>;
}

interface ImportSummary {
  type: 'full-server' | 'world' | 'mc-backup' | 'invalid';
  world: WorldAnalysis | null;
  players: PlayerAnalysis[];
  validation: { valid: boolean; reason?: string };
  sourcePath: string;
  sourceSize: number;
  software: string;
  version: string;
}

export interface ImportConfig {
  name: string;
  software?: string;
  version?: string;
  port?: number;
  onlineMode?: boolean;
  maxPlayers?: number;
  ram?: string;
  worldName?: string;
  destinationType: 'new' | 'existing';
  destinationServerId?: string;
  importMode?: 'replace' | 'additional';
}

const SOFTWARE_PATTERNS: { pattern: string; name: string }[] = [
  { pattern: 'paper.yml', name: 'Paper' },
  { pattern: 'purpur.yml', name: 'Purpur' },
  { pattern: 'bukkit.yml', name: 'Bukkit' },
  { pattern: 'spigot.yml', name: 'Spigot' },
  { pattern: 'pufferfish.yml', name: 'Pufferfish' },
  { pattern: 'fabric.mod.json', name: 'Fabric' },
  { pattern: 'fabric-server-launch.jar', name: 'Fabric' },
  { pattern: 'fabric-server-mc.versions', name: 'Fabric' },
  { pattern: 'neoforge.jar', name: 'NeoForge' },
  { pattern: 'quilt-server-launch.launch', name: 'Quilt' },
  { pattern: 'velocity.toml', name: 'Velocity' },
  { pattern: 'waterfall.yml', name: 'Waterfall' },
  { pattern: 'folia.yml', name: 'Folia' },
  { pattern: 'mohist-config.yml', name: 'Mohist' },
  { pattern: 'magma.yml', name: 'Magma' },
  { pattern: 'libraries/net/minecraftforge/forge', name: 'Forge' },
  { pattern: 'arclight.jar', name: 'Arclight' },
];

class ImportError extends Error {
  public stage: string;
  public func: string;
  public file: string;
  public cause: string;
  public suggestedFix: string;

  constructor(opts: {
    stage: string;
    func: string;
    file: string;
    message: string;
    cause?: string;
    suggestedFix?: string;
  }) {
    super(opts.message);
    this.stage = opts.stage;
    this.func = opts.func;
    this.file = opts.file;
    this.cause = opts.cause || opts.message;
    this.suggestedFix = opts.suggestedFix || 'Check the import source and try again.';
  }

  toJSON() {
    return {
      stage: this.stage,
      func: this.func,
      file: this.file,
      message: this.message,
      cause: this.cause,
      suggestedFix: this.suggestedFix,
      stack: this.stack,
    };
  }
}

const ImportLogger = {
  step: (msg: string) => console.log(`[Import] ${msg}`),
  warn: (msg: string) => console.warn(`[Import] ⚠ ${msg}`),
  error: (msg: string) => console.error(`[Import] ✗ ${msg}`),
  data: (label: string, data: any) => console.log(`[Import] ${label}:`, data),
};

function intArrayToUuid(arr: number[]): string {
  if (!arr || arr.length < 4) return '';
  const hex = arr.map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class ImportService {

  // ── STEP 1: Universal Auto-Detection ──
  async analyze(sourcePath: string): Promise<{
    type: 'full-server' | 'world' | 'mc-backup' | 'invalid';
    world: WorldAnalysis | null;
    detection: any;
  }> {
    const stats = fs.statSync(sourcePath);
    const isDir = stats.isDirectory();
    let cleanupDir: string | null = null;

    ImportLogger.step(`Analyzing import source: ${sourcePath}`);

    if (!isDir) {
      try {
        const extracted = await this.extractArchive(sourcePath);
        cleanupDir = extracted;
        sourcePath = extracted;
        ImportLogger.step(`Extracted to: ${extracted}`);
      } catch (err: any) {
        return {
          type: 'invalid',
          world: null,
          detection: { error: `Failed to extract archive: ${err.message}` },
        };
      }
    }

    const type = this.detectContentType(sourcePath);
    ImportLogger.step(`Detected type: ${type}`);

    let world: WorldAnalysis | null = null;
    let detection: any = {};

    if (type !== 'invalid') {
      const worldDir = this.findWorldDirectory(sourcePath);
      if (worldDir) {
        ImportLogger.step(`World root: ${worldDir}`);
        world = await this.analyzeWorld(worldDir, type === 'full-server' ? sourcePath : undefined);
      } else if (type === 'full-server') {
        const worlds = this.findAllWorlds(sourcePath);
        if (worlds.length > 0) {
          ImportLogger.step(`Found world: ${worlds[0]}`);
          world = await this.analyzeWorld(worlds[0], sourcePath);
        }
      }
      if (!world) {
        ImportLogger.warn('No world data found in source');
      } else {
        ImportLogger.data('World detected', { name: world.worldName, software: world.serverSoftware, version: world.minecraftVersion, players: world.playerCount, uuid: world.worldUuid });
      }
    }

    detection = {
      type,
      software: world?.serverSoftware || 'Unknown',
      version: world?.minecraftVersion || 'Unknown',
      worldName: world?.worldName || 'Unknown',
      plugins: world?.plugins || [],
      mods: world?.mods || [],
      datapacks: world?.datapacks || [],
      playerCount: world?.playerCount || 0,
      playerNames: world?.playerNames || [],
      size: isDir ? this.getDirSize(sourcePath) : stats.size,
      sizeFormatted: this.formatBytes(isDir ? this.getDirSize(sourcePath) : stats.size),
    };

    if (cleanupDir && fs.existsSync(cleanupDir)) {
      try { fs.rmSync(cleanupDir, { recursive: true, force: true }); } catch {}
    }

    return { type, world, detection };
  }

  // ── Content type detection ──
  private detectContentType(sourcePath: string): 'full-server' | 'world' | 'mc-backup' | 'invalid' {
    const backupMeta = path.join(sourcePath, '.mcbackup.json');
    if (fs.existsSync(backupMeta)) return 'mc-backup';

    const levelDat = this.findFileRecursive(sourcePath, 'level.dat');
    if (!levelDat) {
      console.log(`[Import] No level.dat found anywhere in source`);
      return 'invalid';
    }
    console.log(`[Import] level.dat found at: ${levelDat}`);

    const hasServerProps = this.findFileRecursive(sourcePath, 'server.properties');
    const hasServerJar = fs.existsSync(path.join(sourcePath, 'server.jar')) ||
      fs.existsSync(path.join(sourcePath, 'fabric-server-launch.jar'));
    const hasGenericJar = fs.readdirSync(sourcePath).some(f => f.endsWith('.jar') && !f.startsWith('.'));
    const hasPlugins = fs.existsSync(path.join(sourcePath, 'plugins'));
    const hasMods = fs.existsSync(path.join(sourcePath, 'mods'));
    const hasEula = this.findFileRecursive(sourcePath, 'eula.txt');

    if (hasServerProps && (hasServerJar || hasGenericJar || hasPlugins || hasMods || hasEula)) {
      console.log(`[Import] Detected as full server: server.props=${!!hasServerProps}, jars=${hasServerJar || hasGenericJar}, plugins=${hasPlugins}, mods=${hasMods}`);
      return 'full-server';
    }

    const worldDir = this.findWorldDirectory(sourcePath);
    if (worldDir) {
      console.log(`[Import] Detected as world: ${worldDir}`);
      return 'world';
    }

    const levelDatDir = path.dirname(levelDat);
    if (this.hasChunkStorage(levelDatDir)) {
      console.log(`[Import] Detected as world (by chunk storage): ${levelDatDir}`);
      return 'world';
    }

    console.log(`[Import] Invalid: level.dat found but no chunk storage or server markers`);
    return 'invalid';
  }

  // ── STEP 2: World Analysis (async for NBT parsing) ──
  async analyzeWorld(worldPath: string, serverPath?: string): Promise<WorldAnalysis> {
    const info = this.getWorldInfo(worldPath);
    const lvl = await this.readLevelDatAsync(worldPath);
    const dims = this.scanDimensions(worldPath);

    let software = 'Vanilla';
    let mods: string[] = [];
    let plugins: string[] = [];

    if (serverPath) {
      software = this.detectServerSoftware(serverPath);

      const pluginsDir = path.join(serverPath, 'plugins');
      if (fs.existsSync(pluginsDir)) {
        plugins = fs.readdirSync(pluginsDir)
          .filter(f => f.endsWith('.jar'))
          .map(f => f.replace('.jar', ''));
      }

      const modsDir = path.join(serverPath, 'mods');
      if (fs.existsSync(modsDir)) {
        mods = fs.readdirSync(modsDir)
          .filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled'))
          .map(f => f.replace(/\.(jar|jar\.disabled)$/, ''));
      }
    } else {
      // Even without serverPath, check world dir for software markers
      if (fs.existsSync(path.join(worldPath, 'serverconfig'))) {
        software = 'Fabric';
      }
      if (fs.existsSync(path.join(worldPath, 'defaultconfigs'))) {
        if (software === 'Vanilla') software = 'Forge';
        else software = 'Forge/NeoForge';
      }
    }

    const datapacksDir = path.join(worldPath, 'datapacks');
    let datapacks: string[] = [];
    if (fs.existsSync(datapacksDir)) {
      datapacks = fs.readdirSync(datapacksDir).filter(f => fs.statSync(path.join(datapacksDir, f)).isDirectory());
    }

    // Scan players from both playerdata/ and players/ directories
    let playerNames: string[] = [];
    let playerCount = 0;

    const playerDataDir = path.join(worldPath, 'playerdata');
    if (fs.existsSync(playerDataDir)) {
      const files = fs.readdirSync(playerDataDir).filter(f => f.endsWith('.dat'));
      playerCount += files.length;
      playerNames.push(...files.map(f => f.replace('.dat', '')));
    }

    const playersDir = path.join(worldPath, 'players');
    if (fs.existsSync(playersDir)) {
      try {
        const entries = fs.readdirSync(playersDir);
        for (const entry of entries) {
          const full = path.join(playersDir, entry);
          if (fs.statSync(full).isFile() && (entry.endsWith('.dat') || entry.endsWith('.json'))) {
            const uuid = entry.replace(/\.(dat|json)$/, '');
            if (uuid.includes('-') && !playerNames.includes(uuid)) {
              playerCount++;
              playerNames.push(uuid);
            }
          }
        }
      } catch {}
    }

    // Resolve UUIDs to names from usercache / whitelist / ops
    const nameMap = new Map<string, string>();
    if (serverPath) {
      const usercache = this.readJsonFile(path.join(serverPath, 'usercache.json'));
      if (Array.isArray(usercache)) {
        for (const entry of usercache) {
          if (entry.name && entry.uuid) nameMap.set(entry.uuid, entry.name);
        }
      }
      const whitelist = this.readJsonFile(path.join(serverPath, 'whitelist.json'));
      if (Array.isArray(whitelist)) {
        for (const entry of whitelist) {
          if (entry.name && entry.uuid) nameMap.set(entry.uuid, entry.name);
        }
      }
      const ops = this.readJsonFile(path.join(serverPath, 'ops.json'));
      if (Array.isArray(ops)) {
        for (const entry of ops) {
          if (entry.name && entry.uuid) nameMap.set(entry.uuid, entry.name);
        }
      }
    }

    const resolvedNames = playerNames.map(u => nameMap.get(u) || u);

    // Detect dimensions using multiple layout patterns
    const dimInfo = this.detectDimensions(worldPath);

    let onlineMode = false;
    if (serverPath) {
      const propsPath = path.join(serverPath, 'server.properties');
      if (fs.existsSync(propsPath)) {
        const content = fs.readFileSync(propsPath, 'utf-8');
        const match = content.match(/^online-mode=(.*)$/m);
        if (match) onlineMode = match[1].trim() === 'true';
      }
    }

    return {
      worldName: path.basename(worldPath),
      worldUuid: lvl.worldUuid || '',
      minecraftVersion: lvl.version || info.version || 'Unknown',
      serverSoftware: software,
      seed: String(lvl.seed ?? ''),
      worldSize: info.totalSize,
      worldSizeFormatted: this.formatBytes(info.totalSize),
      regionCount: info.totalRegions,
      loadedChunks: info.totalChunks,
      dimensionCount: dimInfo.count,
      hasOverworld: dimInfo.hasOverworld,
      hasNether: dimInfo.hasNether,
      hasEnd: dimInfo.hasEnd,
      playerCount: playerCount,
      playerNames: resolvedNames,
      lastPlayed: lvl.lastPlayed || info.lastPlayed || null,
      gameMode: lvl.gamemode !== undefined ? ['Survival', 'Creative', 'Adventure', 'Spectator'][lvl.gamemode] || 'Survival' : 'Survival',
      difficulty: lvl.difficulty !== undefined ? ['Peaceful', 'Easy', 'Normal', 'Hard'][lvl.difficulty] || 'Normal' : 'Normal',
      hardcore: !!lvl.hardcore,
      onlineMode,
      datapacks,
      mods,
      plugins,
    };
  }

  // ── STEP 3: Player Analysis ──
  analyzePlayers(worldPath: string): PlayerAnalysis[] {
    const players: PlayerAnalysis[] = [];
    const seen = new Set<string>();

    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (!file.endsWith('.dat')) continue;
          const uuid = file.replace('.dat', '');
          if (seen.has(uuid)) continue;
          seen.add(uuid);

          const filePath = path.join(dir, file);
          try {
            const buf = fs.readFileSync(filePath);
            const str = buf.toString('latin1');
            const data: any = {};

            const xpMatch = str.match(/XpLevel[^\d]*(\d+)/);
            if (xpMatch) data.XpLevel = parseInt(xpMatch[1]);

            const healthMatch = str.match(/Health[^\d]*([\d.]+)/);
            if (healthMatch) data.Health = parseFloat(healthMatch[1]);

            const foodMatch = str.match(/foodLevel[^\d]*(\d+)/);
            if (foodMatch) data.foodLevel = parseInt(foodMatch[1]);

            const deathMatch = str.match(/DeathCount[^\d]*(\d+)/);
            if (deathMatch) data.DeathCount = parseInt(deathMatch[1]);

            const timeMatch = str.match(/PlayTime[^\d]*(\d+)/);
            if (timeMatch) data.PlayTime = parseInt(timeMatch[1]);

            const dimMatch = str.match(/Dimension[^\d]*(-?\d+)/);
            if (dimMatch) {
              const dim = parseInt(dimMatch[1]);
              data.Dimension = dim === -1 ? 'minecraft:nether' : dim === 1 ? 'minecraft:end' : 'minecraft:overworld';
            }

            const posMatch = str.match(/Pos[^]]*\[([\d.-]+),\s*([\d.-]+),\s*([\d.-]+)\]/);
            if (posMatch) data.Pos = [parseFloat(posMatch[1]), parseFloat(posMatch[2]), parseFloat(posMatch[3])];

            players.push({
              username: uuid,
              uuid,
              inventory: [],
              xpLevel: data.XpLevel ?? 0,
              health: data.Health ?? 20,
              food: data.foodLevel ?? 20,
              coordinates: {
                x: data.Pos?.[0] ?? 0,
                y: data.Pos?.[1] ?? 64,
                z: data.Pos?.[2] ?? 0,
              },
              dimension: data.Dimension ?? 'minecraft:overworld',
              lastSeen: null,
              playTime: data.PlayTime ?? 0,
              deaths: data.DeathCount ?? 0,
              advancements: {},
              statistics: {},
            });
          } catch {}
        }
      } catch {}
    };

    scanDir(path.join(worldPath, 'playerdata'));
    scanDir(path.join(worldPath, 'players'));

    return players;
  }

  // ── STEP 8: Validation ──
  validateImport(worldPath: string): { valid: boolean; reason?: string } {
    const levelDat = path.join(worldPath, 'level.dat');
    if (!fs.existsSync(levelDat)) {
      return { valid: false, reason: 'Missing level.dat - this is not a valid Minecraft world.' };
    }

    // Check for chunk storage in ANY known layout pattern
    if (!this.hasChunkStorage(worldPath)) {
      return { valid: false, reason: 'No world data found (region files) - this world appears empty or corrupt.' };
    }

    return { valid: true };
  }

  // ── Check for chunk storage in any layout ──
  private hasChunkStorage(worldPath: string): boolean {
    // Vanilla layout
    if (this.hasRegionFiles(path.join(worldPath, 'region'))) return true;
    if (this.hasRegionFiles(path.join(worldPath, 'DIM-1', 'region'))) return true;
    if (this.hasRegionFiles(path.join(worldPath, 'DIM1', 'region'))) return true;

    // Fabric/Aternos layout: dimensions/<namespace>/<dimension>/region/
    const dimensionsDir = path.join(worldPath, 'dimensions');
    if (fs.existsSync(dimensionsDir)) {
      try {
        const namespaces = fs.readdirSync(dimensionsDir);
        for (const ns of namespaces) {
          const nsPath = path.join(dimensionsDir, ns);
          if (!fs.statSync(nsPath).isDirectory()) continue;
          const dims = fs.readdirSync(nsPath);
          for (const dim of dims) {
            const regionDir = path.join(nsPath, dim, 'region');
            if (this.hasRegionFiles(regionDir)) return true;
          }
        }
      } catch {}
    }

    // Check world root for region files directly (some exports)
    if (this.hasRegionFiles(worldPath)) return true;

    return false;
  }

  private hasRegionFiles(dir: string): boolean {
    try {
      if (!fs.existsSync(dir)) return false;
      return fs.readdirSync(dir).some(f => f.endsWith('.mca'));
    } catch {
      return false;
    }
  }

  // ── STEP 9: Import Summary ──
  async getImportSummary(sourcePath: string): Promise<ImportSummary> {
    const stats = fs.statSync(sourcePath);
    const isDir = stats.isDirectory();
    let cleanupDir: string | null = null;

    if (!isDir) {
      const extracted = await this.extractArchive(sourcePath);
      cleanupDir = extracted;
      sourcePath = extracted;
    }

    ImportLogger.step(`Generating import summary for: ${sourcePath}`);
    const type = this.detectContentType(sourcePath);
    const result: ImportSummary = {
      type,
      world: null,
      players: [],
      validation: { valid: false, reason: 'Invalid import source' },
      sourcePath,
      sourceSize: isDir ? this.getDirSize(sourcePath) : stats.size,
      software: 'Unknown',
      version: 'Unknown',
    };

    if (type !== 'invalid') {
      const worldDir = this.findWorldDirectory(sourcePath);
      if (worldDir) {
        result.validation = this.validateImport(worldDir);
        if (result.validation.valid) {
          result.world = await this.analyzeWorld(worldDir, type === 'full-server' ? sourcePath : undefined);
          result.players = this.analyzePlayers(worldDir);
          result.software = result.world?.serverSoftware || 'Unknown';
          result.version = result.world?.minecraftVersion || 'Unknown';
        }
      }
    }

    console.log(`[Import Summary] Type=${type}, Valid=${result.validation.valid}, Software=${result.software}, Version=${result.version}`);

    if (cleanupDir && fs.existsSync(cleanupDir)) {
      try { fs.rmSync(cleanupDir, { recursive: true, force: true }); } catch {}
    }

    return result;
  }

  // ── STEP 6+10: Execute Import ──
  async import(sourcePath: string, config: ImportConfig): Promise<ImportResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    const stats = fs.statSync(sourcePath);
    const isZip = !stats.isDirectory();
    let extractDir = sourcePath;

    ImportLogger.step(`Starting import: ${sourcePath}`);

    if (isZip) {
      try {
        ImportLogger.step(`Extracting archive: ${sourcePath}`);
        extractDir = await this.extractArchive(sourcePath);
        ImportLogger.step(`Extracted to: ${extractDir}`);
      } catch (err: any) {
        ImportLogger.error(`Extraction failed: ${err.message}`);
        return { success: false, warnings: [], errors: [`Failed to extract archive: ${err.message}`] };
      }
    }

    ImportLogger.step(`Detecting content type`);
    const type = this.detectContentType(extractDir);
    ImportLogger.step(`Detected type: ${type}`);

    if (type === 'invalid') {
      return { success: false, warnings: [], errors: ['Invalid import source: no Minecraft data detected.'] };
    }

    const worldDir = this.findWorldDirectory(extractDir);
    if (!worldDir) {
      return { success: false, warnings: [], errors: ['No Minecraft world directory found in import source.'] };
    }

    ImportLogger.step(`World root: ${worldDir}`);

    const validation = this.validateImport(worldDir);
    ImportLogger.step(`Validation: ${validation.valid ? 'PASS' : 'FAIL'}${validation.reason ? ` - ${validation.reason}` : ''}`);

    if (!validation.valid) {
      return { success: false, warnings: [], errors: [validation.reason || 'Invalid world data.'] };
    }

    const db = getDatabase();

    let serverId: string;
    let serverDir: string;
    let serverName: string;

    if (config.destinationType === 'existing' && config.destinationServerId) {
      const existing = db.prepare('SELECT * FROM servers WHERE id = ?').get(config.destinationServerId) as any;
      if (!existing) {
        ImportLogger.error(`Destination server not found: ${config.destinationServerId}`);
        return { success: false, warnings: [], errors: ['Selected destination server not found.'] };
      }
      serverId = existing.id;
      serverDir = existing.directory;
      serverName = existing.name;
      ImportLogger.step(`Importing to existing server: ${serverName} (${serverId})`);
    } else {
      serverName = config.name || path.basename(sourcePath).replace(/\.(zip|rar|7z)$/i, '') || 'Imported Server';
      let slug = generateSlug(serverName);
      const existing = db.prepare('SELECT id FROM servers WHERE slug = ?').get(slug);
      if (existing) slug = `${slug}-${Date.now()}`;

      serverId = uuidv4();
      serverDir = resolvePath('servers', slug);
      ImportLogger.step(`Creating new server: ${serverName} -> ${serverDir}`);

      const version = config.version || (await this.detectVersionFromSource(extractDir, worldDir)) || '1.21.4';
      const software = config.software || this.detectServerSoftware(extractDir) || 'Paper';
      const jarFile = `${software.toLowerCase()}-${version}.jar`;

      for (const sub of ['plugins', 'worlds', 'backups', 'logs', 'config']) {
        const p = path.join(serverDir, sub);
        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
      }

      db.prepare(`
        INSERT INTO servers (id, name, slug, port, directory, version, version_source, jarFile, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'stopped')
      `).run(
        serverId, serverName, slug,
        config.port || 25565,
        serverDir,
        version,
        software === 'Paper' ? 'PaperMC' : software === 'Vanilla' ? 'Mojang' : software,
        jarFile,
      );
      ImportLogger.step(`Server created in database: ${slug}`);
    }

    ImportLogger.step(`Analyzing world structure`);
    const worldInfo = await this.analyzeWorld(worldDir, type === 'full-server' ? extractDir : undefined);
    ImportLogger.data('World analysis', { name: worldInfo.worldName, uuid: worldInfo.worldUuid, software: worldInfo.serverSoftware, version: worldInfo.minecraftVersion });

    const levelName = config.worldName || worldInfo.worldName || 'world';
    const targetWorldDir = path.join(serverDir, levelName);

    if (config.destinationType === 'existing') {
      const replaceMode = config.importMode === 'replace';
      if (replaceMode) {
        ImportLogger.step(`Replacing existing world: ${targetWorldDir}`);
        if (fs.existsSync(targetWorldDir)) {
          fs.rmSync(targetWorldDir, { recursive: true, force: true });
        }
      } else {
        const altName = `${levelName}-imported-${Date.now()}`;
        const finalTarget = path.join(serverDir, altName);
        ImportLogger.step(`Importing as additional world: ${altName}`);
        this.importWorldData(worldDir, finalTarget);
        this.registerWorldInDb(finalTarget, altName, worldInfo, serverId, type);
        warnings.push(`Imported as additional world: ${altName}`);

        if (isZip && extractDir !== sourcePath) {
          try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
        }

        const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
        emitToAll('server:updated', server);
        ImportLogger.step(`Success: ${altName} imported as additional world`);
        return { success: true, server, warnings, errors: [], summary: undefined };
      }
    }

    ImportLogger.step(`Copying world data to: ${targetWorldDir}`);
    this.importWorldData(worldDir, targetWorldDir);

    ImportLogger.step(`Updating server.properties`);
    const propsPath = path.join(serverDir, 'server.properties');
    if (fs.existsSync(propsPath)) {
      let content = fs.readFileSync(propsPath, 'utf-8');
      if (content.includes('level-name=')) {
        content = content.replace(/^level-name=.*$/m, `level-name=${levelName}`);
      } else {
        content += `\nlevel-name=${levelName}\n`;
      }
      fs.writeFileSync(propsPath, content, 'utf-8');
    }

    ImportLogger.step(`Copying config files`);
    this.copyConfigFiles(extractDir, serverDir);
    this.registerWorldInDb(targetWorldDir, levelName, worldInfo, serverId, type);
    ImportLogger.step(`World registered in database`);

    if (config.destinationType !== 'existing') {
      db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('active_server_id', ?)").run(serverId);
      setMinecraftDir(serverDir);
      minecraftServer.loadServer(serverDir);
      ImportLogger.step(`Server activated`);
    }

    if (isZip && extractDir !== sourcePath) {
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
    }

    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
    emitToAll('server:updated', server);
    emitToAll('world:created', { name: levelName, server_id: serverId });

    ImportLogger.step(`Import complete: ${serverName}, World: ${levelName}, Software: ${worldInfo.serverSoftware}, Version: ${worldInfo.minecraftVersion}`);
    return { success: true, server, warnings, errors };
  }

  // ── Private Helpers ──

  private importWorldData(worldDir: string, targetWorldDir: string) {
    if (!fs.existsSync(targetWorldDir)) fs.mkdirSync(targetWorldDir, { recursive: true });

    // Copy all world content preserving everything — support all layout patterns
    const preserveDirs = [
      'region', 'DIM-1', 'DIM1',
      'playerdata', 'players',
      'stats', 'advancements',
      'poi', 'entities', 'data',
      'datapacks', 'dimensions',
      'serverconfig', 'defaultconfigs',
    ];

    for (const dir of preserveDirs) {
      const src = path.join(worldDir, dir);
      if (fs.existsSync(src)) {
        this.copyRecursive(src, path.join(targetWorldDir, dir));
      }
    }

    // Copy level.dat (always)
    const srcLevel = path.join(worldDir, 'level.dat');
    if (fs.existsSync(srcLevel)) {
      fs.copyFileSync(srcLevel, path.join(targetWorldDir, 'level.dat'));
    }

    const srcSession = path.join(worldDir, 'session.lock');
    if (fs.existsSync(srcSession)) {
      try { fs.copyFileSync(srcSession, path.join(targetWorldDir, 'session.lock')); } catch {}
    }

    // Copy any remaining top-level files/folders not already handled
    try {
      const entries = fs.readdirSync(worldDir);
      for (const entry of entries) {
        const src = path.join(worldDir, entry);
        const dest = path.join(targetWorldDir, entry);
        if (!fs.existsSync(dest)) {
          try {
            if (fs.statSync(src).isFile()) {
              fs.copyFileSync(src, dest);
            } else if (fs.statSync(src).isDirectory()) {
              this.copyRecursive(src, dest);
            }
          } catch {}
        }
      }
    } catch {}
  }

  private copyConfigFiles(extractDir: string, serverDir: string) {
    const configFiles = ['server.properties', 'eula.txt', 'whitelist.json', 'ops.json',
      'banned-players.json', 'banned-ips.json', 'bukkit.yml', 'spigot.yml', 'paper.yml',
      'purpur.yml', 'commands.yml', 'help.yml', 'permissions.yml'];

    for (const file of configFiles) {
      const src = path.join(extractDir, file);
      if (fs.existsSync(src)) {
        try { fs.copyFileSync(src, path.join(serverDir, file)); } catch {}
      }
    }
  }

  private registerWorldInDb(worldPath: string, name: string, info: WorldAnalysis, serverId: string, sourceType?: string) {
    const db = getDatabase();
    const now = new Date().toISOString();
    const existing = db.prepare('SELECT name FROM worlds WHERE name = ?').get(name);
    const worldName = existing ? `${name}-${Date.now()}` : name;

    const world: any = {
      name: worldName,
      server_id: serverId,
      seed: info.seed || '',
      gamemode: info.gameMode?.toLowerCase() || 'survival',
      difficulty: info.difficulty?.toLowerCase() || 'normal',
      folder_path: worldPath,
      created_at: now,
      last_played: info.lastPlayed || now,
      dimension_count: info.dimensionCount || 1,
      chunk_count: info.loadedChunks || 0,
      version: info.minecraftVersion || '',
      software: info.serverSoftware || '',
      hardcore: info.hardcore ? 1 : 0,
      player_count: info.playerCount || 0,
      world_uuid: info.worldUuid || '',
      last_import: now,
      created_from: sourceType || 'import',
    };

    const cols = Object.keys(world);
    const vals = Object.values(world);
    db.prepare(`INSERT INTO worlds (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);

    const dims = this.scanDimensions(worldPath);
    for (const dim of dims) {
      db.prepare(
        'INSERT OR IGNORE INTO world_dimensions (world_name, dimension_name, display_name, size, chunk_count) VALUES (?, ?, ?, ?, ?)'
      ).run(worldName, dim.dimension, dim.displayName, dim.size || '0 B', dim.chunkCount || 0);
    }
  }

  // ── Server software detection ──
  private detectServerSoftware(dir: string): string {
    for (const { pattern, name } of SOFTWARE_PATTERNS) {
      if (this.findFileRecursive(dir, pattern)) return name;
    }

    // Check for serverconfig/ (strong Fabric indicator for pure world exports)
    if (fs.existsSync(path.join(dir, 'serverconfig'))) {
      return 'Fabric';
    }

    const jars = fs.readdirSync(dir).filter(f => f.endsWith('.jar') && !f.startsWith('.'));
    const serverJars = jars.filter(j => {
      const low = j.toLowerCase();
      return low.includes('paper') || low.includes('purpur') || low.includes('fabric') ||
             low.includes('forge') || low.includes('neoforge') || low.includes('spigot') ||
             low.includes('bukkit') || low.includes('vanilla') || low.includes('server') ||
             low.includes('quilt');
    });

    if (serverJars.length > 0) {
      const jar = serverJars[0].toLowerCase();
      if (jar.includes('fabric')) return 'Fabric';
      if (jar.includes('paper')) return 'Paper';
      if (jar.includes('purpur')) return 'Purpur';
      if (jar.includes('pufferfish')) return 'Pufferfish';
      if (jar.includes('forge')) return 'Forge';
      if (jar.includes('neoforge')) return 'NeoForge';
      if (jar.includes('spigot')) return 'Spigot';
      if (jar.includes('bukkit')) return 'Bukkit';
      if (jar.includes('quilt')) return 'Quilt';
      if (jar.includes('vanilla') || jar.includes('server')) return 'Vanilla';
    }

    // Check for mods/ directory (also strong Fabric indicator)
    if (fs.existsSync(path.join(dir, 'mods')) && !fs.existsSync(path.join(dir, 'plugins'))) {
      const mods = fs.readdirSync(path.join(dir, 'mods')).filter(f => f.endsWith('.jar'));
      if (mods.length > 0) return 'Fabric';
    }

    return 'Vanilla';
  }

  private async detectVersionFromSource(serverPath: string, worldDir: string): Promise<string> {
    const lvl = await this.readLevelDatAsync(worldDir);
    if (lvl.version) return lvl.version;

    const jars = fs.readdirSync(serverPath).filter(f => f.endsWith('.jar'));
    for (const jar of jars) {
      const match = jar.match(/(\d+\.\d+(?:\.\d+)?)/);
      if (match) return match[1];
    }

    return '1.21.4';
  }

  // ── level.dat parsing with prismarine-nbt ──
  private async readLevelDatAsync(worldPath: string): Promise<any> {
    const levelDatPath = path.join(worldPath, 'level.dat');
    if (!fs.existsSync(levelDatPath)) {
      console.log(`[Import] level.dat not found at ${levelDatPath}`);
      return {};
    }

    try {
      const nbt = require('prismarine-nbt');
      const data = fs.readFileSync(levelDatPath);
      const { parsed } = await nbt.parse(data);
      const simple = nbt.simplify(parsed);
      const d = simple.Data || {};

      const result: any = {};

      // World UUID - stored as int[4] in level.dat
      if (Array.isArray(d.UUID) && d.UUID.length === 4) {
        result.worldUuid = intArrayToUuid(d.UUID);
      } else if (d.WorldGenSettings?.uuid) {
        result.worldUuid = String(d.WorldGenSettings.uuid);
      }

      if (d.RandomSeed !== undefined) result.seed = String(d.RandomSeed);
      else if (d.WorldGenSettings?.seed !== undefined) result.seed = String(d.WorldGenSettings.seed);

      if (d.Version?.Name !== undefined) {
        result.version = String(d.Version.Name);
      } else if (d.DataVersion !== undefined) {
        result.saveVersion = d.DataVersion;
      }

      if (d.GameType !== undefined) result.gamemode = Number(d.GameType);
      if (d.Difficulty !== undefined) result.difficulty = Number(d.Difficulty);
      if (d.hardcore !== undefined) result.hardcore = d.hardcore ? 1 : 0;
      if (d.LastPlayed !== undefined) result.lastPlayed = new Date(Number(d.LastPlayed)).toISOString();

      ImportLogger.data('level.dat parsed', { seed: result.seed, version: result.version, gamemode: result.gamemode, difficulty: result.difficulty, hardcore: result.hardcore, uuid: result.worldUuid });
      return result;
    } catch (err) {
      console.log(`[Import] Failed to parse level.dat with prismarine-nbt, falling back to binary scan`);
      // Fallback to binary scan
      try {
        const buf = fs.readFileSync(levelDatPath);
        const str = buf.toString('latin1');
        const result: any = {};

        const seedMatch = str.match(/RandomSeed[^\d]*(-?\d+)/);
        if (seedMatch) result.seed = seedMatch[1];

        const versionMatch = str.match(/DataVersion[^\d]*(\d+)/);
        if (versionMatch) result.saveVersion = parseInt(versionMatch[1]);

        const versionNameMatch = str.match(/Version[^}]*Name[^\d]*(\d+\.\d+(?:\.\d+)?)/);
        if (versionNameMatch) result.version = versionNameMatch[1];

        const gameTypeMatch = str.match(/GameType[^\d]*(\d)/);
        if (gameTypeMatch) result.gamemode = parseInt(gameTypeMatch[1]);

        const difficultyMatch = str.match(/Difficulty[^\d]*(\d)/);
        if (difficultyMatch) result.difficulty = parseInt(difficultyMatch[1]);

        if (str.includes('hardcore') && str.includes('1')) result.hardcore = 1;

        const timeMatch = str.match(/LastPlayed[^\d]*(\d+)/);
        if (timeMatch) result.lastPlayed = new Date(parseInt(timeMatch[1])).toISOString();

        return result;
      } catch {
        return {};
      }
    }
  }

  // ── Dimension detection supporting all layouts ──
  private detectDimensions(worldPath: string): { count: number; hasOverworld: boolean; hasNether: boolean; hasEnd: boolean } {
    let hasOverworld = false;
    let hasNether = false;
    let hasEnd = false;

    // Vanilla layout
    if (this.hasRegionFiles(path.join(worldPath, 'region'))) hasOverworld = true;
    if (this.hasRegionFiles(path.join(worldPath, 'DIM-1', 'region'))) hasNether = true;
    if (this.hasRegionFiles(path.join(worldPath, 'DIM1', 'region'))) hasEnd = true;

    // Fabric/Aternos layout: dimensions/minecraft/<dim>/region/
    const dimsDir = path.join(worldPath, 'dimensions');
    if (fs.existsSync(dimsDir)) {
      try {
        const namespaces = fs.readdirSync(dimsDir);
        for (const ns of namespaces) {
          const nsPath = path.join(dimsDir, ns);
          if (!fs.statSync(nsPath).isDirectory()) continue;
          const dims = fs.readdirSync(nsPath);
          for (const dim of dims) {
            const regionDir = path.join(nsPath, dim, 'region');
            if (!this.hasRegionFiles(regionDir)) continue;
            const dimLower = dim.toLowerCase();
            if (dimLower.includes('overworld') || dimLower === 'the_end' || dimLower === 'the_nether') {
              if (dimLower.includes('overworld')) hasOverworld = true;
              else if (dimLower === 'the_nether') hasNether = true;
              else if (dimLower === 'the_end') hasEnd = true;
            } else {
              // Custom dimension - just count it
            }
          }
        }
      } catch {}
    }

    // Also check for `_dimension_` markers in data/ for custom dimensions
    if (!hasOverworld) {
      // If we have a level.dat but no region dir, check if dimensions/ exists at all
      if (fs.existsSync(dimsDir) && fs.existsSync(path.join(worldPath, 'level.dat'))) {
        hasOverworld = fs.readdirSync(dimsDir).length > 0;
      }
    }

    let count = 0;
    if (hasOverworld) count++;
    if (hasNether) count++;
    if (hasEnd) count++;

    // Count custom dimensions
    if (fs.existsSync(dimsDir)) {
      try {
        const namespaces = fs.readdirSync(dimsDir);
        for (const ns of namespaces) {
          const nsPath = path.join(dimsDir, ns);
          if (!fs.statSync(nsPath).isDirectory()) continue;
          const dims = fs.readdirSync(nsPath);
          for (const dim of dims) {
            const dimLower = dim.toLowerCase();
            if (dimLower.includes('overworld') || dimLower === 'the_nether' || dimLower === 'the_end') continue;
            if (fs.existsSync(path.join(nsPath, dim, 'region'))) count++;
          }
        }
      } catch {}
    }

    if (count === 0 && fs.existsSync(path.join(worldPath, 'level.dat'))) {
      // World exists but may not be generated yet — count as 1 dimension
      count = 1;
    }

    return { count, hasOverworld, hasNether, hasEnd };
  }

  // ── World directory finding ──
  private findWorldDirectory(dir: string): string | null {
    // Check common world folder names
    const candidates = ['world', 'worlds'];
    for (const c of candidates) {
      const p = path.join(dir, c);
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        if (fs.existsSync(path.join(p, 'level.dat'))) return p;
        if (this.hasChunkStorage(p)) return p;
      }
    }

    // Check all subdirectories for level.dat or chunk storage
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          if (fs.existsSync(path.join(full, 'level.dat'))) return full;
          if (this.hasChunkStorage(full)) return full;
        }
      }
    } catch {}

    // Check if the root is itself the world
    if (fs.existsSync(path.join(dir, 'level.dat'))) {
      return dir;
    }
    if (this.hasChunkStorage(dir)) {
      return dir;
    }

    return null;
  }

  private findAllWorlds(dir: string): string[] {
    const worlds: string[] = [];
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          if (fs.existsSync(path.join(full, 'level.dat')) || this.hasChunkStorage(full)) {
            worlds.push(full);
          }
        }
      }
    } catch {}
    return worlds;
  }

  // ── Region/dimension scanning (supports all layouts) ──
  private getWorldInfo(worldPath: string): any {
    const info: any = {
      totalSize: 0,
      totalChunks: 0,
      totalRegions: 0,
      seed: null,
      version: null,
      lastPlayed: null,
    };

    if (!fs.existsSync(worldPath)) return info;
    info.totalSize = this.getDirSize(worldPath);

    const dims = this.scanDimensions(worldPath);
    info.totalRegions = dims.reduce((sum: number, d: any) => sum + (d.regionCount || 0), 0);
    info.totalChunks = dims.reduce((sum: number, d: any) => sum + (d.chunkCount || 0), 0);

    return info;
  }

  private scanDimensions(worldPath: string): any[] {
    const results: any[] = [];

    // Vanilla: overworld at root
    const owRegionDir = path.join(worldPath, 'region');
    let owRegionCount = 0;
    let owChunkCount = 0;
    if (fs.existsSync(owRegionDir)) {
      try {
        const files = fs.readdirSync(owRegionDir).filter(f => f.endsWith('.mca'));
        owRegionCount = files.length;
        for (const f of files) owChunkCount += this.countChunks(path.join(owRegionDir, f));
      } catch {}
    }
    const owSize = this.getDirSize(worldPath, ['region', 'DIM-1', 'DIM1', 'dimensions']);
    results.push({ folderName: '.', dimension: 'minecraft:overworld', displayName: 'Overworld', regionCount: owRegionCount, chunkCount: owChunkCount, size: this.formatBytes(owSize) });

    // Vanilla Nether
    const netherRegionDir = path.join(worldPath, 'DIM-1', 'region');
    let netherRegionCount = 0;
    let netherChunkCount = 0;
    if (fs.existsSync(netherRegionDir)) {
      try {
        const files = fs.readdirSync(netherRegionDir).filter(f => f.endsWith('.mca'));
        netherRegionCount = files.length;
        for (const f of files) netherChunkCount += this.countChunks(path.join(netherRegionDir, f));
      } catch {}
    }
    if (netherRegionCount > 0) {
      const netherSize = this.getDirSize(path.join(worldPath, 'DIM-1'));
      results.push({ folderName: 'DIM-1', dimension: 'minecraft:nether', displayName: 'Nether', regionCount: netherRegionCount, chunkCount: netherChunkCount, size: this.formatBytes(netherSize) });
    }

    // Vanilla End
    const endRegionDir = path.join(worldPath, 'DIM1', 'region');
    let endRegionCount = 0;
    let endChunkCount = 0;
    if (fs.existsSync(endRegionDir)) {
      try {
        const files = fs.readdirSync(endRegionDir).filter(f => f.endsWith('.mca'));
        endRegionCount = files.length;
        for (const f of files) endChunkCount += this.countChunks(path.join(endRegionDir, f));
      } catch {}
    }
    if (endRegionCount > 0) {
      const endSize = this.getDirSize(path.join(worldPath, 'DIM1'));
      results.push({ folderName: 'DIM1', dimension: 'minecraft:end', displayName: 'End', regionCount: endRegionCount, chunkCount: endChunkCount, size: this.formatBytes(endSize) });
    }

    // Fabric/Aternos: dimensions/<namespace>/<dimension>/region/
    const dimsDir = path.join(worldPath, 'dimensions');
    if (fs.existsSync(dimsDir)) {
      try {
        const namespaces = fs.readdirSync(dimsDir);
        for (const ns of namespaces) {
          const nsPath = path.join(dimsDir, ns);
          if (!fs.statSync(nsPath).isDirectory()) continue;
          const dims = fs.readdirSync(nsPath);
          for (const dim of dims) {
            const dimPath = path.join(nsPath, dim);
            const regionDir = path.join(dimPath, 'region');
            let rCount = 0;
            let cCount = 0;
            if (fs.existsSync(regionDir)) {
              try {
                const files = fs.readdirSync(regionDir).filter(f => f.endsWith('.mca'));
                rCount = files.length;
                for (const f of files) cCount += this.countChunks(path.join(regionDir, f));
              } catch {}
            }
            if (rCount > 0) {
              const dimSize = this.getDirSize(dimPath);
              const dimName = `${ns}:${dim}`;
              const displayName = dim.charAt(0).toUpperCase() + dim.slice(1).replace(/_/g, ' ');
              results.push({ folderName: `dimensions/${ns}/${dim}`, dimension: dimName, displayName, regionCount: rCount, chunkCount: cCount, size: this.formatBytes(dimSize) });
            }
          }
        }
      } catch {}
    }

    return results;
  }

  private countChunks(regionFile: string): number {
    try {
      const fd = fs.openSync(regionFile, 'r');
      const buf = Buffer.alloc(4096);
      fs.readSync(fd, buf, 0, 4096, 0);
      fs.closeSync(fd);
      let count = 0;
      for (let i = 0; i < 1024; i++) {
        const offset = buf.readUInt32BE(i * 4);
        if (offset !== 0) count++;
      }
      return count;
    } catch { return 0; }
  }

  private readJsonFile(filePath: string): any {
    try {
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { return null; }
  }

  private getDirSize(dir: string, excludeDirs?: string[]): number {
    let total = 0;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (excludeDirs && e.isDirectory() && excludeDirs.includes(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isFile()) total += fs.statSync(p).size;
        else if (e.isDirectory()) total += this.getDirSize(p);
      }
    } catch {}
    return total;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  private findFileRecursive(dir: string, target: string): string | null {
    try {
      const entries = fs.readdirSync(dir);
      if (entries.includes(target)) return path.join(dir, target);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          const found = this.findFileRecursive(full, target);
          if (found) return found;
        }
      }
    } catch {}
    return null;
  }

  private copyRecursive(src: string, dest: string) {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isFile()) {
        try { fs.copyFileSync(srcPath, destPath); } catch {}
      } else if (entry.isDirectory()) {
        this.copyRecursive(srcPath, destPath);
      }
    }
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

      this.flattenExtracted(extractDir);
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

  private flattenExtracted(extractDir: string) {
    try {
      const entries = fs.readdirSync(extractDir);
      if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
        const subDir = entries[0];
        const subPath = path.join(extractDir, subDir);
        const subEntries = fs.readdirSync(subPath);
        for (const e of subEntries) {
          const src = path.join(subPath, e);
          const dest = path.join(extractDir, e);
          if (!fs.existsSync(dest)) {
            fs.renameSync(src, dest);
          }
        }
        fs.rmdirSync(subPath);
      }
    } catch {}
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
}

export const importService = new ImportService();
