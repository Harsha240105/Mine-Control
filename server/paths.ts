import path from 'path';

export const BASE_PATH: string = process.env.APP_DATA_PATH || process.cwd();

export function resolvePath(...segments: string[]): string {
  return path.join(BASE_PATH, ...segments);
}

export function resolveMinecraftDir(...segments: string[]): string {
  const base = process.env.MINECRAFT_DIR || resolvePath('minecraft');
  return path.join(base, ...segments);
}
