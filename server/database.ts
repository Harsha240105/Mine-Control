import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { resolvePath } from './paths';

const DB_PATH = resolvePath('data', 'minecontrol.db');

let db: Database.Database;

export function getDatabase(): Database.Database {
  if (!db) {
    const dataDir = path.dirname(DB_PATH);
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      db = new Database(DB_PATH);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      initializeSchema();
    } catch (err) {
      console.error('[Database] Failed to initialize:', err);
      throw new Error('Database initialization failed: ' + (err as Error).message);
    }
  }
  return db;
}

function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT,
      session_token TEXT
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      uuid TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'Member',
      status TEXT NOT NULL DEFAULT 'offline',
      last_login TEXT,
      playtime INTEGER NOT NULL DEFAULT 0,
      ip TEXT,
      join_date TEXT NOT NULL DEFAULT (datetime('now')),
      muted INTEGER NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS roles (
      name TEXT PRIMARY KEY,
      level INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#aaaaaa',
      permissions TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS whitelist (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      uuid TEXT,
      added_by TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS banned_players (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      uuid TEXT,
      reason TEXT,
      banned_by TEXT,
      banned_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS server_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      size TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      type TEXT NOT NULL DEFAULT 'manual',
      worlds TEXT NOT NULL DEFAULT '[]',
      encrypted INTEGER NOT NULL DEFAULT 0,
      path TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS worlds (
      name TEXT PRIMARY KEY,
      seed TEXT,
      gamemode TEXT NOT NULL DEFAULT 'survival',
      difficulty TEXT NOT NULL DEFAULT 'normal',
      size TEXT,
      last_backup TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plugins (
      name TEXT PRIMARY KEY,
      version TEXT NOT NULL DEFAULT '1.0',
      enabled INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      author TEXT,
      main_class TEXT
    );

    CREATE TABLE IF NOT EXISTS system_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cpu REAL NOT NULL,
      ram REAL NOT NULL,
      tps REAL NOT NULL,
      players INTEGER NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS chat_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      uuid TEXT,
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      username TEXT,
      details TEXT,
      ip TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      world TEXT NOT NULL DEFAULT 'world',
      x1 INTEGER NOT NULL DEFAULT 0,
      z1 INTEGER NOT NULL DEFAULT 0,
      x2 INTEGER NOT NULL DEFAULT 0,
      z2 INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#ff5555',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS build_tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'base',
      world TEXT NOT NULL DEFAULT 'world',
      x REAL NOT NULL DEFAULT 0,
      y REAL NOT NULL DEFAULT 0,
      z REAL NOT NULL DEFAULT 0,
      owner TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS github_issues (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'bug',
      status TEXT NOT NULL DEFAULT 'open',
      username TEXT,
      image_count INTEGER NOT NULL DEFAULT 0,
      video_count INTEGER NOT NULL DEFAULT 0,
      github_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      port INTEGER NOT NULL DEFAULT 25565,
      directory TEXT NOT NULL,
      version TEXT DEFAULT '',
      version_source TEXT DEFAULT '',
      javaPath TEXT NOT NULL DEFAULT 'java',
      jarFile TEXT NOT NULL DEFAULT 'server.jar',
      minRam TEXT NOT NULL DEFAULT '2G',
      maxRam TEXT NOT NULL DEFAULT '8G',
      motd TEXT NOT NULL DEFAULT '§bMineControl OS §7- §fMinecraft Server',
      difficulty TEXT NOT NULL DEFAULT 'normal',
      gamemode TEXT NOT NULL DEFAULT 'survival',
      pvp INTEGER NOT NULL DEFAULT 1,
      maxPlayers INTEGER NOT NULL DEFAULT 4,
      viewDistance INTEGER NOT NULL DEFAULT 10,
      onlineMode INTEGER NOT NULL DEFAULT 0,
      autoRestart INTEGER NOT NULL DEFAULT 1,
      autoBackup INTEGER NOT NULL DEFAULT 1,
      whitelistEnabled INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'stopped',
      seed TEXT DEFAULT '',
      network TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      cron TEXT NOT NULL,
      action TEXT NOT NULL,
      command TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run TEXT,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      server_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );
  `);

  // Migrate legacy server_config to a named server entry
  migrateDefaultServer();

  // Add version columns to existing servers (schema migration)
  try { db.exec('ALTER TABLE servers ADD COLUMN version TEXT DEFAULT \'\''); } catch {}
  try { db.exec('ALTER TABLE servers ADD COLUMN version_source TEXT DEFAULT \'\''); } catch {}
  try { db.exec('ALTER TABLE servers ADD COLUMN seed TEXT DEFAULT \'\''); } catch {}
  try { db.exec('ALTER TABLE servers ADD COLUMN network TEXT DEFAULT \'local\''); } catch {}
  // Populate version/source from jarFile for existing rows
  db.exec("UPDATE servers SET version = REPLACE(REPLACE(REPLACE(jarFile, 'paper-', ''), 'vanilla-', ''), '.jar', ''), version_source = CASE WHEN jarFile LIKE 'paper-%' THEN 'PaperMC' WHEN jarFile LIKE 'vanilla-%' THEN 'Mojang' ELSE '' END WHERE version = '' OR version IS NULL");

  // Seed default roles if they don't exist
  const defaultRoles = [
    { name: 'Owner', level: 100, color: '#ff5555', permissions: ['*'] },
    { name: 'Admin', level: 80, color: '#ff9900', permissions: ['server.start', 'server.stop', 'server.restart', 'backup.create', 'backup.restore', 'player.ban', 'player.unban', 'player.kick', 'player.mute', 'whitelist.manage', 'plugin.manage', 'world.manage', 'permissions.manage', 'console.send'] },
    { name: 'Moderator', level: 60, color: '#55ff55', permissions: ['player.kick', 'player.mute', 'player.ban', 'console.read', 'chat.moderate'] },
    { name: 'Trusted Member', level: 40, color: '#55ffff', permissions: ['server.status', 'console.read'] },
    { name: 'Member', level: 20, color: '#aaaaaa', permissions: ['server.status'] },
    { name: 'Guest', level: 0, color: '#555555', permissions: [] },
  ];

  const insertRole = db.prepare(
    'INSERT OR IGNORE INTO roles (name, level, color, permissions) VALUES (?, ?, ?, ?)'
  );
  for (const role of defaultRoles) {
    insertRole.run(role.name, role.level, role.color, JSON.stringify(role.permissions));
  }

  // Fix existing users with lowercase roles from previous versions
  db.prepare("UPDATE users SET role = 'Owner' WHERE role = 'owner'").run();
  db.prepare("UPDATE users SET role = 'Admin' WHERE role = 'admin'").run();
  db.prepare("UPDATE users SET role = 'Moderator' WHERE role = 'moderator'").run();

  // Seed default owner if not exists
  const existingOwner = db.prepare("SELECT id FROM users WHERE role = 'Owner'").get();
  if (!existingOwner) {
    const hash = bcrypt.hashSync('OXK@6126', 10);
    db.prepare(
      'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(uuidv4(), 'owner', hash, 'Owner');
  }
}

function migrateDefaultServer() {
  const count = db.prepare('SELECT COUNT(*) as c FROM servers').get() as any;
  if (count.c > 0) return;

  const config: Record<string, string> = {};
  const rows = db.prepare('SELECT key, value FROM server_config').all() as any[];
  for (const row of rows) {
    config[row.key] = row.value;
  }

  const existingDir = process.env.MINECRAFT_DIR || require('./paths').resolvePath('minecraft');
  const id = uuidv4();
  const name = config.serverName || 'My Server';
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-server';

  // Extract version info from jarFile
  const jarFile = config.jarFile || 'server.jar';
  let version = '';
  let versionSource = '';
  if (jarFile.startsWith('paper-')) {
    version = jarFile.replace('paper-', '').replace('.jar', '');
    versionSource = 'PaperMC';
  } else if (jarFile.startsWith('vanilla-')) {
    version = jarFile.replace('vanilla-', '').replace('.jar', '');
    versionSource = 'Mojang';
  }

  db.prepare(`
    INSERT INTO servers (id, name, slug, port, directory, version, version_source, javaPath, jarFile, minRam, maxRam, motd, difficulty, gamemode, pvp, maxPlayers, viewDistance, onlineMode, autoRestart, autoBackup, whitelistEnabled, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped')
  `).run(
    id, name, slug,
    parseInt(config.port || '25565'),
    existingDir,
    version, versionSource,
    config.javaPath || 'java',
    jarFile,
    config.minRam || '2G',
    config.maxRam || '8G',
    config.motd || '§bMineControl OS §7- §fMinecraft Server',
    config.difficulty || 'normal',
    config.gamemode || 'survival',
    config.pvp !== 'false' ? 1 : 0,
    parseInt(config.maxPlayers || '4'),
    parseInt(config.viewDistance || '10'),
    config.onlineMode === 'true' ? 1 : 0,
    config.autoRestart !== 'false' ? 1 : 0,
    config.autoBackup !== 'false' ? 1 : 0,
    config.whitelistEnabled !== 'false' ? 1 : 0,
  );

  db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('active_server_id', ?)").run(id);
}

export function generateSlug(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'server';
}

export function closeDatabase() {
  if (db) {
    db.close();
  }
}
