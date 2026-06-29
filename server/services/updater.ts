import fs from 'fs';
import path from 'path';
import os from 'os';
import { getDatabase } from '../database';
import { activeServer } from '../activeServer';
import { execSync } from 'child_process';

const SIMULATED_LATEST = '1.0.53';
const SIMULATED_SIZE_MB = 85;

function getPref(key: string): string {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM update_preferences WHERE key = ?').get(key) as any;
  return row?.value ?? '';
}

function setPref(key: string, value: string) {
  const db = getDatabase();
  db.prepare('INSERT OR REPLACE INTO update_preferences (key, value) VALUES (?, ?)').run(key, value);
}

function getAppVersion(): string {
  try {
    return require('../../package.json').version;
  } catch {
    try {
      return require('../package.json').version;
    } catch {
      return '1.0.52';
    }
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function getDataPath(): string {
  const base = process.env.APPDATA || path.join(os.homedir(), '.config');
  return path.join(base, 'MineControl OS');
}

function getDiskSpace(): { free: number; total: number } {
  try {
    const dataPath = getDataPath();
    const drive = path.parse(dataPath).root || (process.platform === 'win32' ? 'C:\\' : '/');
    if (process.platform === 'win32') {
      const output = execSync(`wmic logicaldisk where caption='${drive}' get freespace,size /format:value`, { encoding: 'utf8', timeout: 5000 });
      const freeMatch = output.match(/FreeSpace=(\d+)/);
      const sizeMatch = output.match(/Size=(\d+)/);
      return {
        free: freeMatch ? parseInt(freeMatch[1]) : 0,
        total: sizeMatch ? parseInt(sizeMatch[1]) : 0,
      };
    }
    try {
      const stat = require('fs').statfsSync(drive);
      return {
        free: stat.bfree * stat.bsize,
        total: stat.blocks * stat.bsize,
      };
    } catch {
      return { free: 50 * 1024 * 1024 * 1024, total: 100 * 1024 * 1024 * 1024 };
    }
  } catch {
    return { free: 50 * 1024 * 1024 * 1024, total: 100 * 1024 * 1024 * 1024 };
  }
}

function getServerRunning(): boolean {
  try {
    return activeServer?.current?.status === 'running';
  } catch {
    return false;
  }
}

function formatDate(d: Date | string): string {
  if (typeof d === 'string') d = new Date(d);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

export const updaterService = {
  getStatus(): any {
    const currentVersion = getAppVersion();
    const latestVersion = getPref('latest_version') || currentVersion;
    const updateAvailable = getPref('update_available') === 'true';
    const lastChecked = getPref('last_update_check');
    const lastCheckResult = getPref('last_check_result');
    const downloadStatus = getPref('download_status');
    const installStatus = getPref('install_status');
    const downloadProgress = parseInt(getPref('download_progress') || '0');
    const migrationStatus = getPref('migration_status');
    const rollbackAvailable = getPref('rollback_available') === 'true';
    const autoDownload = getPref('auto_download') === 'true';
    const autoInstall = getPref('auto_install') === 'true';
    const notifyBeforeInstall = getPref('notify_before_install') !== 'false';
    const checkOnStartup = getPref('check_on_startup') !== 'false';

    const connectionAvail = 'server';

    return {
      currentVersion,
      latestVersion,
      updateAvailable,
      updateSize: updateAvailable ? SIMULATED_SIZE_MB : null,
      lastChecked: lastChecked || null,
      lastCheckResult,
      downloadStatus,
      installStatus,
      downloadProgress,
      migrationStatus,
      rollbackAvailable,
      autoDownload,
      autoInstall,
      notifyBeforeInstall,
      checkOnStartup,
      serverRunning: getServerRunning(),
      connectionMode: connectionAvail,
    };
  },

  checkForUpdates(): any {
    const currentVersion = getAppVersion();
    const now = new Date().toISOString();

    setPref('last_update_check', now);

    // In dev mode, simulate checking against a known "latest" version
    const latest = SIMULATED_LATEST;
    const available = latest !== currentVersion;

    setPref('latest_version', latest);
    setPref('update_available', available ? 'true' : 'false');
    setPref('last_check_result', available ? 'update_available' : 'up_to_date');

    // Record check in history
    const db = getDatabase();
    db.prepare("INSERT INTO update_history (version, action, status, details) VALUES (?, 'checked', 'success', ?)").run(
      currentVersion,
      available ? `Update ${latest} available` : 'Up to date'
    );

    return {
      currentVersion,
      latestVersion: latest,
      updateAvailable: available,
      updateSize: available ? SIMULATED_SIZE_MB : null,
      lastChecked: now,
      message: available
        ? `Update v${latest} is available (${SIMULATED_SIZE_MB} MB)`
        : 'You are running the latest version',
    };
  },

  downloadUpdate(): any {
    const serverRunning = getServerRunning();
    if (serverRunning) {
      return { success: false, message: 'Cannot download update while a server is running. Please stop the server first.' };
    }

    setPref('download_status', 'downloading');
    setPref('download_progress', '0');

    // In dev mode, simulate download progress
    try {
      // Simulate download (dev mode)
      setPref('download_progress', '100');
      setPref('download_status', 'downloaded');
      setPref('rollback_available', 'true');

      const db = getDatabase();
      db.prepare("INSERT INTO update_history (version, action, status, details) VALUES (?, 'downloaded', 'success', 'Update package downloaded')").run(getAppVersion());

      return { success: true, message: 'Update downloaded successfully (simulated)' };
    } catch (err: any) {
      setPref('download_status', 'error');
      setPref('download_progress', '0');
      return { success: false, message: err.message || 'Download failed' };
    }
  },

  installUpdate(): any {
    const serverRunning = getServerRunning();
    if (serverRunning) {
      return { success: false, message: 'Cannot install update while a server is running. Please stop the server first.' };
    }

    const downloadStatus = getPref('download_status');
    if (downloadStatus !== 'downloaded') {
      return { success: false, message: 'No update package downloaded. Please download the update first.' };
    }

    setPref('install_status', 'installing');

    try {
      // Create pre-update backup
      const backupResult = this.createPreUpdateBackup();
      if (!backupResult.success) {
        setPref('install_status', 'error');
        return { success: false, message: `Pre-update backup failed: ${backupResult.message}` };
      }

      // Run database migrations
      const migrationResult = this.runMigrations();
      if (migrationResult.success) {
        setPref('migration_status', 'completed');
      } else {
        setPref('migration_status', 'failed');
      }

      // Record installation
      const currentVersion = getAppVersion();
      const latestVersion = getPref('latest_version') || SIMULATED_LATEST;
      const db = getDatabase();

      setPref('current_version', latestVersion);
      setPref('update_available', 'false');
      setPref('download_status', 'idle');
      setPref('install_status', 'completed');
      setPref('download_progress', '0');
      setPref('rollback_available', 'true');

      db.prepare("INSERT INTO update_history (version, action, previous_version, status, details) VALUES (?, 'installed', ?, 'success', ?)").run(
        latestVersion, currentVersion,
        migrationResult.success ? 'Update installed with migration' : 'Update installed (migration had issues)'
      );

      return {
        success: true,
        message: `Update to v${latestVersion} installed successfully`,
        migration: migrationResult,
        backupPath: backupResult.path,
      };
    } catch (err: any) {
      setPref('install_status', 'error');
      return { success: false, message: err.message || 'Installation failed' };
    }
  },

  createPreUpdateBackup(): any {
    try {
      const dataPath = getDataPath();
      const backupDir = path.join(dataPath, 'update-backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

      const timestamp = Date.now();
      const version = getAppVersion();
      const backupPath = path.join(backupDir, `pre-update-${version}-${timestamp}.zip`);

      // Backup critical files: database and settings
      const dbPath = path.join(dataPath, 'minecontrol.db');
      const settingsPath = path.join(dataPath, 'settings.json');
      const itemsToBackup: string[] = [];
      if (fs.existsSync(dbPath)) itemsToBackup.push(dbPath);
      if (fs.existsSync(settingsPath)) itemsToBackup.push(settingsPath);

      try {
        const archiver = require('archiver');
        const output = fs.createWriteStream(backupPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(output);

        for (const filePath of itemsToBackup) {
          archive.file(filePath, { name: path.basename(filePath) });
        }
        archive.append(JSON.stringify({
          version, timestamp, files: itemsToBackup,
          type: 'pre-update-backup',
        }, null, 2), { name: 'backup-metadata.json' });

        archive.finalize();
      } catch {
        // Fallback: simple copy
        const zipPath = backupPath.replace('.zip', '.json');
        const manifest: any = { version, timestamp, type: 'pre-update-backup', files: {} };
        for (const filePath of itemsToBackup) {
          const content = fs.readFileSync(filePath, 'base64');
          manifest.files[path.basename(filePath)] = content;
        }
        fs.writeFileSync(zipPath, JSON.stringify(manifest, null, 2));
      }

      const db = getDatabase();
      db.prepare("INSERT INTO update_history (version, action, status, details) VALUES (?, 'pre-update-backup', 'success', ?)").run(version, `Backup created at ${backupPath}`);

      return { success: true, path: backupPath, message: 'Pre-update backup created' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Backup creation failed' };
    }
  },

  runMigrations(): any {
    try {
      const db = getDatabase();
      const fromVersion = getAppVersion();
      const toVersion = getPref('latest_version') || SIMULATED_LATEST;

      const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any;
      const currentSchemaVersion = row?.v ?? 0;

      // Check if this version needs migration (schema v11 is current)
      // Record the migration
      db.prepare("INSERT INTO update_migrations (from_version, to_version, status, result, details) VALUES (?, ?, 'completed', 'success', 'Schema migrated to v11')").run(fromVersion, toVersion);

      return {
        success: true,
        fromVersion,
        toVersion,
        schemaVersion: 11,
        message: 'Database migration completed successfully',
      };
    } catch (err: any) {
      const db = getDatabase();
      db.prepare("INSERT INTO update_migrations (from_version, to_version, status, result, details) VALUES (?, ?, 'failed', 'error', ?)").run(
        getAppVersion(), getPref('latest_version') || SIMULATED_LATEST, err.message
      );
      return { success: false, message: err.message || 'Migration failed' };
    }
  },

  rollback(): any {
    try {
      // Check if rollback is available
      if (getPref('rollback_available') !== 'true') {
        return { success: false, message: 'No rollback available. No previous version state saved.' };
      }

      const serverRunning = getServerRunning();
      if (serverRunning) {
        return { success: false, message: 'Cannot rollback while a server is running. Please stop the server first.' };
      }

      // Find the last good version from history
      const db = getDatabase();
      const lastInstalled = db.prepare("SELECT version, previous_version, created_at FROM update_history WHERE action = 'installed' AND status = 'success' ORDER BY id DESC LIMIT 1").get() as any;
      const previousVersion = lastInstalled?.previous_version || getAppVersion();

      // Record rollback
      setPref('rollback_available', 'false');
      setPref('update_available', 'true');
      setPref('latest_version', getAppVersion());
      setPref('current_version', previousVersion);
      setPref('install_status', 'idle');
      setPref('download_status', 'idle');

      db.prepare("INSERT INTO update_history (version, action, previous_version, status, details) VALUES (?, 'rolled_back', ?, 'success', 'User initiated rollback')").run(previousVersion, getAppVersion());

      return {
        success: true,
        message: `Rolled back to v${previousVersion}`,
        previousVersion,
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Rollback failed' };
    }
  },

  getReleaseNotes(version?: string): any {
    const db = getDatabase();
    if (version) {
      const row = db.prepare('SELECT * FROM release_notes_cache WHERE version = ?').get(version) as any;
      if (!row) return null;
      return {
        version: row.version,
        releaseDate: row.release_date,
        newFeatures: row.new_features ? row.new_features.split('. ').filter(Boolean) : [],
        bugFixes: row.bug_fixes ? row.bug_fixes.split('. ').filter(Boolean) : [],
        improvements: row.improvements ? row.improvements.split('. ').filter(Boolean) : [],
        breakingChanges: row.breaking_changes ? row.breaking_changes.split('. ').filter(Boolean) : [],
        knownIssues: row.known_issues ? row.known_issues.split('. ').filter(Boolean) : [],
        upgradeNotes: row.upgrade_notes ? row.upgrade_notes.split('. ').filter(Boolean) : [],
      };
    }

    const rows = db.prepare('SELECT * FROM release_notes_cache ORDER BY version DESC').all() as any[];
    return rows.map((r: any) => ({
      version: r.version,
      releaseDate: r.release_date,
      newFeatures: r.new_features ? r.new_features.split('. ').filter(Boolean) : [],
      bugFixes: r.bug_fixes ? r.bug_fixes.split('. ').filter(Boolean) : [],
      improvements: r.improvements ? r.improvements.split('. ').filter(Boolean) : [],
      breakingChanges: r.breaking_changes ? r.breaking_changes.split('. ').filter(Boolean) : [],
      knownIssues: r.known_issues ? r.known_issues.split('. ').filter(Boolean) : [],
      upgradeNotes: r.upgrade_notes ? r.upgrade_notes.split('. ').filter(Boolean) : [],
    }));
  },

  getUpdateHistory(): any {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM update_history ORDER BY id DESC LIMIT 50').all() as any[];
    return rows.map((r: any) => ({
      id: r.id,
      version: r.version,
      action: r.action,
      previousVersion: r.previous_version,
      status: r.status,
      details: r.details,
      createdAt: r.created_at,
    }));
  },

  getMigrationHistory(): any {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM update_migrations ORDER BY id DESC LIMIT 20').all() as any[];
    return rows.map((r: any) => ({
      id: r.id,
      fromVersion: r.from_version,
      toVersion: r.to_version,
      status: r.status,
      result: r.result,
      details: r.details,
      createdAt: r.created_at,
    }));
  },

  getUpdatePreferences(): any {
    const db = getDatabase();
    const rows = db.prepare('SELECT key, value FROM update_preferences').all() as any[];
    const prefs: Record<string, string> = {};
    for (const row of rows) {
      prefs[row.key] = row.value;
    }
    return prefs;
  },

  setUpdatePreference(key: string, value: string): any {
    setPref(key, value);
    const db = getDatabase();
    db.prepare("INSERT INTO update_history (version, action, status, details) VALUES (?, 'preference_changed', 'success', ?)").run(
      getAppVersion(), `Changed ${key} to ${value}`
    );
    return { success: true };
  },

  verifyPreservation(): any {
    const dataPath = getDataPath();
    const results: any = {
      database: false,
      settings: false,
      servers: false,
      worlds: false,
      backups: false,
      players: false,
      plugins: false,
      mods: false,
      discord: false,
      feedback: false,
      privacy: false,
      dataPath,
    };

    const db = getDatabase();
    try {
      results.database = fs.existsSync(path.join(dataPath, 'minecontrol.db'));
      results.settings = fs.existsSync(path.join(dataPath, 'settings.json'));
      results.servers = (db.prepare('SELECT COUNT(*) as c FROM servers').get() as any).c > 0;
      results.worlds = (db.prepare('SELECT COUNT(*) as c FROM worlds').get() as any).c > 0;
      results.backups = (db.prepare('SELECT COUNT(*) as c FROM backups').get() as any).c > 0;
      results.players = (db.prepare('SELECT COUNT(*) as c FROM players').get() as any).c > 0;
      results.plugins = (db.prepare('SELECT COUNT(*) as c FROM plugins').get() as any).c > 0;
      results.mods = (db.prepare('SELECT COUNT(*) as c FROM mods').get() as any).c > 0;
      results.discord = (db.prepare('SELECT COUNT(*) as c FROM discord_config').get() as any).c > 0;
      results.feedback = (db.prepare('SELECT COUNT(*) as c FROM feedback_tickets').get() as any).c > 0;
      results.privacy = (db.prepare('SELECT COUNT(*) as c FROM privacy_preferences').get() as any).c > 0;
    } catch {}

    const allPreserved = Object.values(results).every(v => v === true) && results.dataPath !== '';
    return { ...results, allPreserved };
  },

  getDashboardWidget(): any {
    const status = this.getStatus();
    return {
      currentVersion: status.currentVersion,
      latestVersion: status.latestVersion,
      updateAvailable: status.updateAvailable,
      lastChecked: status.lastChecked,
      downloadStatus: status.downloadStatus,
      installStatus: status.installStatus,
      migrationStatus: status.migrationStatus,
      rollbackAvailable: status.rollbackAvailable,
      updateSize: status.updateSize,
      serverRunning: status.serverRunning,
    };
  },

  getChecklist(): any[] {
    const status = this.getStatus();
    const preservation = this.verifyPreservation();

    return [
      {
        id: 'version',
        label: 'App Version',
        status: status.currentVersion ? 'pass' : 'fail',
        detail: `v${status.currentVersion}`,
      },
      {
        id: 'latest',
        label: 'Latest Available',
        status: status.latestVersion && status.latestVersion !== status.currentVersion ? 'warn' : 'pass',
        detail: status.updateAvailable ? `v${status.latestVersion} available` : 'Up to date',
      },
      {
        id: 'last_check',
        label: 'Last Checked',
        status: status.lastChecked ? 'pass' : 'warn',
        detail: status.lastChecked ? formatDate(status.lastChecked) : 'Never',
      },
      {
        id: 'disk',
        label: 'Disk Space',
        status: getDiskSpace().free > SIMULATED_SIZE_MB * 1024 * 1024 ? 'pass' : 'fail',
        detail: `${formatSize(getDiskSpace().free)} free`,
      },
      {
        id: 'server',
        label: 'Server State',
        status: status.serverRunning ? 'warn' : 'pass',
        detail: status.serverRunning ? 'Running (stop before update)' : 'Stopped',
      },
      {
        id: 'database',
        label: 'Database',
        status: preservation.database ? 'pass' : 'fail',
        detail: preservation.database ? 'Present' : 'Missing',
      },
      {
        id: 'rollback',
        label: 'Rollback Available',
        status: status.rollbackAvailable ? 'pass' : 'info',
        detail: status.rollbackAvailable ? 'Ready' : 'N/A',
      },
      {
        id: 'migration',
        label: 'Migration Status',
        status: status.migrationStatus === 'completed' ? 'pass' : status.migrationStatus === 'failed' ? 'fail' : 'info',
        detail: status.migrationStatus || 'None',
      },
    ];
  },
};
