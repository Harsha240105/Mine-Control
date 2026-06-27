import path from 'path';
import fs from 'fs';

function findDataRoot(): string {
  const env = process.env.APP_DATA_PATH;
  if (env) return env;
  // Use 'MineControl OS' folder at cwd
  const dataDir = path.join(process.cwd(), 'MineControl OS');
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch {
      return process.cwd();
    }
  }
  return dataDir;
}

export const BASE_PATH: string = findDataRoot();

let activeMinecraftDir: string | null = null;

let dataDirectoriesEnsured = false;

export function ensureDataDirectories() {
  if (dataDirectoriesEnsured) return;
  const dirs = [
    'data',
    'data/cache',
    'servers',
    'downloads',
    'java',
    'playit',
    'cache',
    'temp',
  ];
  for (const d of dirs) {
    const p = path.join(BASE_PATH, d);
    if (!fs.existsSync(p)) {
      try {
        fs.mkdirSync(p, { recursive: true });
      } catch (e) {
        // ignore
      }
    }
  }
  dataDirectoriesEnsured = true;
}

export function setMinecraftDir(dir: string) {
  activeMinecraftDir = dir;
}

export function getMinecraftDir(): string {
  return activeMinecraftDir || process.env.MINECRAFT_DIR || resolvePath('servers', 'default');
}

export function resolvePath(...segments: string[]): string {
  ensureDataDirectories();
  return path.join(BASE_PATH, ...segments);
}

export function resolveMinecraftDir(...segments: string[]): string {
  const base = getMinecraftDir() || process.env.MINECRAFT_DIR || resolvePath('servers', 'default');
  return path.join(base, ...segments);
}

// Ensure directories are created on module load
ensureDataDirectories();
