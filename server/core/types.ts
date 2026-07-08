export interface ActiveServer {
  id: string;
  name: string;
  slug: string;
  port: number;
  directory: string;
  status: string;
}

export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
  last_login: string | null;
  session_token: string | null;
}

export interface ServerRow {
  id: string;
  name: string;
  slug: string;
  port: number;
  directory: string;
  version: string;
  version_source: string;
  javaPath: string;
  jarFile: string;
  minRam: string;
  maxRam: string;
  motd: string;
  difficulty: string;
  gamemode: string;
  pvp: number;
  maxPlayers: number;
  viewDistance: number;
  simulationDistance: number;
  jvm_flags: string;
  onlineMode: number;
  autoRestart: number;
  autoBackup: number;
  whitelistEnabled: number;
  status: string;
  seed: string;
  network: string;
  playit_enabled: number;
  playit_address: string;
  javaVersion: string;
  javaVendor: string;
  javaHome: string;
  created_at: string;
  updated_at: string;
}

export interface PlayerRow {
  id: string;
  username: string;
  uuid: string;
  role: string;
  status: string;
  last_login: string | null;
  playtime: number;
  ip: string;
  join_date: string;
  muted: number;
  notes: string | null;
  health: number;
  food_level: number;
  xp_level: number;
  xp_progress: number;
  dimension: string;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  world_name: string;
  death_count: number;
  kills: number;
  first_join: string | null;
  last_disconnect: string | null;
  inventory: string;
  armor: string;
  ender_chest: string;
  advancements: string;
  statistics: string;
  server_id?: string;
}

export interface BackupRow {
  id: string;
  server_id: string | null;
  name: string;
  size: string | null;
  created_at: string;
  type: string;
  worlds: string;
  encrypted: number;
  path: string;
}

export interface WorldRow {
  name: string;
  server_id: string | null;
  seed: string | null;
  gamemode: string;
  difficulty: string;
  size: string | null;
  last_backup: string | null;
  created_at: string;
  folder_path?: string;
  chunk_count?: number;
}

export interface ScheduleRow {
  id: string;
  server_id: string;
  name: string;
  cron: string;
  action: string;
  command: string | null;
  enabled: number;
  last_run: string | null;
}
