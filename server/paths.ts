import path from 'path';

export const BASE_PATH: string = process.env.APP_DATA_PATH || process.cwd();

let activeMinecraftDir: string | null = null;

export function setMinecraftDir(dir: string) {
  activeMinecraftDir = dir;
}

export function getMinecraftDir(): string {
  return activeMinecraftDir || resolvePath('minecraft');
}

export function resolvePath(...segments: string[]): string {
  return path.join(BASE_PATH, ...segments);
}

export function resolveMinecraftDir(...segments: string[]): string {
  const base = getMinecraftDir() || process.env.MINECRAFT_DIR || resolvePath('minecraft');
  return path.join(base, ...segments);
}
