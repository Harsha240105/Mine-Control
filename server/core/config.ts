import fs from 'fs';
import path from 'path';
import { BASE_PATH } from '../paths';

export interface AppConfig {
  jwtSecret: string;
  defaultOwnerPassword: string;
  skipElectron: boolean;
  logLevel: string;
  port: number;
  minecraftDir: string;
}

let cached: AppConfig | null = null;

function loadSettingsJson(): Record<string, string> {
  const settingsPath = path.join(BASE_PATH, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

export function getConfig(): AppConfig {
  if (cached) return cached;
  const settings = loadSettingsJson();
  cached = {
    jwtSecret: process.env.JWT_SECRET || settings.jwt_secret || '',
    defaultOwnerPassword: process.env.DEFAULT_OWNER_PASSWORD || settings.default_owner_password || 'minecontrol',
    skipElectron: process.env.SKIP_ELECTRON === 'true' || settings.skip_electron === 'true',
    logLevel: process.env.LOG_LEVEL || settings.log_level || 'info',
    port: parseInt(process.env.PORT || settings.port || '3001', 10),
    minecraftDir: process.env.MINECRAFT_DIR || settings.minecraft_dir || '',
  };
  return cached;
}

export function resetConfigCache(): void {
  cached = null;
}
