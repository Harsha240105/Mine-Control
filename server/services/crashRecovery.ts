import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface CrashRecord {
  timestamp: string;
  code: number | null;
  snippet: string;
  javaVersion: string;
  cwd: string;
  autoRestart: boolean;
  restarted: boolean;
  recoveryNotes: string[];
}

const MAX_CRASH_LOG = 20;

export function getCrashLogPath(serverDir: string): string {
  const crashDir = path.join(serverDir, 'crash-reports');
  if (!fs.existsSync(crashDir)) fs.mkdirSync(crashDir, { recursive: true });
  return path.join(crashDir, 'mc-crash-history.json');
}

export function recordCrash(record: CrashRecord): void {
  try {
    const logPath = getCrashLogPath(record.cwd);
    let history: CrashRecord[] = [];
    if (fs.existsSync(logPath)) {
      history = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    }
    history.unshift(record);
    if (history.length > MAX_CRASH_LOG) history = history.slice(0, MAX_CRASH_LOG);
    fs.writeFileSync(logPath, JSON.stringify(history, null, 2), 'utf-8');
  } catch {}
}

export function getCrashHistory(serverDir: string): CrashRecord[] {
  try {
    const logPath = getCrashLogPath(serverDir);
    if (!fs.existsSync(logPath)) return [];
    return JSON.parse(fs.readFileSync(logPath, 'utf-8'));
  } catch {
    return [];
  }
}

export function getRecentCrashes(serverDir: string, count = 3): CrashRecord[] {
  return getCrashHistory(serverDir).slice(0, count);
}

export function shouldAutoRestart(serverDir: string): { restart: boolean; reason: string } {
  const history = getRecentCrashes(serverDir, 5);
  if (history.length === 0) return { restart: true, reason: 'First start.' };

  const recent = history.filter(h => {
    const age = Date.now() - new Date(h.timestamp).getTime();
    return age < 5 * 60 * 1000;
  });

  if (recent.length >= 5) {
    return { restart: false, reason: `Crashed ${recent.length} times in 5 minutes. Breaking the cycle.` };
  }

  if (recent.length >= 3) {
    return { restart: false, reason: `Crashed ${recent.length} times recently. Manual intervention recommended.` };
  }

  return { restart: true, reason: 'Auto-restart enabled.' };
}

export async function backupWorldBeforeRepair(serverDir: string): Promise<string | null> {
  try {
    const worldDir = path.join(serverDir, 'world');
    if (!fs.existsSync(worldDir)) return null;

    const backupDir = path.join(serverDir, 'backups', 'pre-repair');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `world-before-repair-${timestamp}.zip`;
    const backupPath = path.join(backupDir, backupName);

    const archiver = require('archiver');
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', { zlib: { level: 1 } });

    return await new Promise<string | null>((resolve) => {
      output.on('close', () => resolve(backupPath));
      archive.on('error', () => resolve(null));
      archive.pipe(output);
      archive.directory(worldDir, 'world');
      archive.finalize();
    });
  } catch {
    return null;
  }
}

export function validateWorldIntegrity(serverDir: string): { valid: boolean; issues: string[] } {
  const worldDir = path.join(serverDir, 'world');
  const issues: string[] = [];

  if (!fs.existsSync(worldDir)) {
    return { valid: false, issues: ['World directory does not exist.'] };
  }

  const levelDat = path.join(worldDir, 'level.dat');
  if (!fs.existsSync(levelDat)) {
    issues.push('level.dat missing — world data incomplete.');
  }

  const sessionLock = path.join(worldDir, 'session.lock');
  if (fs.existsSync(sessionLock)) {
    try {
      fs.unlinkSync(sessionLock);
      issues.push('Removed stale session.lock from previous crash.');
    } catch {}
  }

  const regionDir = path.join(worldDir, 'region');
  if (fs.existsSync(regionDir)) {
    try {
      const regionFiles = fs.readdirSync(regionDir).filter(f => f.endsWith('.mca'));
      if (regionFiles.length === 0) {
        issues.push('No region files found in world/region.');
      }
    } catch {
      issues.push('Cannot read world/region directory.');
    }
  } else {
    issues.push('world/region directory missing.');
  }

  return { valid: issues.length === 0, issues };
}

export function recoverWorldAfterCrash(serverDir: string): string[] {
  const actions: string[] = [];
  const worldDir = path.join(serverDir, 'world');

  if (!fs.existsSync(worldDir)) {
    fs.mkdirSync(worldDir, { recursive: true });
    fs.mkdirSync(path.join(worldDir, 'region'), { recursive: true });
    actions.push('Recreated missing world directory.');
  }

  const sessionLock = path.join(worldDir, 'session.lock');
  if (fs.existsSync(sessionLock)) {
    try {
      fs.unlinkSync(sessionLock);
      actions.push('Removed stale session.lock.');
    } catch {}
  }

  const levelDatNew = path.join(worldDir, 'level.dat_new');
  if (fs.existsSync(levelDatNew)) {
    try {
      fs.unlinkSync(levelDatNew);
      actions.push('Removed stale level.dat_new.');
    } catch {}
  }

  const levelDatOld = path.join(worldDir, 'level.dat_old');
  if (fs.existsSync(levelDatOld) && !fs.existsSync(path.join(worldDir, 'level.dat'))) {
    try {
      fs.copyFileSync(levelDatOld, path.join(worldDir, 'level.dat'));
      actions.push('Restored level.dat from backup (level.dat_old).');
    } catch {}
  }

  return actions;
}
