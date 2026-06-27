import fs from 'fs';
import path from 'path';

export interface MigrationReport {
  oldBase: string;
  newBase: string;
  moved: string[];
  skipped: string[];
  errors: { path: string; error: string }[];
  completed: boolean;
}

export function migrateData(oldBase: string, newBase: string): MigrationReport {
  const report: MigrationReport = {
    oldBase,
    newBase,
    moved: [],
    skipped: [],
    errors: [],
    completed: false,
  };

  if (!fs.existsSync(oldBase)) {
    report.completed = true;
    return report;
  }

  if (!fs.existsSync(newBase)) {
    try {
      fs.mkdirSync(newBase, { recursive: true });
    } catch (e: any) {
      report.errors.push({ path: newBase, error: e.message });
      return report;
    }
  }

  const entries = fs.readdirSync(oldBase);
  for (const entry of entries) {
    if (entry === '.' || entry === '..') continue;
    const src = path.join(oldBase, entry);
    const dest = path.join(newBase, entry);

    try {
      if (fs.existsSync(dest)) {
        const srcStat = fs.statSync(src);
        const destStat = fs.statSync(dest);

        if (entry.endsWith('.db') || entry === 'database.sqlite' || entry.endsWith('.sqlite')) {
          const destSize = destStat.size;
          if (destSize > 1024) {
            report.skipped.push(src + ' → ' + dest + ' (destination exists and is non-empty)');
            continue;
          }
        }

        if (srcStat.mtime <= destStat.mtime) {
          report.skipped.push(src + ' → ' + dest + ' (destination is newer)');
          continue;
        }
      }

      copyRecursive(src, dest);
      report.moved.push(src + ' → ' + dest);
    } catch (e: any) {
      report.errors.push({ path: src, error: e.message });
    }
  }

  if (report.errors.length === 0) {
    try {
      const remaining = fs.readdirSync(oldBase).filter(e => e !== '.' && e !== '..');
      if (remaining.length === 0) {
        fs.rmdirSync(oldBase);
      }
    } catch {}
  }

  report.completed = report.errors.length === 0;
  return report;
}

function copyRecursive(src: string, dest: string): void {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const items = fs.readdirSync(src);
    for (const item of items) {
      if (item === '.' || item === '..') continue;
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

export function backupCriticalFiles(dataPath: string): string | null {
  const dbPath = path.join(dataPath, 'data', 'minecontrol.db');
  const settingsPath = path.join(dataPath, 'settings.json');
  const backupDir = path.join(dataPath, 'update-backups');
  const timestamp = Date.now().toString();

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  try {
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, path.join(backupDir, `minecontrol.db.${timestamp}`));
    }
    if (fs.existsSync(settingsPath)) {
      fs.copyFileSync(settingsPath, path.join(backupDir, `settings.json.${timestamp}`));
    }
    return backupDir;
  } catch (e: any) {
    console.error('[Migration] Failed to back up critical files:', e.message);
    return null;
  }
}

export function cleanupOldBackups(dataPath: string, keepCount = 3): void {
  const backupDir = path.join(dataPath, 'update-backups');
  if (!fs.existsSync(backupDir)) return;

  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.db') || f.endsWith('.json'))
    .map(f => ({
      name: f,
      time: fs.statSync(path.join(backupDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time);

  for (let i = keepCount; i < files.length; i++) {
    try {
      fs.unlinkSync(path.join(backupDir, files[i].name));
    } catch {}
  }
}
