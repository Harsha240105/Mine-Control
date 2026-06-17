import path from 'path';

export const BASE_PATH: string = process.env.APP_DATA_PATH || process.cwd();

export function resolvePath(...segments: string[]): string {
  return path.join(BASE_PATH, ...segments);
}
