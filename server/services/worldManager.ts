import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { getDatabase } from '../database';
import { resolveMinecraftDir } from '../paths';
import { v4 as uuidv4 } from 'uuid';
import { emitToAll } from '../socketManager';

const ALGORITHM = 'aes-256-cbc';

function getWorldsDir(): string {
  return resolveMinecraftDir('worlds');
}

function getServerDir(): string {
  return resolveMinecraftDir();
}

export function sanitizeWorldName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 64);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function getFolderSize(dirPath: string): number {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dirPath, e.name);
      if (e.isFile()) {
        try { total += fs.statSync(p).size; } catch {}
      } else if (e.isDirectory()) {
        total += getFolderSize(p);
      }
    }
  } catch {}
  return total;
}

export function getLevelName(): string {
  const propsPath = path.join(getServerDir(), 'server.properties');
  if (fs.existsSync(propsPath)) {
    const content = fs.readFileSync(propsPath, 'utf-8');
    const match = content.match(/^level-name=(.*)$/m);
    if (match) return match[1].trim();
  }
  return 'world';
}

export function countRegionFiles(worldPath: string, dimension: string): number {
  const regionDir = path.join(worldPath, dimension, 'region');
  if (!fs.existsSync(regionDir)) return 0;
  try {
    return fs.readdirSync(regionDir).filter(f => f.endsWith('.mca')).length;
  } catch { return 0; }
}

export function countChunks(regionFile: string): number {
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

export function getDimensionName(folderName: string): { dimension: string; displayName: string } {
  switch (folderName) {
    case 'DIM1': return { dimension: 'minecraft:end', displayName: 'End' };
    case 'DIM-1': return { dimension: 'minecraft:nether', displayName: 'Nether' };
    default: return { dimension: 'minecraft:overworld', displayName: 'Overworld' };
  }
}

export function getDimensionFolder(dimension: string): string {
  switch (dimension) {
    case 'minecraft:nether': return 'DIM-1';
    case 'minecraft:end': return 'DIM1';
    default: return '.';
  }
}

export function scanDimensions(worldPath: string): { folderName: string; dimension: string; displayName: string; regionCount: number; chunkCount: number; size: number }[] {
  const results: any[] = [];
  const dims = [
    { folderName: '.', dimension: 'minecraft:overworld', displayName: 'Overworld' },
    { folderName: 'DIM-1', dimension: 'minecraft:nether', displayName: 'Nether' },
    { folderName: 'DIM1', dimension: 'minecraft:end', displayName: 'End' },
  ];
  for (const dim of dims) {
    const dimPath = path.join(worldPath, dim.folderName);
    if (fs.existsSync(dimPath) && dim.folderName !== '.') {
      const regionCount = countRegionFiles(worldPath, dim.folderName);
      let chunkCount = 0;
      const regionDir = path.join(dimPath, 'region');
      if (fs.existsSync(regionDir)) {
        try {
          const files = fs.readdirSync(regionDir).filter(f => f.endsWith('.mca'));
          for (const f of files) {
            chunkCount += countChunks(path.join(regionDir, f));
          }
        } catch {}
      }
      const size = getFolderSize(dimPath);
      results.push({ ...dim, regionCount, chunkCount, size: formatBytes(size) });
    } else if (dim.folderName === '.') {
      const regionCount = countRegionFiles(worldPath, '.');
      let chunkCount = 0;
      const regionDir = path.join(worldPath, 'region');
      if (fs.existsSync(regionDir)) {
        try {
          const files = fs.readdirSync(regionDir).filter(f => f.endsWith('.mca'));
          for (const f of files) {
            chunkCount += countChunks(path.join(regionDir, f));
          }
        } catch {}
      }
      const size = getFolderSize(dimPath);
      results.push({ ...dim, regionCount, chunkCount, size: formatBytes(size) });
    }
  }
  return results;
}

export function getWorldInfo(worldPath: string): any {
  const info: any = {
    totalSize: 0,
    regionSize: 0,
    playerdataSize: 0,
    statsSize: 0,
    totalChunks: 0,
    loadedChunks: 0,
    totalRegions: 0,
    dimensions: [],
    seed: null,
    version: null,
    lastPlayed: null,
  };

  if (!fs.existsSync(worldPath)) return info;

  info.totalSize = getFolderSize(worldPath);

  // level.dat parsing
  const levelDatPath = path.join(worldPath, 'level.dat');
  if (fs.existsSync(levelDatPath)) {
    try {
      info.lastPlayed = fs.statSync(levelDatPath).mtime.toISOString();
    } catch {}
  }

  // Region files
  const dims = scanDimensions(worldPath);
  info.dimensions = dims;
  info.totalRegions = dims.reduce((sum, d) => sum + (d.regionCount || 0), 0);
  info.totalChunks = dims.reduce((sum, d) => sum + (d.chunkCount || 0), 0);

  // Size breakdown
  for (const dim of dims) {
    const dimPath = path.join(worldPath, dim.folderName === '.' ? '.' : dim.folderName);
    if (dim.folderName === '.' || dim.folderName === '..') {
      info.regionSize += getFolderSize(path.join(worldPath, dim.folderName === '.' ? 'region' : ''));
    } else {
      const regionDir = path.join(dimPath, 'region');
      if (fs.existsSync(regionDir)) info.regionSize += getFolderSize(regionDir);
    }
  }

  const playerdataDir = path.join(worldPath, 'playerdata');
  if (fs.existsSync(playerdataDir)) info.playerdataSize = getFolderSize(playerdataDir);

  const statsDir = path.join(worldPath, 'stats');
  if (fs.existsSync(statsDir)) info.statsSize = getFolderSize(statsDir);

  return info;
}

export function detectWorlds(): any[] {
  const worldsDir = getWorldsDir();
  if (!fs.existsSync(worldsDir)) return [];

  const db = getDatabase();
  const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
  const detected: any[] = [];

  try {
    const entries = fs.readdirSync(worldsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dirPath = path.join(worldsDir, e.name);

      // Check if it has region files (Minecraft world)
      const hasRegion = fs.existsSync(path.join(dirPath, 'region')) &&
        fs.readdirSync(path.join(dirPath, 'region')).some(f => f.endsWith('.mca'));
      const hasLevelDat = fs.existsSync(path.join(dirPath, 'level.dat'));

      if (!hasRegion && !hasLevelDat) continue;

      const existing = db.prepare('SELECT name FROM worlds WHERE name = ?').get(e.name);
      if (!existing) {
        const now = new Date().toISOString();
        const info = getWorldInfo(dirPath);
        const world: any = {
          name: e.name,
          seed: '',
          gamemode: 'survival',
          difficulty: 'normal',
          folder_path: dirPath,
          created_at: now,
          last_played: info.lastPlayed,
          dimension_count: info.dimensions.length || 1,
          chunk_count: info.totalChunks,
        };
        if (activeId) world.server_id = activeId;

        const cols = Object.keys(world);
        const vals = Object.values(world);
        const placeholders = cols.map(() => '?').join(', ');
        db.prepare(`INSERT INTO worlds (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals);

        // Create default dimensions
        for (const dim of info.dimensions) {
          db.prepare(
            'INSERT OR IGNORE INTO world_dimensions (world_name, dimension_name, display_name, size, chunk_count) VALUES (?, ?, ?, ?, ?)'
          ).run(e.name, dim.dimension, dim.displayName, dim.size || '0 B', dim.chunkCount || 0);
        }

        detected.push({ ...world, size: formatBytes(info.totalSize), totalChunks: info.totalChunks, totalRegions: info.totalRegions });
      }
    }
  } catch {}

  return detected;
}

export function syncWorldFromServerDir(): any | null {
  const levelName = getLevelName();
  const worldPath = path.join(getServerDir(), levelName);
  if (!fs.existsSync(worldPath)) return null;

  const worldsDir = getWorldsDir();
  if (!fs.existsSync(worldsDir)) fs.mkdirSync(worldsDir, { recursive: true });

  // If the world directory is already tracked, just update
  const db = getDatabase();
  const existing = db.prepare('SELECT name FROM worlds WHERE name = ?').get(levelName) as any;

  if (!existing) {
    // Symlink or copy the server world into tracked worlds
    const trackedPath = path.join(worldsDir, levelName);
    if (!fs.existsSync(trackedPath)) {
      try { fs.cpSync(worldPath, trackedPath, { recursive: true }); } catch {}
    }

    const now = new Date().toISOString();
    const info = getWorldInfo(trackedPath);
    const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;

    const world: any = {
      name: levelName,
      seed: '',
      gamemode: 'survival',
      difficulty: 'normal',
      folder_path: trackedPath,
      created_at: now,
      last_played: info.lastPlayed,
      dimension_count: Math.max(info.dimensions.length, 1),
      chunk_count: info.totalChunks,
    };
    if (activeId) world.server_id = activeId;

    const cols = Object.keys(world);
    const vals = Object.values(world);
    const placeholders = cols.map(() => '?').join(', ');
    db.prepare(`INSERT INTO worlds (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals);

    for (const dim of info.dimensions) {
      db.prepare(
        'INSERT OR IGNORE INTO world_dimensions (world_name, dimension_name, display_name, size, chunk_count) VALUES (?, ?, ?, ?, ?)'
      ).run(levelName, dim.dimension, dim.displayName, dim.size || '0 B', dim.chunkCount || 0);
    }

    return { ...world, size: formatBytes(info.totalSize) };
  }

  return null;
}

export function readLevelDat(worldPath: string): any {
  const levelDatPath = path.join(worldPath, 'level.dat');
  if (!fs.existsSync(levelDatPath)) return {};

  try {
    const { nbt } = require('prismarine-nbt');
    const data = fs.readFileSync(levelDatPath);
    const parsed = nbt.parse(data);
    const dataTag = parsed?.value?.Data?.value;
    if (!dataTag) return {};
    return {
      seed: dataTag.RandomSeed?.value ?? dataTag.WorldGenSettings?.value?.seed?.value ?? null,
      version: dataTag.Version?.value?.Name?.value ?? dataTag.version?.value ?? null,
      difficulty: dataTag.Difficulty?.value ?? null,
      gamemode: dataTag.GameType?.value ?? null,
      lastPlayed: dataTag.LastPlayed?.value ? new Date(Number(dataTag.LastPlayed.value)).toISOString() : null,
      spawnX: dataTag.SpawnX?.value ?? 0,
      spawnY: dataTag.SpawnY?.value ?? 0,
      spawnZ: dataTag.SpawnZ?.value ?? 0,
      hardcore: dataTag.hardcore?.value ? 1 : 0,
      generateStructures: dataTag.MapFeatures?.value ?? 1,
      borderCenterX: dataTag.BorderCenterX?.value ?? 0,
      borderCenterZ: dataTag.BorderCenterZ?.value ?? 0,
      borderSize: dataTag.BorderSize?.value ?? 0,
    };
  } catch { return {}; }
}

export async function createWorldDirectory(name: string, options: {
  seed?: string;
  gamemode?: string;
  difficulty?: string;
  generateStructures?: boolean;
  bonusChest?: boolean;
  worldType?: string;
  hardcore?: boolean;
  simulationDistance?: number;
  viewDistance?: number;
}): Promise<boolean> {
  const nameSanitized = sanitizeWorldName(name);
  const worldPath = path.join(getWorldsDir(), nameSanitized);
  if (fs.existsSync(worldPath)) return false;

  fs.mkdirSync(worldPath, { recursive: true });
  fs.mkdirSync(path.join(worldPath, 'region'), { recursive: true });
  fs.mkdirSync(path.join(worldPath, 'data'), { recursive: true });

  // Create minimal level.dat using prismarine-nbt
  try {
    const { nbt } = require('prismarine-nbt');
    const { zlib } = require('zlib');

    const now = Date.now();
    const data = {
      Data: {
        version: { value: 4189, type: 'int' },
        DataVersion: { value: 4189, type: 'int' },
        Version: {
          value: {
            Id: { value: 4189, type: 'int' },
            Name: { value: '1.21.4', type: 'string' },
            Snapshot: { value: 0, type: 'byte' },
            Series: { value: 'main', type: 'string' },
          },
          type: 'compound',
        },
        RandomSeed: { value: options.seed ? parseInt(options.seed) || Math.floor(Math.random() * 2147483647) : Math.floor(Math.random() * 2147483647), type: 'long' },
        GameType: { value: options.gamemode === 'creative' ? 1 : options.gamemode === 'adventure' ? 2 : options.gamemode === 'spectator' ? 3 : 0, type: 'int' },
        Difficulty: { value: options.difficulty === 'peaceful' ? 0 : options.difficulty === 'easy' ? 1 : options.difficulty === 'normal' ? 2 : 3, type: 'int' },
        hardcore: { value: options.hardcore ? 1 : 0, type: 'byte' },
        MapFeatures: { value: options.generateStructures !== false ? 1 : 0, type: 'byte' },
        BonusChest: { value: options.bonusChest ? 1 : 0, type: 'byte' },
        initialized: { value: 1, type: 'byte' },
        LevelName: { value: nameSanitized, type: 'string' },
        SpawnX: { value: 0, type: 'int' },
        SpawnY: { value: 64, type: 'int' },
        SpawnZ: { value: 0, type: 'int' },
        LastPlayed: { value: now, type: 'long' },
        Time: { value: 0, type: 'long' },
        DayTime: { value: 1000, type: 'long' },
        SizeOnDisk: { value: 0, type: 'long' },
        raining: { value: 0, type: 'byte' },
        rainTime: { value: 0, type: 'int' },
        thundering: { value: 0, type: 'byte' },
        thunderTime: { value: 0, type: 'int' },
        clearWeatherTime: { value: 0, type: 'int' },
        allowCommands: { value: 1, type: 'byte' },
        BorderCenterX: { value: 0, type: 'double' },
        BorderCenterZ: { value: 0, type: 'double' },
        BorderSize: { value: 29999984, type: 'double' },
        WanderTraderSpawnDelay: { value: 24000, type: 'int' },
        WanderTraderSpawnChance: { value: 25, type: 'int' },
        DataPacks: {
          value: {
            Enabled: { value: ['vanilla'], type: 'list', valueType: 'string' },
            Disabled: { value: [], type: 'list', valueType: 'string' },
          },
          type: 'compound',
        },
        WorldGenSettings: {
          value: {
            bonus_chest: { value: options.bonusChest ? 1 : 0, type: 'byte' },
            seed: { value: options.seed ? parseInt(options.seed) || Math.floor(Math.random() * 2147483647) : Math.floor(Math.random() * 2147483647), type: 'long' },
            generate_features: { value: options.generateStructures !== false ? 1 : 0, type: 'byte' },
          },
          type: 'compound',
        },
      },
      type: 'compound',
    };

    const buf = nbt.writeUncompressed(data);
    const compressed = require('zlib').gzipSync(buf);
    fs.writeFileSync(path.join(worldPath, 'level.dat'), compressed);
  } catch (err) {
    console.error('[World] Failed to create level.dat:', err);
  }

  return true;
}

export async function exportWorldAsZip(name: string, outputPath?: string): Promise<string> {
  const nameSanitized = sanitizeWorldName(name);
  const worldPath = path.join(getWorldsDir(), nameSanitized);
  if (!fs.existsSync(worldPath)) throw new Error('World not found');

  const outPath = outputPath || path.join(getWorldsDir(), `${nameSanitized}-export.zip`);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(outPath));
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(worldPath, nameSanitized);
    archive.finalize();
  });
}

export async function importWorldFromZip(zipPath: string, worldName?: string): Promise<string> {
  if (!fs.existsSync(zipPath)) throw new Error('File not found');

  const worldsDir = getWorldsDir();
  if (!fs.existsSync(worldsDir)) fs.mkdirSync(worldsDir, { recursive: true });

  // Determine world name from zip or use a temp extraction to discover
  let finalName = worldName || sanitizeWorldName(path.basename(zipPath, '.zip'));
  let extractPath = path.join(worldsDir, finalName);

  // Check if already exists
  if (fs.existsSync(extractPath)) {
    throw new Error(`World '${finalName}' already exists`);
  }

  fs.mkdirSync(extractPath, { recursive: true });

  // Extract ZIP
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractPath }))
      .on('close', resolve)
      .on('error', reject);
  });

  // Check if extracted files are in a subfolder (common for zips)
  const entries = fs.readdirSync(extractPath);
  if (entries.length === 1 && fs.statSync(path.join(extractPath, entries[0])).isDirectory()) {
    const subDir = entries[0];
    const subPath = path.join(extractPath, subDir);
    // Move contents up
    const subEntries = fs.readdirSync(subPath);
    for (const e of subEntries) {
      fs.renameSync(path.join(subPath, e), path.join(extractPath, e));
    }
    fs.rmdirSync(subPath);
    if (!worldName) finalName = sanitizeWorldName(subDir);
    // Rename folder if needed
    if (finalName !== path.basename(extractPath)) {
      const newPath = path.join(worldsDir, finalName);
      fs.renameSync(extractPath, newPath);
      extractPath = newPath;
    }
  }

  // Validate Minecraft world structure
  const hasLevelDat = fs.existsSync(path.join(extractPath, 'level.dat'));
  const hasRegion = fs.existsSync(path.join(extractPath, 'region'));
  if (!hasLevelDat && !hasRegion) {
    // Clean up invalid world
    fs.rmSync(extractPath, { recursive: true });
    throw new Error('Invalid Minecraft world: missing level.dat or region directory');
  }

  return finalName;
}

export async function importWorldFromFolder(sourcePath: string, worldName?: string): Promise<string> {
  if (!fs.existsSync(sourcePath)) throw new Error('Source folder not found');

  const worldsDir = getWorldsDir();
  if (!fs.existsSync(worldsDir)) fs.mkdirSync(worldsDir, { recursive: true });

  // Validate source
  const hasLevelDat = fs.existsSync(path.join(sourcePath, 'level.dat'));
  const hasRegion = fs.existsSync(path.join(sourcePath, 'region'));
  if (!hasLevelDat && !hasRegion) {
    throw new Error('Invalid Minecraft world: missing level.dat or region directory');
  }

  const finalName = worldName || sanitizeWorldName(path.basename(sourcePath));
  const destPath = path.join(worldsDir, finalName);

  if (fs.existsSync(destPath)) throw new Error(`World '${finalName}' already exists`);

  fs.cpSync(sourcePath, destPath, { recursive: true });
  return finalName;
}

export function optimizeWorld(name: string): { success: boolean; chunksRemoved: number; message: string } {
  const nameSanitized = sanitizeWorldName(name);
  const worldPath = path.join(getWorldsDir(), nameSanitized);
  if (!fs.existsSync(worldPath)) throw new Error('World not found');

  let chunksRemoved = 0;

  // Scan all region files and remove empty chunks
  const dims = ['region', path.join('DIM-1', 'region'), path.join('DIM1', 'region')];
  for (const dim of dims) {
    const regionDir = path.join(worldPath, dim);
    if (!fs.existsSync(regionDir)) continue;

    try {
      const files = fs.readdirSync(regionDir).filter(f => f.endsWith('.mca'));
      for (const file of files) {
        const filePath = path.join(regionDir, file);
        try {
          const fd = fs.openSync(filePath, 'r+');
          const headerBuf = Buffer.alloc(4096);
          fs.readSync(fd, headerBuf, 0, 4096, 0);

          let modified = false;
          for (let i = 0; i < 1024; i++) {
            const offset = headerBuf.readUInt32BE(i * 4);
            if (offset !== 0) {
              const sectorOffset = offset >> 8;
              const sectorCount = offset & 0xff;
              // Check if this chunk is all zeros (empty/unused)
              if (sectorCount > 0) {
                const chunkBuf = Buffer.alloc(sectorCount * 4096);
                fs.readSync(fd, chunkBuf, 0, chunkBuf.length, sectorOffset * 4096);
                if (chunkBuf.every(b => b === 0)) {
                  headerBuf.writeUInt32BE(0, i * 4);
                  modified = true;
                  chunksRemoved++;
                }
              }
            }
          }

          if (modified) {
            fs.writeSync(fd, headerBuf, 0, 4096, 0);
          }
          fs.closeSync(fd);
        } catch {}
      }
    } catch {}
  }

  const db = getDatabase();
  db.prepare("UPDATE worlds SET optimization_status = 'completed', last_optimized = ? WHERE name = ?")
    .run(new Date().toISOString(), nameSanitized);

  return {
    success: true,
    chunksRemoved,
    message: `Optimized ${nameSanitized}: ${chunksRemoved} empty chunks removed`,
  };
}

export function repairWorld(name: string): { success: boolean; repairs: string[]; message: string } {
  const nameSanitized = sanitizeWorldName(name);
  const worldPath = path.join(getWorldsDir(), nameSanitized);
  if (!fs.existsSync(worldPath)) throw new Error('World not found');

  const repairs: string[] = [];

  // Ensure essential directories exist
  const essentialDirs = ['region', 'data', 'playerdata', 'stats', 'advancements'];
  for (const dir of essentialDirs) {
    const dirPath = path.join(worldPath, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      repairs.push(`Created missing directory: ${dir}`);
    }
  }

  // Check level.dat exists
  if (!fs.existsSync(path.join(worldPath, 'level.dat'))) {
    // Create a minimal level.dat
    try {
      const { nbt } = require('prismarine-nbt');
      const now = Date.now();
      const data = {
        Data: {
          version: { value: 4189, type: 'int' },
          DataVersion: { value: 4189, type: 'int' },
          Version: { value: { Id: { value: 4189, type: 'int' }, Name: { value: '1.21.4', type: 'string' }, Snapshot: { value: 0, type: 'byte' }, Series: { value: 'main', type: 'string' } }, type: 'compound' },
          RandomSeed: { value: Math.floor(Math.random() * 2147483647), type: 'long' },
          GameType: { value: 0, type: 'int' },
          Difficulty: { value: 2, type: 'int' },
          hardcore: { value: 0, type: 'byte' },
          MapFeatures: { value: 1, type: 'byte' },
          initialized: { value: 1, type: 'byte' },
          LevelName: { value: nameSanitized, type: 'string' },
          SpawnX: { value: 0, type: 'int' },
          SpawnY: { value: 64, type: 'int' },
          SpawnZ: { value: 0, type: 'int' },
          LastPlayed: { value: now, type: 'long' },
          Time: { value: 0, type: 'long' },
          DayTime: { value: 1000, type: 'long' },
          SizeOnDisk: { value: 0, type: 'long' },
        },
        type: 'compound',
      };
      const buf = nbt.writeUncompressed(data);
      const compressed = require('zlib').gzipSync(buf);
      fs.writeFileSync(path.join(worldPath, 'level.dat'), compressed);
      repairs.push('Recreated missing level.dat');
    } catch {
      repairs.push('Failed to recreate level.dat');
    }
  }

  // Scan for corrupt region files
  const dims = ['.', 'DIM-1', 'DIM1'];
  for (const dim of dims) {
    const regionDir = path.join(worldPath, dim, 'region');
    if (!fs.existsSync(regionDir)) continue;
    try {
      const files = fs.readdirSync(regionDir).filter(f => f.endsWith('.mca'));
      for (const file of files) {
        const filePath = path.join(regionDir, file);
        try {
          const fd = fs.openSync(filePath, 'r');
          const stat = fs.fstatSync(fd);
          if (stat.size < 4096) {
            fs.closeSync(fd);
            fs.unlinkSync(filePath);
            repairs.push(`Removed corrupt region file: ${dim}/region/${file}`);
            continue;
          }
          const header = Buffer.alloc(4096);
          fs.readSync(fd, header, 0, 4096, 0);
          // Validate header entries
          for (let i = 0; i < 1024; i++) {
            const offset = header.readUInt32BE(i * 4);
            if (offset !== 0) {
              const sectorOffset = offset >> 8;
              const sectorCount = offset & 0xff;
              if (sectorOffset < 2 || sectorCount === 0 || sectorCount > 255) {
                header.writeUInt32BE(0, i * 4);
              }
            }
          }
          fs.closeSync(fd);
        } catch (e) {
          repairs.push(`Corrupt file detected: ${dim}/region/${file}`);
        }
      }
    } catch {}
  }

  const db = getDatabase();
  db.prepare("UPDATE worlds SET repair_status = 'completed', last_repaired = ? WHERE name = ?")
    .run(new Date().toISOString(), nameSanitized);

  return {
    success: true,
    repairs,
    message: repairs.length > 0
      ? `Repaired ${nameSanitized}: ${repairs.join(', ')}`
      : `${nameSanitized} is healthy, no repairs needed`,
  };
}

export function getPlayerCountForWorld(worldName: string): number {
  const db = getDatabase();
  const row = db.prepare("SELECT COUNT(*) as c FROM players WHERE world_name = ? AND status = 'online'").get(worldName) as any;
  return row?.c || 0;
}

export function updateWorldFromServerProperties(name: string): void {
  const db = getDatabase();
  const propsPath = path.join(getServerDir(), 'server.properties');
  if (!fs.existsSync(propsPath)) return;

  try {
    const content = fs.readFileSync(propsPath, 'utf-8');
    const levelName = content.match(/^level-name=(.*)$/m)?.[1]?.trim() || 'world';
    const gamemode = content.match(/^gamemode=(.*)$/m)?.[1]?.trim() || 'survival';
    const difficulty = content.match(/^difficulty=(.*)$/m)?.[1]?.trim() || 'normal';
    const seed = content.match(/^level-seed=(.*)$/m)?.[1]?.trim() || '';
    const maxPlayers = content.match(/^max-players=(.*)$/m)?.[1]?.trim() || '20';
    const viewDistance = content.match(/^view-distance=(.*)$/m)?.[1]?.trim() || '10';
    const simDistance = content.match(/^simulation-distance=(.*)$/m)?.[1]?.trim() || '10';

    db.prepare('UPDATE worlds SET gamemode = ?, difficulty = ?, seed = ?, view_distance = ?, simulation_distance = ?, folder_path = ? WHERE name = ?')
      .run(gamemode, difficulty, seed, parseInt(viewDistance), parseInt(simDistance), path.join(getWorldsDir(), name), name);
  } catch {}
}
