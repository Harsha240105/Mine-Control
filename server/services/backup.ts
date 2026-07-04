import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { getDatabase } from '../database';
import { v4 as uuidv4 } from 'uuid';
import { resolveMinecraftDir, getMinecraftDir } from '../paths';
import { emitToAll } from '../socketManager';
import { activeServer } from '../activeServer';
import { minecraftServer } from './minecraftServer';
import { eventBus } from './eventBus';

const BACKUP_DIR = () => resolveMinecraftDir('backups');
const WORLDS_DIR = () => resolveMinecraftDir('worlds');
const TEMP_DIR = () => path.join(BACKUP_DIR(), '.temp_restore');
const ENC_KEY = process.env.BACKUP_KEY || 'minecontrol-os-secure-key-2024';

const configFiles = ['server.properties', 'eula.txt', 'whitelist.json', 'ops.json', 'banned-players.json', 'banned-ips.json', 'usercache.json'];

function getActiveServerId(): string | null {
  try {
    const db = getDatabase();
    const row = db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any;
    return row?.value || null;
  } catch { return null; }
}

function getServerMeta(): { version: string; software: string } {
  try {
    const db = getDatabase();
    const id = getActiveServerId();
    if (!id) return { version: '', software: '' };
    const s = db.prepare('SELECT version, version_source FROM servers WHERE id = ?').get(id) as any;
    return s ? { version: s.version || '', software: s.version_source || '' } : { version: '', software: '' };
  } catch { return { version: '', software: '' }; }
}

function getFolderSize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) total += getFolderSize(p);
      else if (e.isFile()) total += fs.statSync(p).size;
    }
  } catch {}
  return total;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function parseSizeToBytes(sizeStr: string): number {
  const m = sizeStr.match(/^([\d.]+)\s*(B|KB|MB|GB)$/);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  switch (m[2]) {
    case 'GB': return v * 1024 * 1024 * 1024;
    case 'MB': return v * 1024 * 1024;
    case 'KB': return v * 1024;
    default: return v;
  }
}

function estimateRestoreTime(sizeBytes: number): string {
  const seconds = Math.ceil(sizeBytes / (50 * 1024 * 1024)); // ~50MB/s
  if (seconds < 60) return seconds + 's';
  return Math.ceil(seconds / 60) + 'm';
}

function addDirToArchive(archive: archiver.Archiver, dirPath: string, archiveName: string) {
  if (fs.existsSync(dirPath)) {
    archive.directory(dirPath, archiveName);
  }
}

function addFileToArchive(archive: archiver.Archiver, filePath: string, archiveName: string) {
  if (fs.existsSync(filePath)) {
    archive.file(filePath, { name: archiveName });
  }
}

export class BackupService {
  public isBackupActive: boolean = false;

  async createBackup(options: {
    name?: string;
    reason?: string;
    type?: 'manual' | 'auto' | 'scheduled' | 'pre-restore' | 'pre-migration' | 'pre-delete';
    encrypted?: boolean;
    includes?: { worlds?: boolean; players?: boolean; plugins?: boolean; mods?: boolean; config?: boolean; resourcepacks?: boolean };
    createdBy?: string;
  } = {}): Promise<any> {
    const dir = BACKUP_DIR();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const serverId = getActiveServerId();
    const meta = getServerMeta();
    const timestamp = Date.now();
    const name = options.name || `Backup-${new Date().toISOString().slice(0, 10)}-${timestamp}`;
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeName}-${timestamp}.zip`;
    const filePath = path.join(dir, fileName);
    const reason = options.reason || (options.type === 'auto' ? 'Automatic backup' : 'Manual backup');
    const inc = { worlds: true, players: true, plugins: true, mods: true, config: true, resourcepacks: true, ...options.includes };

    const mcDir = getMinecraftDir();

    // Calculate original size before compression
    let originalSize = 0;
    const manifest: Record<string, any> = {};

    try {
      if (inc.worlds && fs.existsSync(WORLDS_DIR())) {
        const worldDirs = fs.readdirSync(WORLDS_DIR(), { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.'));
        for (const w of worldDirs) {
          const wp = path.join(WORLDS_DIR(), w.name);
          const sz = getFolderSize(wp);
          originalSize += sz;
          manifest[`worlds/${w.name}`] = sz;
        }
      }
      if (inc.players) {
        const playerDir = resolveMinecraftDir('playerdata');
        const advDir = resolveMinecraftDir('advancements');
        const statDir = resolveMinecraftDir('stats');
        if (fs.existsSync(playerDir)) { const s = getFolderSize(playerDir); originalSize += s; manifest['playerdata'] = s; }
        if (fs.existsSync(advDir)) { const s = getFolderSize(advDir); originalSize += s; manifest['advancements'] = s; }
        if (fs.existsSync(statDir)) { const s = getFolderSize(statDir); originalSize += s; manifest['stats'] = s; }
      }
      if (inc.plugins) { const d = resolveMinecraftDir('plugins'); if (fs.existsSync(d)) { const s = getFolderSize(d); originalSize += s; manifest['plugins'] = s; } }
      if (inc.mods) { const d = resolveMinecraftDir('mods'); if (fs.existsSync(d)) { const s = getFolderSize(d); originalSize += s; manifest['mods'] = s; } }
      if (inc.config) {
        for (const f of configFiles) { const fp = resolveMinecraftDir(f); if (fs.existsSync(fp)) { const s = fs.statSync(fp).size; originalSize += s; manifest[`config/${f}`] = s; } }
      }
      if (inc.resourcepacks) { const d = resolveMinecraftDir('resourcepacks'); if (fs.existsSync(d)) { const s = getFolderSize(d); originalSize += s; manifest['resourcepacks'] = s; } }
    } catch {}

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', async () => {
        const compressedBytes = fs.statSync(filePath).size;
        const compressedSize = formatSize(compressedBytes);
        const ratio = originalSize > 0 ? parseFloat((compressedBytes / originalSize).toFixed(4)) : 0;

        const db = getDatabase();
        const id = uuidv4();
        const backup = {
          id, server_id: serverId, name, reason, type: options.type || 'manual',
          size: compressedSize, created_at: new Date().toISOString(),
          worlds: '[]', encrypted: options.encrypted ? 1 : 0, path: filePath,
          minecraft_version: meta.version, server_software: meta.software,
          original_size: formatSize(originalSize), compressed_size: compressedSize,
          compression_ratio: ratio, restore_count: 0, export_status: 'none',
          integrity_status: 'pending', integrity_checked_at: null,
          includes_worlds: inc.worlds ? 1 : 0, includes_players: inc.players ? 1 : 0,
          includes_plugins: inc.plugins ? 1 : 0, includes_mods: inc.mods ? 1 : 0,
          includes_config: inc.config ? 1 : 0, includes_resourcepacks: inc.resourcepacks ? 1 : 0,
          content_manifest: JSON.stringify(manifest), created_by: options.createdBy || 'system',
        };
        const cols = Object.keys(backup);
        const vals = cols.map(c => (backup as any)[c]);
        db.prepare(`INSERT INTO backups (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);

        emitToAll('backup:created', { id, name, reason, size: compressedSize });
        eventBus.emit('backup:created', { id, name, reason, size: compressedSize, type: options.type || 'manual' });
        resolve({ ...backup, worlds: [], encrypted: !!backup.encrypted, content_manifest: manifest });
      });

      archive.on('error', (err) => {
        eventBus.emit('backup:failed', { name, reason, error: err.message, type: options.type || 'manual' });
        reject(err);
      });

      // Add backup metadata
      archive.append(JSON.stringify({
        version: 2, created_at: new Date().toISOString(), name, reason,
        minecraft_version: meta.version, server_software: meta.software,
        includes: inc, manifest,
      }, null, 2), { name: 'backup_metadata.json' });

      // Add worlds
      if (inc.worlds && fs.existsSync(WORLDS_DIR())) {
        const worldDirs = fs.readdirSync(WORLDS_DIR(), { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.'));
        for (const w of worldDirs) addDirToArchive(archive, path.join(WORLDS_DIR(), w.name), `worlds/${w.name}`);
      }

      // Add player data
      if (inc.players) {
        addDirToArchive(archive, resolveMinecraftDir('playerdata'), 'playerdata');
        addDirToArchive(archive, resolveMinecraftDir('advancements'), 'advancements');
        addDirToArchive(archive, resolveMinecraftDir('stats'), 'stats');
      }

      // Add config files
      if (inc.config) {
        const configDir = resolveMinecraftDir('');
        for (const f of configFiles) addFileToArchive(archive, path.join(configDir, f), f);
      }

      // Add plugins, mods, resourcepacks
      if (inc.plugins) addDirToArchive(archive, resolveMinecraftDir('plugins'), 'plugins');
      if (inc.mods) addDirToArchive(archive, resolveMinecraftDir('mods'), 'mods');
      if (inc.resourcepacks) addDirToArchive(archive, resolveMinecraftDir('resourcepacks'), 'resourcepacks');

      archive.pipe(output);
      archive.finalize();
    });
  }

  async restoreBackup(backupId: string, options?: { restoreWorlds?: boolean, restorePlayers?: boolean, restorePlugins?: boolean, restoreMods?: boolean, restoreConfig?: boolean, restoreResourcepacks?: boolean }): Promise<{ safetyBackup: any }> {
    const db = getDatabase();
    const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId) as any;
    if (!backup) throw new Error('Backup not found');
    const filePath = backup.path;
    if (!fs.existsSync(filePath)) throw new Error('Backup file not found on disk');

    // Verify integrity first
    const integrityOk = await this.verifyIntegrity(backupId);
    if (!integrityOk) throw new Error('Backup integrity check failed. The backup file may be corrupted.');

    // Auto-create safety backup
    const safetyBackup = await this.createBackup({
      name: `Pre-restore-safety-${new Date().toISOString().slice(0, 10)}`,
      reason: 'Safety backup before restore',
      type: 'pre-restore',
    });

    // Extract to temp
    if (fs.existsSync(TEMP_DIR())) fs.rmSync(TEMP_DIR(), { recursive: true });
    fs.mkdirSync(TEMP_DIR(), { recursive: true });

    const unzipper = require('unzipper');
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(unzipper.Extract({ path: TEMP_DIR() }))
        .on('close', resolve)
        .on('error', reject);
    });

    const src = (p: string) => path.join(TEMP_DIR(), p);
    const dest = (p: string) => resolveMinecraftDir(p);

    const includes = {
      worlds: options?.restoreWorlds ?? backup.includes_worlds,
      players: options?.restorePlayers ?? backup.includes_players,
      plugins: options?.restorePlugins ?? backup.includes_plugins,
      mods: options?.restoreMods ?? backup.includes_mods,
      config: options?.restoreConfig ?? backup.includes_config,
      resourcepacks: options?.restoreResourcepacks ?? backup.includes_resourcepacks,
    };

    // Restore worlds (all dimensions)
    if (includes.worlds && fs.existsSync(src('worlds'))) {
      const worldDirs = fs.readdirSync(src('worlds'), { withFileTypes: true }).filter(d => d.isDirectory());
      for (const w of worldDirs) {
        const wSrc = path.join(src('worlds'), w.name);
        const wDest = path.join(WORLDS_DIR(), w.name);
        if (fs.existsSync(wDest)) fs.rmSync(wDest, { recursive: true });
        fs.cpSync(wSrc, wDest, { recursive: true });
      }
    }

    // Restore player data
    if (includes.players) {
      for (const sub of ['playerdata', 'advancements', 'stats']) {
        const s = src(sub);
        if (fs.existsSync(s)) {
          const d = dest(sub);
          if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
          const entries = fs.readdirSync(s, { withFileTypes: true });
          for (const e of entries) {
            if (e.isFile()) fs.copyFileSync(path.join(s, e.name), path.join(d, e.name));
          }
        }
      }
    }

    // Restore config
    if (includes.config) {
      for (const f of configFiles) {
        const s = src(f);
        if (fs.existsSync(s)) fs.copyFileSync(s, dest(f));
      }
    }

    // Restore plugins
    if (includes.plugins) {
      const s = src('plugins');
      if (fs.existsSync(s)) {
        const d = dest('plugins');
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        const entries = fs.readdirSync(s);
        for (const e of entries) {
          const ep = path.join(s, e);
          const dp = path.join(d, e);
          if (fs.statSync(ep).isDirectory()) {
            if (fs.existsSync(dp)) fs.rmSync(dp, { recursive: true });
            fs.cpSync(ep, dp, { recursive: true });
          } else {
            fs.copyFileSync(ep, dp);
          }
        }
      }
    }

    // Restore mods
    if (includes.mods) {
      const s = src('mods');
      if (fs.existsSync(s)) {
        const d = dest('mods');
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        const entries = fs.readdirSync(s);
        for (const e of entries) {
          const dp = path.join(d, e);
          if (fs.existsSync(dp)) fs.rmSync(dp, { recursive: true });
          fs.cpSync(path.join(s, e), dp);
        }
      }
    }

    // Restore resourcepacks
    if (includes.resourcepacks) {
      const s = src('resourcepacks');
      if (fs.existsSync(s)) {
        const d = dest('resourcepacks');
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        const entries = fs.readdirSync(s);
        for (const e of entries) {
          const dp = path.join(d, e);
          if (fs.existsSync(dp)) fs.rmSync(dp, { recursive: true });
          fs.cpSync(path.join(s, e), dp);
        }
      }
    }

    // Cleanup
    if (fs.existsSync(TEMP_DIR())) fs.rmSync(TEMP_DIR(), { recursive: true });

    // Update restore count
    db.prepare('UPDATE backups SET restore_count = restore_count + 1 WHERE id = ?').run(backupId);

    emitToAll('backup:restored', { id: backupId, name: backup.name, safetyBackupId: safetyBackup.id });
    eventBus.emit('backup:restored', { id: backupId, name: backup.name, size: backup.size, reason: 'Restore completed' });
    return { safetyBackup };
  }

  async exportBackup(backupId: string, outputPath?: string): Promise<string> {
    const db = getDatabase();
    const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId) as any;
    if (!backup) throw new Error('Backup not found');
    if (!fs.existsSync(backup.path)) throw new Error('Backup file not found');

    // Create portable export - wrap with metadata
    const exportDir = outputPath || path.join(BACKUP_DIR(), 'exports');
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

    const exportName = `${backup.name.replace(/[^a-zA-Z0-9_-]/g, '_')}-export.zip`;
    const exportPath = path.join(exportDir, exportName);

    // Re-package with portable metadata
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(exportPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        db.prepare("UPDATE backups SET export_status = 'exported' WHERE id = ?").run(backupId);
        emitToAll('backup:exported', { id: backupId, name: backup.name, exportPath });
        resolve(exportPath);
      });

      archive.on('error', reject);

      // Add portable metadata
      archive.append(JSON.stringify({
        export_version: 2, exported_at: new Date().toISOString(),
        original_name: backup.name, created_at: backup.created_at,
        reason: backup.reason, minecraft_version: backup.minecraft_version,
        server_software: backup.server_software,
        includes: {
          worlds: !!backup.includes_worlds, players: !!backup.includes_players,
          plugins: !!backup.includes_plugins, mods: !!backup.includes_mods,
          config: !!backup.includes_config, resourcepacks: !!backup.includes_resourcepacks,
        },
      }, null, 2), { name: 'export_metadata.json' });

      // Copy original backup contents into export
      const unzipper = require('unzipper');
      const tempExtract = path.join(BACKUP_DIR(), '.temp_export');
      if (fs.existsSync(tempExtract)) fs.rmSync(tempExtract, { recursive: true });
      fs.mkdirSync(tempExtract, { recursive: true });

      fs.createReadStream(backup.path)
        .pipe(unzipper.Extract({ path: tempExtract }))
        .on('close', () => {
          // Add all extracted files to the export archive
          const entries = fs.readdirSync(tempExtract);
          for (const e of entries) {
            const ep = path.join(tempExtract, e);
            if (fs.statSync(ep).isDirectory()) {
              archive.directory(ep, e);
            } else {
              archive.file(ep, { name: e });
            }
          }
          archive.finalize();
        })
        .on('error', reject);

      archive.pipe(output);
    });
  }

  async importBackup(filePath: string, options?: { serverId?: string; reason?: string; createdBy?: string }): Promise<any> {
    if (!fs.existsSync(filePath)) throw new Error('Import file not found');
    if (!filePath.endsWith('.zip')) throw new Error('Invalid format. Only ZIP files are supported.');

    // Validate structure
    let metadata: any = {};
    let hasValidContent = false;
    let hasMeta = false;

    const unzipper = require('unzipper');
    const tempDir = path.join(BACKUP_DIR(), '.temp_import_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });

    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(unzipper.Parse())
        .on('entry', (entry: any) => {
          const fileName = entry.path;
          if (fileName === 'backup_metadata.json' || fileName === 'export_metadata.json') {
            hasMeta = true;
            let data = '';
            entry.on('data', (d: Buffer) => data += d.toString());
            entry.on('end', () => {
              try { metadata = JSON.parse(data); } catch {}
              entry.autodrain();
            });
          } else if (fileName === 'level.dat' || fileName.startsWith('worlds/') || fileName.startsWith('playerdata/') || fileName.startsWith('plugins/') || fileName.startsWith('mods/')) {
            hasValidContent = true;
            entry.autodrain();
          } else {
            entry.autodrain();
          }
        })
        .on('close', resolve)
        .on('error', reject);
    });

    if (!hasValidContent) {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
      throw new Error('Invalid backup structure: No Minecraft server data found. Ensure the backup contains worlds, player data, plugins, or mods.');
    }

    // Extract to temp for registration
    const extractDir = path.join(tempDir, 'extract');
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
    fs.mkdirSync(extractDir, { recursive: true });

    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(unzipper.Extract({ path: extractDir }))
        .on('close', resolve)
        .on('error', reject);
    });

    const manifest: Record<string, number> = {};
    const entries = fs.readdirSync(extractDir);
    for (const e of entries) {
      const ep = path.join(extractDir, e);
      manifest[e] = fs.statSync(ep).isDirectory() ? getFolderSize(ep) : fs.statSync(ep).size;
    }

    const compressedBytes = fs.statSync(filePath).size;
    const originalSize = Object.values(manifest).reduce((a, b) => a + b, 0);
    const ratio = originalSize > 0 ? parseFloat((compressedBytes / originalSize).toFixed(4)) : 0;
    const serverId = options?.serverId || getActiveServerId();
    const meta = getServerMeta();
    const db = getDatabase();
    const id = uuidv4();
    const name = metadata.name || metadata.original_name || `Imported-${new Date().toISOString().slice(0, 10)}`;
    const backup = {
      id, server_id: serverId, name, reason: options?.reason || metadata.reason || 'Imported backup',
      type: 'manual', size: formatSize(compressedBytes), created_at: new Date().toISOString(),
      worlds: '[]', encrypted: 0, path: filePath,
      minecraft_version: metadata.minecraft_version || meta.version,
      server_software: metadata.server_software || meta.software,
      original_size: formatSize(originalSize), compressed_size: formatSize(compressedBytes),
      compression_ratio: ratio, restore_count: 0, export_status: 'none',
      integrity_status: 'verified', integrity_checked_at: new Date().toISOString(),
      includes_worlds: metadata.includes?.worlds ?? 1,
      includes_players: metadata.includes?.players ?? 1,
      includes_plugins: metadata.includes?.plugins ?? 1,
      includes_mods: metadata.includes?.mods ?? 1,
      includes_config: metadata.includes?.config ?? 1,
      includes_resourcepacks: metadata.includes?.resourcepacks ?? 1,
      content_manifest: JSON.stringify(manifest), created_by: options?.createdBy || 'import',
    };
    const cols = Object.keys(backup);
    const vals = cols.map(c => (backup as any)[c]);
    db.prepare(`INSERT INTO backups (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);

    // Move file to backups dir
    const destPath = path.join(BACKUP_DIR(), path.basename(filePath));
    if (filePath !== destPath) {
      fs.copyFileSync(filePath, destPath);
      fs.unlinkSync(filePath);
      db.prepare('UPDATE backups SET path = ? WHERE id = ?').run(destPath, id);
    }

    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });

    emitToAll('backup:imported', { id, name });
    return { ...backup, worlds: [], encrypted: false, content_manifest: manifest };
  }

  async verifyIntegrity(backupId: string): Promise<boolean> {
    const db = getDatabase();
    const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId) as any;
    if (!backup) return false;
    if (!fs.existsSync(backup.path)) return false;

    try {
      const unzipper = require('unzipper');
      let fileCount = 0;
      let hasError = false;

      await new Promise((resolve, reject) => {
        fs.createReadStream(backup.path)
          .pipe(unzipper.Parse())
          .on('entry', (entry: any) => {
            fileCount++;
            entry.on('error', () => { hasError = true; });
            entry.autodrain();
          })
          .on('close', resolve)
          .on('error', () => { hasError = true; resolve(null); });
      });

      const valid = !hasError && fileCount > 0;
      db.prepare('UPDATE backups SET integrity_status = ?, integrity_checked_at = ? WHERE id = ?')
        .run(valid ? 'passed' : 'failed', new Date().toISOString(), backupId);
      return valid;
    } catch {
      db.prepare('UPDATE backups SET integrity_status = ?, integrity_checked_at = ? WHERE id = ?')
        .run('failed', new Date().toISOString(), backupId);
      return false;
    }
  }

  getBackups(filters?: { serverId?: string; search?: string; type?: string; sort?: string; order?: string }): any[] {
    const db = getDatabase();
    let sql = 'SELECT * FROM backups WHERE 1=1';
    const params: any[] = [];

    const sid = filters?.serverId || getActiveServerId();
    if (sid) { sql += ' AND server_id = ?'; params.push(sid); }
    if (filters?.search) { sql += ' AND (name LIKE ? OR reason LIKE ?)'; params.push(`%${filters.search}%`, `%${filters.search}%`); }
    if (filters?.type) { sql += ' AND type = ?'; params.push(filters.type); }

    const sort = filters?.sort || 'created_at';
    const order = filters?.order || 'DESC';
    sql += ` ORDER BY ${sort} ${order}`;

    const backups = db.prepare(sql).all(...params) as any[];
    return backups.map(b => ({ ...b, encrypted: !!b.encrypted, worlds: (() => { try { return JSON.parse(b.worlds); } catch { return []; } })(), content_manifest: (() => { try { return JSON.parse(b.content_manifest); } catch { return {}; } })() }));
  }

  getBackup(backupId: string): any {
    const db = getDatabase();
    const b = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId) as any;
    if (!b) return null;
    return { ...b, encrypted: !!b.encrypted, worlds: (() => { try { return JSON.parse(b.worlds); } catch { return []; } })(), content_manifest: (() => { try { return JSON.parse(b.content_manifest); } catch { return {}; } })() };
  }

  deleteBackup(backupId: string): void {
    const db = getDatabase();
    const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId) as any;
    if (!backup) throw new Error('Backup not found');
    if (fs.existsSync(backup.path)) fs.unlinkSync(backup.path);
    db.prepare('DELETE FROM backups WHERE id = ?').run(backupId);
    emitToAll('backup:deleted', { id: backupId, name: backup.name });
  }

  async runCleanup(rules?: { maxBackups?: number; maxStorageMb?: number; maxAgeDays?: number }): Promise<{ deleted: number; freed: string }> {
    const db = getDatabase();
    const serverId = getActiveServerId();
    if (!serverId) return { deleted: 0, freed: '0 B' };

    // Load rules from schedule if not provided
    if (!rules) {
      const schedule = db.prepare('SELECT * FROM backup_schedule WHERE server_id = ?').get(serverId) as any;
      if (schedule) {
        rules = { maxBackups: schedule.max_backups || 0, maxStorageMb: schedule.max_storage_mb || 0, maxAgeDays: schedule.max_age_days || 0 };
      }
    }

    let backups = db.prepare('SELECT * FROM backups WHERE server_id = ? ORDER BY created_at ASC').all(serverId) as any[];
    let deleted = 0;
    let freedBytes = 0;

    // Rule: max age
    if (rules?.maxAgeDays && rules.maxAgeDays > 0) {
      const cutoff = Date.now() - rules.maxAgeDays * 86400000;
      const toDelete = backups.filter(b => new Date(b.created_at).getTime() < cutoff && b.created_at !== backups[backups.length - 1]?.created_at);
      for (const b of toDelete) {
        if (fs.existsSync(b.path)) { freedBytes += fs.statSync(b.path).size; fs.unlinkSync(b.path); }
        db.prepare('DELETE FROM backups WHERE id = ?').run(b.id);
        deleted++;
      }
      backups = db.prepare('SELECT * FROM backups WHERE server_id = ? ORDER BY created_at ASC').all(serverId) as any[];
    }

    // Rule: max storage
    if (rules?.maxStorageMb && rules.maxStorageMb > 0) {
      const maxBytes = rules.maxStorageMb * 1024 * 1024;
      let totalBytes = 0;
      for (const b of backups) { if (fs.existsSync(b.path)) totalBytes += fs.statSync(b.path).size; }
      while (totalBytes > maxBytes && backups.length > 1) {
        const oldest = backups[0];
        if (!fs.existsSync(oldest.path)) { backups.shift(); continue; }
        const sz = fs.statSync(oldest.path).size;
        fs.unlinkSync(oldest.path);
        db.prepare('DELETE FROM backups WHERE id = ?').run(oldest.id);
        totalBytes -= sz;
        freedBytes += sz;
        deleted++;
        backups.shift();
      }
    }

    // Rule: max count
    if (rules?.maxBackups && rules.maxBackups > 0 && backups.length > rules.maxBackups) {
      const toRemove = backups.length - rules.maxBackups;
      for (let i = 0; i < toRemove && i < backups.length - 1; i++) {
        const b = backups[i];
        if (fs.existsSync(b.path)) { freedBytes += fs.statSync(b.path).size; fs.unlinkSync(b.path); }
        db.prepare('DELETE FROM backups WHERE id = ?').run(b.id);
        deleted++;
      }
    }

    const freed = formatSize(freedBytes);
    emitToAll('backup:cleanup', { deleted, freed });
    return { deleted, freed };
  }

  getSchedule(): any {
    const serverId = getActiveServerId();
    if (!serverId) return null;
    const db = getDatabase();
    return db.prepare('SELECT * FROM backup_schedule WHERE server_id = ?').get(serverId) || null;
  }

  updateSchedule(data: {
    frequency?: string; enabled?: boolean; time_of_day?: string;
    day_of_week?: number; day_of_month?: number;
    max_backups?: number; max_storage_mb?: number; max_age_days?: number;
  }): any {
    const serverId = getActiveServerId();
    if (!serverId) throw new Error('No active server');

    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM backup_schedule WHERE server_id = ?').get(serverId) as any;

    if (existing) {
      const updates: string[] = [];
      const vals: any[] = [];
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) { updates.push(`${k} = ?`); vals.push(v); }
      }
      if (updates.length > 0) {
        vals.push(serverId);
        db.prepare(`UPDATE backup_schedule SET ${updates.join(', ')} WHERE server_id = ?`).run(...vals);
      }
    } else {
      const schedule = {
        server_id: serverId,
        frequency: data.frequency || 'daily',
        enabled: data.enabled ? 1 : 0,
        time_of_day: data.time_of_day || '03:00',
        day_of_week: data.day_of_week ?? 0,
        day_of_month: data.day_of_month ?? 1,
        max_backups: data.max_backups || 0,
        max_storage_mb: data.max_storage_mb || 0,
        max_age_days: data.max_age_days || 0,
      };
      const cols = Object.keys(schedule);
      const vals = cols.map(c => (schedule as any)[c]);
      db.prepare(`INSERT INTO backup_schedule (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);
    }

    emitToAll('backup:schedule-updated');
    return this.getSchedule();
  }

  getStorageStats(): { totalSize: string; totalOriginalSize: string; backupCount: number; compressedRatio: number; largestBackup: string; oldestBackup: string; newestBackup: string } {
    const serverId = getActiveServerId();
    if (!serverId) return { totalSize: '0 B', totalOriginalSize: '0 B', backupCount: 0, compressedRatio: 0, largestBackup: '0 B', oldestBackup: '', newestBackup: '' };

    const db = getDatabase();
    const backups = db.prepare('SELECT * FROM backups WHERE server_id = ? ORDER BY created_at ASC').all(serverId) as any[];
    const count = backups.length;
    if (count === 0) return { totalSize: '0 B', totalOriginalSize: '0 B', backupCount: 0, compressedRatio: 0, largestBackup: '0 B', oldestBackup: '', newestBackup: '' };

    let totalBytes = 0;
    let totalOrigBytes = 0;
    let largest = 0;
    for (const b of backups) {
      if (fs.existsSync(b.path)) totalBytes += fs.statSync(b.path).size;
      totalOrigBytes += parseSizeToBytes(b.original_size || '0 B');
      const sz = parseSizeToBytes(b.size);
      if (sz > largest) largest = sz;
    }
    const ratio = totalOrigBytes > 0 ? totalBytes / totalOrigBytes : 0;

    return {
      totalSize: formatSize(totalBytes),
      totalOriginalSize: formatSize(totalOrigBytes),
      backupCount: count,
      compressedRatio: parseFloat(ratio.toFixed(4)),
      largestBackup: formatSize(largest),
      oldestBackup: backups[0]?.created_at || '',
      newestBackup: backups[count - 1]?.created_at || '',
    };
  }

  async runScheduledBackups(): Promise<void> {
    const db = getDatabase();
    const schedules = db.prepare('SELECT * FROM backup_schedule WHERE enabled = 1').all() as any[];
    const now = new Date();

    for (const s of schedules) {
      if (s.next_run && new Date(s.next_run) > now) continue;

      await this.createBackup({
        name: `Scheduled-${new Date().toISOString().slice(0, 10)}`,
        reason: `Scheduled ${s.frequency} backup`,
        type: 'scheduled',
      });

      // Calculate next run
      const next = new Date(now);
      const [h, m] = (s.time_of_day || '03:00').split(':').map(Number);
      next.setHours(h, m, 0, 0);

      switch (s.frequency) {
        case 'daily': next.setDate(next.getDate() + 1); break;
        case 'weekly': next.setDate(next.getDate() + 7); break;
        case 'monthly': next.setMonth(next.getMonth() + 1); break;
      }

      db.prepare('UPDATE backup_schedule SET last_run = ?, next_run = ? WHERE id = ?')
        .run(now.toISOString(), next.toISOString(), s.id);

      // Run cleanup after scheduled backup
      await this.runCleanup({
        maxBackups: s.max_backups || 0,
        maxStorageMb: s.max_storage_mb || 0,
        maxAgeDays: s.max_age_days || 0,
      });
    }
  }

  getBackupLog(): any[] {
    const db = getDatabase();
    const serverId = getActiveServerId();
    if (!serverId) return [];
    return db.prepare('SELECT id, name, reason, type, size, created_at, integrity_status, restore_count, minecraft_version, server_software FROM backups WHERE server_id = ? ORDER BY created_at DESC LIMIT 100').all(serverId);
  }
}

export const backupService = new BackupService();

// Auto-backup trigger helper — checks settings and creates backup if enabled
export async function autoBackupIfEnabled(reason: string, eventKey: string): Promise<any | null> {
  try {
    const db = getDatabase();
    const row = db.prepare("SELECT value FROM server_config WHERE key = ?").get(`backup_${eventKey}`) as any;
    if (row?.value === 'true') {
      return await backupService.createBackup({
        name: `Auto-${reason.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}`,
        reason: `Auto-backup: ${reason}`,
        type: 'auto',
      });
    }
  } catch {}
  return null;
}
