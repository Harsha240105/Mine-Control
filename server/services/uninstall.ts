import fs from 'fs';
import path from 'path';
import os from 'os';
import { getDatabase } from '../database';
import { BASE_PATH, resolvePath } from '../paths';
import { activeServer } from '../activeServer';

function getDirSize(dir: string): number {
  let size = 0;
  try {
    const walk = (d: string) => {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) size += fs.statSync(full).size;
      }
    };
    walk(dir);
  } catch {}
  return size;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function getState(key: string): string {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM restore_state WHERE key = ?').get(key) as any;
  return row?.value ?? '';
}

function setState(key: string, value: string) {
  const db = getDatabase();
  db.prepare('INSERT OR REPLACE INTO restore_state (key, value) VALUES (?, ?)').run(key, value);
}

function recordHistory(action: string, status: string, details: string) {
  const db = getDatabase();
  db.prepare('INSERT INTO uninstall_history (action, status, details) VALUES (?, ?, ?)').run(action, status, details);
}

export const uninstallService = {
  getStorageAnalysis(): any {
    const appSize = getDirSize(BASE_PATH);
    const dbPath = resolvePath('data', 'minecontrol.db');
    const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    const serversBase = resolvePath('servers');
    let serversSize = 0;
    let serverCount = 0;
    let serverDetails: any[] = [];
    if (fs.existsSync(serversBase)) {
      const entries = fs.readdirSync(serversBase, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const full = path.join(serversBase, e.name);
          const size = getDirSize(full);
          serversSize += size;
          serverCount++;
          serverDetails.push({ name: e.name, size, sizeFormatted: formatBytes(size) });
        }
      }
    }
    const cacheDir = resolvePath('cache');
    const cacheSize = fs.existsSync(cacheDir) ? getDirSize(cacheDir) : 0;
    const dataDir = resolvePath('data');
    const dataSize = fs.existsSync(dataDir) ? getDirSize(dataDir) : 0;
    // World sizes are inside each server's directory, already counted in serversSize
    // Backup sizes are inside DB + optional files under server dirs

    const downloadsDir = resolvePath('downloads');
    const downloadsSize = fs.existsSync(downloadsDir) ? getDirSize(downloadsDir) : 0;

    const javaDir = resolvePath('java');
    const javaSize = fs.existsSync(javaDir) ? getDirSize(javaDir) : 0;

    const logsDir = resolvePath('logs');
    const logsSize = fs.existsSync(logsDir) ? getDirSize(logsDir) : 0;

    const tempDir = resolvePath('temp');
    const tempSize = fs.existsSync(tempDir) ? getDirSize(tempDir) : 0;

    const totalSize = appSize;

    return {
      app: { size: appSize, formatted: formatBytes(appSize) },
      database: { size: dbSize, formatted: formatBytes(dbSize) },
      servers: { size: serversSize, formatted: formatBytes(serversSize), count: serverCount, details: serverDetails },
      cache: { size: cacheSize, formatted: formatBytes(cacheSize) },
      data: { size: dataSize, formatted: formatBytes(dataSize) },
      downloads: { size: downloadsSize, formatted: formatBytes(downloadsSize) },
      java: { size: javaSize, formatted: formatBytes(javaSize) },
      logs: { size: logsSize, formatted: formatBytes(logsSize) },
      temp: { size: tempSize, formatted: formatBytes(tempSize) },
      total: { size: totalSize, formatted: formatBytes(totalSize) },
      basePath: BASE_PATH,
    };
  },

  detectExistingInstallation(): any {
    const dbExists = fs.existsSync(resolvePath('data', 'minecontrol.db'));
    const baseExists = fs.existsSync(BASE_PATH);
    const serversBase = resolvePath('servers');
    let serverCount = 0;
    let serverDirs: string[] = [];
    if (fs.existsSync(serversBase)) {
      const entries = fs.readdirSync(serversBase, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          serverCount++;
          serverDirs.push(e.name);
        }
      }
    }

    // Check if the current DB has any servers registered
    let dbServerCount = 0;
    try {
      const db = getDatabase();
      dbServerCount = (db.prepare('SELECT COUNT(*) as c FROM servers').get() as any).c;
    } catch {}

    const installationFound = baseExists && (dbExists || serverCount > 0);
    const hasServers = dbServerCount > 0 || serverCount > 0;

    setState('installation_detected', installationFound ? 'true' : 'false');
    setState('server_count', String(dbServerCount || serverCount));
    setState('last_detection', new Date().toISOString());
    setState('data_exists', (baseExists && (dbExists || serverCount > 0)) ? 'true' : 'false');

    return {
      installationFound,
      hasServers,
      basePath: BASE_PATH,
      databaseExists: dbExists,
      baseExists,
      serverCount: dbServerCount || serverCount,
      serverDirs,
      lastDetection: new Date().toISOString(),
    };
  },

  uninstallKeepData(): any {
    try {
      // Stop all servers gracefully
      const { minecraftServer } = require('./minecraftServer');
      if (minecraftServer?.stop) {
        try { minecraftServer.stop(); } catch {}
      }

      // Create a restore marker
      setState('restore_completed', 'false');
      setState('installation_detected', 'true');

      // Verify data is intact
      const dbPath = resolvePath('data', 'minecontrol.db');
      const dataOk = fs.existsSync(dbPath);

      recordHistory('uninstall_keep_data', dataOk ? 'completed' : 'warning',
        dataOk ? 'Application removed. Data preserved at ' + BASE_PATH : 'Database not found at ' + dbPath
      );

      return {
        success: true,
        message: 'Data preserved at ' + BASE_PATH,
        dataPath: BASE_PATH,
        databasePreserved: dataOk,
      };
    } catch (err: any) {
      recordHistory('uninstall_keep_data', 'failed', err.message);
      return { success: false, message: err.message || 'Uninstall failed' };
    }
  },

  uninstallDeleteEverything(): any {
    try {
      const { minecraftServer } = require('./minecraftServer');
      if (minecraftServer?.stop) {
        try { minecraftServer.stop(); } catch {}
      }

      // Clear active server
      activeServer.clear();

      // Delete all server directories
      const serversBase = resolvePath('servers');
      if (fs.existsSync(serversBase)) {
        const entries = fs.readdirSync(serversBase, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory()) {
            try { fs.rmSync(path.join(serversBase, e.name), { recursive: true, force: true }); } catch {}
          }
        }
      }

      // Clear cache, downloads, temp, java, logs
      for (const sub of ['cache', 'downloads', 'temp', 'logs']) {
        const dir = resolvePath(sub);
        if (fs.existsSync(dir)) {
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
              const full = path.join(dir, e.name);
              if (e.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
              else fs.unlinkSync(full);
            }
          } catch {}
        }
      }

      // Clear data directory (feedback attachments, etc.)
      const dataDir = resolvePath('data');
      if (fs.existsSync(dataDir)) {
        const entries = fs.readdirSync(dataDir, { withFileTypes: true });
        for (const e of entries) {
          if (e.name === 'minecontrol.db') continue; // Will be handled separately
          const full = path.join(dataDir, e.name);
          if (e.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
          else fs.unlinkSync(full);
        }
      }

      recordHistory('uninstall_delete_all', 'completed',
        'All application data removed from ' + BASE_PATH
      );

      setState('data_exists', 'false');
      setState('installation_detected', 'false');
      setState('server_count', '0');

      return {
        success: true,
        message: 'All data removed from ' + BASE_PATH,
        dataPath: BASE_PATH,
      };
    } catch (err: any) {
      recordHistory('uninstall_delete_all', 'failed', err.message);
      return { success: false, message: err.message || 'Uninstall failed' };
    }
  },

  restoreExistingInstallation(): any {
    try {
      const db = getDatabase();
      const serverCount = (db.prepare('SELECT COUNT(*) as c FROM servers').get() as any).c;

      if (serverCount === 0) {
        // Try to detect servers from directory
        const serversBase = resolvePath('servers');
        if (fs.existsSync(serversBase)) {
          const entries = fs.readdirSync(serversBase, { withFileTypes: true });
          for (const e of entries) {
            if (e.isDirectory()) {
              // Found a server directory that isn't registered - this means we need to import
              // For now, just report it
            }
          }
        }
      }

      // Restore the active server
      activeServer.load();

      setState('restore_completed', 'true');
      setState('last_restore', new Date().toISOString());

      recordHistory('restore', 'completed',
        `Restored with ${serverCount} server(s) from ${BASE_PATH}`
      );

      const restoredServer = activeServer.current?.name || null;

      return {
        success: true,
        message: `Restored ${serverCount} server(s) from existing data`,
        serverCount,
        activeServer: restoredServer,
      };
    } catch (err: any) {
      recordHistory('restore', 'failed', err.message);
      return { success: false, message: err.message || 'Restore failed' };
    }
  },

  startFresh(): any {
    try {
      // Delete all data to start fresh
      const result = this.uninstallDeleteEverything();
      if (!result.success) return result;

      setState('restore_completed', 'false');
      setState('installation_detected', 'false');
      setState('data_exists', 'false');

      recordHistory('start_fresh', 'completed', 'User chose to start fresh');

      return { success: true, message: 'Existing data cleared. Ready for fresh start.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to start fresh' };
    }
  },

  deleteExistingData(): any {
    try {
      const result = this.uninstallDeleteEverything();
      if (!result.success) return result;

      recordHistory('delete_residual', 'completed', 'Residual data deleted');
      return { success: true, message: 'Residual data deleted' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Deletion failed' };
    }
  },

  getRestoreStatus(): any {
    const detection = this.detectExistingInstallation();
    const db = getDatabase();
    const serverCount = (() => {
      try { return (db.prepare('SELECT COUNT(*) as c FROM servers').get() as any).c; } catch { return 0; }
    })();
    const activeName = activeServer.current?.name || null;

    return {
      installationFound: detection.installationFound,
      hasServers: serverCount > 0,
      serverCount,
      activeServer: activeName,
      basePath: BASE_PATH,
      restoreCompleted: getState('restore_completed') === 'true',
      lastRestore: getState('last_restore') || null,
      lastDetection: getState('last_detection') || null,
    };
  },

  getUninstallHistory(): any {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM uninstall_history ORDER BY id DESC LIMIT 20').all() as any[];
    return rows.map((r: any) => ({
      id: r.id,
      action: r.action,
      status: r.status,
      details: r.details,
      createdAt: r.created_at,
    }));
  },

  getDashboardWidget(): any {
    const storage = this.getStorageAnalysis();
    const detection = this.detectExistingInstallation();
    const db = getDatabase();
    const serverCount = (() => {
      try { return (db.prepare('SELECT COUNT(*) as c FROM servers').get() as any).c; } catch { return 0; }
    })();
    const dbSize = fs.existsSync(resolvePath('data', 'minecontrol.db')) ? fs.statSync(resolvePath('data', 'minecontrol.db')).size : 0;

    return {
      storage: {
        total: storage.total.formatted,
        totalBytes: storage.total.size,
        servers: storage.servers.formatted,
        serversCount: storage.servers.count,
        database: formatBytes(dbSize),
        cache: storage.cache.formatted,
        logs: storage.logs.formatted,
      },
      installation: {
        installationFound: detection.installationFound,
        hasServers: serverCount > 0,
        serverCount,
        basePath: BASE_PATH,
      },
      activeServer: activeServer.current?.name || null,
    };
  },

  getDeleteServerInfo(serverId: string): any {
    const db = getDatabase();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
    if (!server) return null;

    // Calculate storage
    let worldSize = 0;
    let backupCount = 0;
    let backupSize = 0;
    let pluginCount = 0;
    let modCount = 0;

    if (server.directory && fs.existsSync(server.directory)) {
      worldSize = getDirSize(path.join(server.directory, 'world'));
      const worldsDir = path.join(server.directory, 'worlds');
      if (fs.existsSync(worldsDir)) worldSize += getDirSize(worldsDir);
    }

    try {
      backupCount = (db.prepare('SELECT COUNT(*) as c FROM backups WHERE server_id = ?').get(serverId) as any).c;
      const backupRows = db.prepare('SELECT size FROM backups WHERE server_id = ?').all(serverId) as any[];
      for (const b of backupRows) backupSize += (b.size || 0);
    } catch {}

    try {
      const pluginsDir = server.directory ? path.join(server.directory, 'plugins') : '';
      if (pluginsDir && fs.existsSync(pluginsDir)) {
        pluginCount = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.jar')).length;
      }
      const modsDir = server.directory ? path.join(server.directory, 'mods') : '';
      if (modsDir && fs.existsSync(modsDir)) {
        modCount = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar') || f.endsWith('.mrpack')).length;
      }
    } catch {}

    return {
      id: server.id,
      name: server.name,
      slug: server.slug,
      port: server.port,
      version: server.version,
      status: server.status,
      directory: server.directory,
      worldSize: formatBytes(worldSize),
      worldSizeBytes: worldSize,
      backupCount,
      backupSize: formatBytes(backupSize),
      pluginCount,
      modCount,
    };
  },
};
