import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import { getDatabase, generateSlug } from '../database';
import { setMinecraftDir, resolvePath, getMinecraftDir } from '../paths';
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

  // ── STEP 1: Universal Auto-Detection ──
  async analyze(sourcePath: string): Promise<{
    type: 'full-server' | 'world' | 'mc-backup' | 'invalid';
    world: WorldAnalysis | null;
    detection: any;
  }> {
    const stats = fs.statSync(sourcePath);
    const isDir = stats.isDirectory();
    let cleanupDir: string | null = null;

    if (!isDir) {
      try {
        const extracted = await this.extractArchive(sourcePath);
        cleanupDir = extracted;
        sourcePath = extracted;
      } catch (err: any) {
        return {
          type: 'invalid',
          world: null,
          detection: { error: `Failed to extract archive: ${err.message}` },
        };
      }
    }

    const type = this.detectContentType(sourcePath);
    let world: WorldAnalysis | null = null;
    let detection: any = {};

    if (type !== 'invalid') {
      const worldDir = this.findWorldDirectory(sourcePath);
      if (worldDir) {
        world = this.analyzeWorld(worldDir, sourcePath);
      } else if (type === 'full-server') {
        const worlds = this.findAllWorlds(sourcePath);
        if (worlds.length > 0) {
          world = this.analyzeWorld(worlds[0], sourcePath);
        }
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

  private detectContentType(sourcePath: string): 'full-server' | 'world' | 'mc-backup' | 'invalid' {
    // Check for MineControl OS backup marker
    const backupMeta = path.join(sourcePath, '.mcbackup.json');
    if (fs.existsSync(backupMeta)) return 'mc-backup';

    // Check for level.dat (world root)
    const levelDat = this.findFileRecursive(sourcePath, 'level.dat');
    if (!levelDat) return 'invalid';

    // Check for server indicators
    const hasServerProps = this.findFileRecursive(sourcePath, 'server.properties');
    const hasServerJar = fs.readdirSync(sourcePath).some(f => f.endsWith('.jar'));
    const hasPlugins = fs.existsSync(path.join(sourcePath, 'plugins'));
    const hasMods = fs.existsSync(path.join(sourcePath, 'mods'));
    const hasEula = this.findFileRecursive(sourcePath, 'eula.txt');

    if (hasServerProps && (hasServerJar || hasPlugins || hasMods || hasEula)) {
      return 'full-server';
    }

    // Check if it's a world directory
    const worldDir = this.findWorldDirectory(sourcePath);
    if (worldDir) return 'world';

    // Check if level.dat exists anywhere (world folder directly)
    if (levelDat && fs.existsSync(path.join(path.dirname(levelDat), 'region'))) return 'world';

    return 'invalid';
  }

  // ── STEP 2: World Analysis ──
  analyzeWorld(worldPath: string, serverPath?: string): WorldAnalysis {
    const info = this.getWorldInfo(worldPath);
    const lvl = this.readLevelDat(worldPath);
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
    }

    const datapacksDir = path.join(worldPath, 'datapacks');
    let datapacks: string[] = [];
    if (fs.existsSync(datapacksDir)) {
      datapacks = fs.readdirSync(datapacksDir).filter(f => fs.statSync(path.join(datapacksDir, f)).isDirectory());
    }

    const playerDataDir = path.join(worldPath, 'playerdata');
    let playerNames: string[] = [];
    let playerCount = 0;
    if (fs.existsSync(playerDataDir)) {
      const files = fs.readdirSync(playerDataDir).filter(f => f.endsWith('.dat'));
      playerCount = files.length;
      playerNames = files.map(f => f.replace('.dat', ''));
    }

    const hasOverworld = fs.existsSync(path.join(worldPath, 'region'));
    const hasNether = fs.existsSync(path.join(worldPath, 'DIM-1', 'region'));
    const hasEnd = fs.existsSync(path.join(worldPath, 'DIM1', 'region'));

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
      minecraftVersion: lvl.version || info.version || 'Unknown',
      serverSoftware: software,
      seed: String(lvl.seed ?? ''),
      worldSize: info.totalSize,
      worldSizeFormatted: this.formatBytes(info.totalSize),
      regionCount: info.totalRegions,
      loadedChunks: info.totalChunks,
      dimensionCount: dims.length,
      hasOverworld,
      hasNether,
      hasEnd,
      playerCount,
      playerNames,
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
    const playerDataDir = path.join(worldPath, 'playerdata');
    const advancementsDir = path.join(worldPath, 'advancements');
    const statsDir = path.join(worldPath, 'stats');

    if (!fs.existsSync(playerDataDir)) return players;

    const datFiles = fs.readdirSync(playerDataDir).filter(f => f.endsWith('.dat'));
    for (const file of datFiles) {
      const uuid = file.replace('.dat', '');
      const filePath = path.join(playerDataDir, file);
      try {
        const data = this.readPlayerDat(filePath);
        const advancements = this.readJsonFile(path.join(advancementsDir, `${uuid}.json`));
        const statistics = this.readJsonFile(path.join(statsDir, `${uuid}.json`));
        players.push({
          username: data.username || uuid,
          uuid,
          inventory: data.Inventory || [],
          xpLevel: data.XpLevel ?? 0,
          health: data.Health ?? 20,
          food: data.foodLevel ?? 20,
          coordinates: {
            x: data.Pos?.[0] ?? data.posX ?? 0,
            y: data.Pos?.[1] ?? data.posY ?? 64,
            z: data.Pos?.[2] ?? data.posZ ?? 0,
          },
          dimension: data.Dimension ?? data.dimension ?? 'minecraft:overworld',
          lastSeen: data.LastSeen ? new Date(Number(data.LastSeen)).toISOString() : null,
          playTime: data.PlayTime ?? 0,
          deaths: data.DeathCount ?? 0,
          advancements: advancements || {},
          statistics: statistics || {},
        });
      } catch {}
    }

    return players;
  }

  // ── STEP 8: Validation ──
  validateImport(worldPath: string): { valid: boolean; reason?: string } {
    const levelDat = path.join(worldPath, 'level.dat');
    if (!fs.existsSync(levelDat)) {
      return { valid: false, reason: 'Missing level.dat - this is not a valid Minecraft world.' };
    }
    const hasRegion = fs.existsSync(path.join(worldPath, 'region'));
    if (!hasRegion) {
      return { valid: false, reason: 'Missing region/ directory - no world data found.' };
    }
    return { valid: true };
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
          result.world = this.analyzeWorld(worldDir, type === 'full-server' ? sourcePath : undefined);
          result.players = this.analyzePlayers(worldDir);
          result.software = result.world?.serverSoftware || 'Unknown';
          result.version = result.world?.minecraftVersion || 'Unknown';
        }
      }
    }

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

    if (isZip) {
      try {
        extractDir = await this.extractArchive(sourcePath);
      } catch (err: any) {
        return { success: false, warnings: [], errors: [`Failed to extract archive: ${err.message}`] };
      }
    }

    const type = this.detectContentType(extractDir);
    if (type === 'invalid') {
      return { success: false, warnings: [], errors: ['Invalid import source: no Minecraft data detected.'] };
    }

    const worldDir = this.findWorldDirectory(extractDir);
    if (!worldDir) {
      return { success: false, warnings: [], errors: ['No Minecraft world directory found in import source.'] };
    }

    const validation = this.validateImport(worldDir);
    if (!validation.valid) {
      return { success: false, warnings: [], errors: [validation.reason || 'Invalid world data.'] };
    }

    const db = getDatabase();

    // ── Get or create destination server ──
    let serverId: string;
    let serverDir: string;
    let serverName: string;

    if (config.destinationType === 'existing' && config.destinationServerId) {
      const existing = db.prepare('SELECT * FROM servers WHERE id = ?').get(config.destinationServerId) as any;
      if (!existing) {
        return { success: false, warnings: [], errors: ['Selected destination server not found.'] };
      }
      serverId = existing.id;
      serverDir = existing.directory;
      serverName = existing.name;
    } else {
      serverName = config.name || path.basename(sourcePath).replace(/\.(zip|rar|7z)$/i, '') || 'Imported Server';
      let slug = generateSlug(serverName);
      const existing = db.prepare('SELECT id FROM servers WHERE slug = ?').get(slug);
      if (existing) slug = `${slug}-${Date.now()}`;

      serverId = uuidv4();
      serverDir = resolvePath('servers', slug);
      const version = config.version || this.detectVersionFromSource(extractDir, worldDir) || '1.21.4';
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
    }

    // ── Determine world destination ──
    const worldInfo = this.analyzeWorld(worldDir, type === 'full-server' ? extractDir : undefined);
    const levelName = config.worldName || worldInfo.worldName || 'world';
    const targetWorldDir = path.join(serverDir, levelName);

    if (config.destinationType === 'existing') {
      const replaceMode = config.importMode === 'replace';
      if (replaceMode) {
        if (fs.existsSync(targetWorldDir)) {
          fs.rmSync(targetWorldDir, { recursive: true, force: true });
        }
      } else {
        const altName = `${levelName}-imported-${Date.now()}`;
        const finalTarget = path.join(serverDir, altName);
        this.importWorldData(worldDir, finalTarget, type === 'full-server' ? extractDir : undefined);
        this.registerWorldInDb(finalTarget, altName, worldInfo, serverId);
        warnings.push(`Imported as additional world: ${altName}`);

        if (isZip && extractDir !== sourcePath) {
          try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
        }

        const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
        emitToAll('server:updated', server);
        return { success: true, server, warnings, errors: [], summary: undefined };
      }
    }

    // ── STEP 7: Preserve everything — copy world with full preservation ──
    this.importWorldData(worldDir, targetWorldDir, type === 'full-server' ? extractDir : undefined);

    // Update server.properties with level-name
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

    // Copy server-wide configs
    this.copyConfigFiles(extractDir, serverDir);

    // ── Register world in database ──
    this.registerWorldInDb(targetWorldDir, levelName, worldInfo, serverId);

    // ── Set as active server if new ──
    if (config.destinationType !== 'existing') {
      db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('active_server_id', ?)").run(serverId);
      setMinecraftDir(serverDir);
      minecraftServer.loadServer(serverDir);
    }

    // Clean up extracted files
    if (isZip && extractDir !== sourcePath) {
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
    }

    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
    emitToAll('server:updated', server);
    emitToAll('world:created', { name: levelName, server_id: serverId });

    return { success: true, server, warnings, errors };
  }

  // ── Private Helpers ──

  private importWorldData(worldDir: string, targetWorldDir: string, serverPath?: string) {
    if (!fs.existsSync(targetWorldDir)) fs.mkdirSync(targetWorldDir, { recursive: true });

    // Copy world preserving everything
    const preserveDirs = ['region', 'DIM-1', 'DIM1', 'playerdata', 'players', 'stats', 'advancements', 'poi', 'entities', 'data', 'datapacks'];
    for (const dir of preserveDirs) {
      const src = path.join(worldDir, dir);
      if (fs.existsSync(src)) {
        this.copyRecursive(src, path.join(targetWorldDir, dir));
      }
    }

    // Copy level.dat
    const srcLevel = path.join(worldDir, 'level.dat');
    if (fs.existsSync(srcLevel)) {
      fs.copyFileSync(srcLevel, path.join(targetWorldDir, 'level.dat'));
    }

    // Copy session.lock if present
    const srcSession = path.join(worldDir, 'session.lock');
    if (fs.existsSync(srcSession)) {
      try { fs.copyFileSync(srcSession, path.join(targetWorldDir, 'session.lock')); } catch {}
    }
  }

  private copyConfigFiles(extractDir: string, serverDir: string) {
    const configFiles = ['server.properties', 'eula.txt', 'whitelist.json', 'ops.json',
      'banned-players.json', 'banned-ips.json', 'bukkit.yml', 'spigot.yml', 'paper.yml',
      'purpur.yml', 'commands.yml', 'help.yml', 'permissions.yml'];

    for (const file of configFiles) {
      const src = path.join(extractDir, file);
      if (fs.existsSync(src)) {
        try {
          fs.copyFileSync(src, path.join(serverDir, file));
        } catch {}
      }
    }
  }

  private registerWorldInDb(worldPath: string, name: string, info: WorldAnalysis, serverId: string) {
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

  private detectServerSoftware(dir: string): string {
    for (const { pattern, name } of SOFTWARE_PATTERNS) {
      if (this.findFileRecursive(dir, pattern)) return name;
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
      if (jar.includes('paper')) return 'Paper';
      if (jar.includes('purpur')) return 'Purpur';
      if (jar.includes('fabric')) return 'Fabric';
      if (jar.includes('forge')) return 'Forge';
      if (jar.includes('neoforge')) return 'NeoForge';
      if (jar.includes('spigot')) return 'Spigot';
      if (jar.includes('bukkit')) return 'Bukkit';
      if (jar.includes('quilt')) return 'Quilt';
      if (jar.includes('vanilla') || jar.includes('server')) return 'Vanilla';
    }

    return 'Vanilla';
  }

  private detectVersionFromSource(serverPath: string, worldDir: string): string {
    const lvl = this.readLevelDat(worldDir);
    if (lvl.version) return lvl.version;

    const jars = fs.readdirSync(serverPath).filter(f => f.endsWith('.jar'));
    for (const jar of jars) {
      const match = jar.match(/(\d+\.\d+(?:\.\d+)?)/);
      if (match) return match[1];
    }

    return '1.21.4';
  }

  private readLevelDat(worldPath: string): any {
    const levelDatPath = path.join(worldPath, 'level.dat');
    if (!fs.existsSync(levelDatPath)) return {};

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

  private readPlayerDat(filePath: string): any {
    try {
      const buf = fs.readFileSync(filePath);
      const str = buf.toString('latin1');
      const result: any = {};

      const xpMatch = str.match(/XpLevel[^\d]*(\d+)/);
      if (xpMatch) result.XpLevel = parseInt(xpMatch[1]);

      const healthMatch = str.match(/Health[^\d]*([\d.]+)/);
      if (healthMatch) result.Health = parseFloat(healthMatch[1]);

      const foodMatch = str.match(/foodLevel[^\d]*(\d+)/);
      if (foodMatch) result.foodLevel = parseInt(foodMatch[1]);

      const deathMatch = str.match(/DeathCount[^\d]*(\d+)/);
      if (deathMatch) result.DeathCount = parseInt(deathMatch[1]);

      const timeMatch = str.match(/PlayTime[^\d]*(\d+)/);
      if (timeMatch) result.PlayTime = parseInt(timeMatch[1]);

      const dimMatch = str.match(/Dimension[^\d]*(-?\d+)/);
      if (dimMatch) {
        const dim = parseInt(dimMatch[1]);
        result.Dimension = dim === -1 ? 'minecraft:nether' : dim === 1 ? 'minecraft:end' : 'minecraft:overworld';
      }

      const posMatch = str.match(/Pos[^]]*\[([\d.-]+),\s*([\d.-]+),\s*([\d.-]+)\]/);
      if (posMatch) result.Pos = [parseFloat(posMatch[1]), parseFloat(posMatch[2]), parseFloat(posMatch[3])];

      return result;
    } catch {
      return {};
    }
  }

  private readJsonFile(filePath: string): any {
    try {
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

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

    const lvl = this.readLevelDat(worldPath);
    info.seed = lvl.seed;
    info.version = lvl.version;
    info.lastPlayed = lvl.lastPlayed;

    return info;
  }

  private scanDimensions(worldPath: string): any[] {
    const results: any[] = [];
    const dims = [
      { folderName: '.', dimension: 'minecraft:overworld', displayName: 'Overworld' },
      { folderName: 'DIM-1', dimension: 'minecraft:nether', displayName: 'Nether' },
      { folderName: 'DIM1', dimension: 'minecraft:end', displayName: 'End' },
    ];

    for (const dim of dims) {
      const dimPath = path.join(worldPath, dim.folderName);
      if (dim.folderName !== '.' && !fs.existsSync(dimPath)) continue;

      const regionDir = path.join(dimPath, 'region');
      let regionCount = 0;
      let chunkCount = 0;

      if (fs.existsSync(regionDir)) {
        try {
          const files = fs.readdirSync(regionDir).filter(f => f.endsWith('.mca'));
          regionCount = files.length;
          for (const f of files) {
            chunkCount += this.countChunks(path.join(regionDir, f));
          }
        } catch {}
      }

      const size = dim.folderName === '.' ? this.getDirSize(worldPath) : this.getDirSize(dimPath);
      results.push({ ...dim, regionCount, chunkCount, size: this.formatBytes(size) });
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

  private findWorldDirectory(dir: string): string | null {
    const candidates = ['world', 'worlds'];
    for (const c of candidates) {
      const p = path.join(dir, c);
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        if (fs.existsSync(path.join(p, 'level.dat'))) return p;
        if (fs.existsSync(path.join(p, 'region'))) return p;
      }
    }

    // Check for Aternos-style: world in subfolder
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

    // Check dir itself (world folder directly)
    if (fs.existsSync(path.join(dir, 'level.dat')) || fs.existsSync(path.join(dir, 'region'))) {
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
          if (fs.existsSync(path.join(full, 'level.dat')) || fs.existsSync(path.join(full, 'region'))) {
            worlds.push(full);
          }
        }
      }
    } catch {}
    return worlds;
  }

  private detectServerSoftwareFromJar(dir: string): string {
    const jars = fs.readdirSync(dir).filter(f => f.endsWith('.jar'));
    for (const jar of jars) {
      const low = jar.toLowerCase();
      if (low.includes('paper')) return 'Paper';
      if (low.includes('purpur')) return 'Purpur';
      if (low.includes('fabric')) return 'Fabric';
      if (low.includes('forge')) return 'Forge';
      if (low.includes('neoforge')) return 'NeoForge';
      if (low.includes('spigot')) return 'Spigot';
      if (low.includes('bukkit')) return 'Bukkit';
      if (low.includes('quilt')) return 'Quilt';
    }
    return 'Vanilla';
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

      // Handle nested single-folder zips (common for Aternos/world downloads)
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
}

export const importService = new ImportService();
