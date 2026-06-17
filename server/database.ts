import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'minecontrol.db');

let db: Database.Database;

export function getDatabase(): Database.Database {
  if (!db) {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema();
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
  `);

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
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('minecraft', 10);
    const { v4: uuidv4 } = require('uuid');
    db.prepare(
      'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(uuidv4(), 'owner', hash, 'Owner');
  }
}

export function closeDatabase() {
  if (db) {
    db.close();
  }
}
