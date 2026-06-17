export interface ServerStatus {
  running: boolean;
  onlinePlayers: number;
  maxPlayers: number;
  cpuUsage: number;
  ramUsage: number;
  ramTotal: number;
  tps: number;
  storageUsage: number;
  storageTotal: number;
  networkIn: number;
  networkOut: number;
  uptime: number;
  startedAt: string | null;
}

export interface Player {
  id: string;
  username: string;
  uuid: string;
  role: RoleName;
  status: 'online' | 'offline' | 'banned';
  lastLogin: string;
  playtime: number;
  ip: string;
  joinDate: string;
  muted: boolean;
  permissions: string[];
}

export type RoleName = 'Owner' | 'Admin' | 'Moderator' | 'Trusted Member' | 'Member' | 'Guest';

export interface Role {
  name: RoleName;
  level: number;
  permissions: string[];
  color: string;
}

export interface World {
  name: string;
  size: string;
  players: number;
  lastBackup: string;
  seed: string;
  gamemode: string;
  difficulty: string;
}

export interface Plugin {
  name: string;
  version: string;
  enabled: boolean;
  description: string;
  author: string;
  main: string;
}

export interface Backup {
  id: string;
  name: string;
  size: string;
  createdAt: string;
  type: 'manual' | 'auto';
  worlds: string[];
  encrypted: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'FATAL';
  message: string;
  source?: string;
}

export interface ChatMessage {
  timestamp: string;
  username: string;
  message: string;
  uuid: string;
}

export interface SystemStats {
  cpu: number;
  ram: number;
  tps: number;
  players: number;
  timestamp: number;
}

export interface User {
  id: string;
  username: string;
  role: 'owner' | 'admin';
  token?: string;
}

export interface PermissionMatrix {
  role: string;
  permissions: Record<string, boolean>;
}

export interface ServerConfig {
  javaPath: string;
  jarFile: string;
  minRam: string;
  maxRam: string;
  port: number;
  autoRestart: boolean;
  autoBackup: boolean;
  backupInterval: number;
  backupEncryption: boolean;
  whitelistEnabled: boolean;
  motd: string;
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard';
  gamemode: 'survival' | 'creative' | 'adventure' | 'spectator';
  pvp: boolean;
  maxPlayers: number;
  enableQuery: boolean;
  enableRcon: boolean;
  rconPort: number;
  rconPassword: string;
  broadcastConsoleToOps: boolean;
  announceAdvancements: boolean;
  spawnProtection: number;
  viewDistance: number;
  simulationDistance: number;
}

export const DEFAULT_ROLES: Role[] = [
  {
    name: 'Owner',
    level: 100,
    permissions: ['*'],
    color: '#ff5555',
  },
  {
    name: 'Admin',
    level: 80,
    permissions: [
      'server.start', 'server.stop', 'server.restart',
      'backup.create', 'backup.restore',
      'player.ban', 'player.unban', 'player.kick', 'player.mute',
      'whitelist.manage', 'plugin.manage', 'world.manage',
      'permissions.manage', 'console.send',
    ],
    color: '#ff9900',
  },
  {
    name: 'Moderator',
    level: 60,
    permissions: [
      'player.kick', 'player.mute', 'player.ban',
      'console.read', 'chat.moderate',
    ],
    color: '#55ff55',
  },
  {
    name: 'Trusted Member',
    level: 40,
    permissions: [
      'server.status', 'console.read',
    ],
    color: '#55ffff',
  },
  {
    name: 'Member',
    level: 20,
    permissions: [
      'server.status',
    ],
    color: '#aaaaaa',
  },
  {
    name: 'Guest',
    level: 0,
    permissions: [],
    color: '#555555',
  },
];

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  javaPath: 'java',
  jarFile: 'server.jar',
  minRam: '2G',
  maxRam: '8G',
  port: 25565,
  autoRestart: true,
  autoBackup: true,
  backupInterval: 60,
  backupEncryption: false,
  whitelistEnabled: true,
  motd: '§bMineControl OS §7- §fMinecraft Server',
  difficulty: 'normal',
  gamemode: 'survival',
  pvp: true,
  maxPlayers: 4,
  enableQuery: true,
  enableRcon: false,
  rconPort: 25575,
  rconPassword: '',
  broadcastConsoleToOps: true,
  announceAdvancements: true,
  spawnProtection: 16,
  viewDistance: 10,
  simulationDistance: 10,
};
