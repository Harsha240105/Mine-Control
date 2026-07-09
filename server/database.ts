import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { resolvePath } from './paths';

const DB_PATH = resolvePath('data', 'minecontrol.db');

console.log(`[DB] Database path: ${DB_PATH}`);

// Clean stale WAL/SHM files if the main database file does not exist.
// Orphaned WAL files can cause silent replay of old data into a fresh database.
function cleanStaleWalFiles() {
  try {
    const mainExists = fs.existsSync(DB_PATH);
    if (!mainExists) {
      const walPath = DB_PATH + '-wal';
      const shmPath = DB_PATH + '-shm';
      if (fs.existsSync(walPath)) {
        fs.unlinkSync(walPath);
        console.log(`[DB] Cleaned stale WAL file: ${walPath}`);
      }
      if (fs.existsSync(shmPath)) {
        fs.unlinkSync(shmPath);
        console.log(`[DB] Cleaned stale SHM file: ${shmPath}`);
      }
    }
  } catch (e) {
    // Non-fatal; worst case SQLite handles orphaned WAL files
  }
}

let db: Database.Database;
let dbReady = false;
let dbInitError: string | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    const dataDir = path.dirname(DB_PATH);
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      cleanStaleWalFiles();
      db = new Database(DB_PATH);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      initializeSchema();
      dbReady = true;
      console.log('[Database] Initialization complete');
    } catch (err) {
      console.error('[Database] Failed to initialize:', err);
      dbInitError = (err as Error).message;
      // Still mark as ready so the app can attempt to continue
      // ensureAllTablesExist() will try to repair
      if (db) {
        try {
          ensureAllTablesExist();
          dbReady = true;
          console.log('[Database] Repair complete, continuing');
        } catch (repairErr) {
          console.error('[Database] Repair also failed:', repairErr);
          throw new Error('Database initialization failed: ' + (err as Error).message);
        }
      } else {
        throw new Error('Database initialization failed: ' + (err as Error).message);
      }
    }
  }
  return db;
}

export function isDatabaseReady(): boolean {
  return dbReady;
}

export function getDatabaseError(): string | null {
  return dbInitError;
}

function initializeSchema() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);`);

  const currentVersion = (db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any)?.v || 0;

  // Each migration is wrapped in try/catch so one failure doesn't block others.
  // ensureAllTablesExist() at the end guarantees all tables exist regardless.

  if (currentVersion < 1) {
    try {
      db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'owner',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login TEXT,
        session_token TEXT,
        totp_secret TEXT DEFAULT '',
        totp_enabled INTEGER DEFAULT 0,
        totp_recovery_codes TEXT DEFAULT '',
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
        notes TEXT,
        health REAL DEFAULT 20,
        food_level INTEGER DEFAULT 20,
        xp_level INTEGER DEFAULT 0,
        xp_progress REAL DEFAULT 0,
        dimension TEXT DEFAULT '',
        pos_x REAL DEFAULT 0,
        pos_y REAL DEFAULT 0,
        pos_z REAL DEFAULT 0,
        world_name TEXT DEFAULT 'world',
        death_count INTEGER DEFAULT 0,
        kills INTEGER DEFAULT 0,
        first_join TEXT,
        last_disconnect TEXT,
        inventory TEXT DEFAULT '[]',
        armor TEXT DEFAULT '[]',
        ender_chest TEXT DEFAULT '[]',
        advancements TEXT DEFAULT '{}',
        statistics TEXT DEFAULT '{}'
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
        server_id TEXT,
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
        server_id TEXT,
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

      CREATE TABLE IF NOT EXISTS mods (
        name TEXT PRIMARY KEY,
        version TEXT NOT NULL DEFAULT '1.0',
        enabled INTEGER NOT NULL DEFAULT 1,
        description TEXT,
        author TEXT,
        source TEXT DEFAULT '',
        modrinth_id TEXT,
        curseforge_id INTEGER,
        side TEXT DEFAULT 'both'
      );

      CREATE TABLE IF NOT EXISTS shaders (
        name TEXT PRIMARY KEY,
        version TEXT NOT NULL DEFAULT '1.0',
        enabled INTEGER NOT NULL DEFAULT 1,
        description TEXT,
        author TEXT,
        source TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS resource_packs (
        name TEXT PRIMARY KEY,
        version TEXT NOT NULL DEFAULT '1.0',
        enabled INTEGER NOT NULL DEFAULT 1,
        description TEXT,
        author TEXT,
        source TEXT DEFAULT ''
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
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS chat_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT,
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
        motd TEXT NOT NULL DEFAULT '',
        difficulty TEXT NOT NULL DEFAULT 'normal',
        gamemode TEXT NOT NULL DEFAULT 'survival',
        pvp INTEGER NOT NULL DEFAULT 1,
        maxPlayers INTEGER NOT NULL DEFAULT 4,
        viewDistance INTEGER NOT NULL DEFAULT 10,
        simulationDistance INTEGER DEFAULT 0,
        jvm_flags TEXT DEFAULT '',
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

      CREATE TABLE IF NOT EXISTS feedback_tickets (
        id TEXT PRIMARY KEY,
        ticket_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        username TEXT NOT NULL,
        diagnostic_data TEXT,
        screenshot_paths TEXT DEFAULT '[]',
        votes INTEGER NOT NULL DEFAULT 0,
        github_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ui_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

      // Add version columns to existing servers
      try {
        const serverCols = db.prepare("PRAGMA table_info('servers')").all().map((r: any) => r.name);
        if (!serverCols.includes('version')) db.exec("ALTER TABLE servers ADD COLUMN version TEXT DEFAULT ''");
        if (!serverCols.includes('version_source')) db.exec("ALTER TABLE servers ADD COLUMN version_source TEXT DEFAULT ''");
        if (!serverCols.includes('seed')) db.exec("ALTER TABLE servers ADD COLUMN seed TEXT DEFAULT ''");
        if (!serverCols.includes('network')) db.exec("ALTER TABLE servers ADD COLUMN network TEXT DEFAULT 'local'");
      } catch {}

      // Add server_id to legacy tables
      try {
        const backupCols = db.prepare("PRAGMA table_info('backups')").all().map((r: any) => r.name);
        if (!backupCols.includes('server_id')) db.exec("ALTER TABLE backups ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
        const worldCols = db.prepare("PRAGMA table_info('worlds')").all().map((r: any) => r.name);
        if (!worldCols.includes('server_id')) db.exec("ALTER TABLE worlds ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
        const chatCols = db.prepare("PRAGMA table_info('chat_log')").all().map((r: any) => r.name);
        if (!chatCols.includes('server_id')) db.exec("ALTER TABLE chat_log ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
      } catch {}

      // Add player tracking columns
      try {
        const playerCols = db.prepare("PRAGMA table_info('players')").all().map((r: any) => r.name);
        if (!playerCols.includes('health')) db.exec("ALTER TABLE players ADD COLUMN health REAL DEFAULT 20");
        if (!playerCols.includes('food_level')) db.exec("ALTER TABLE players ADD COLUMN food_level INTEGER DEFAULT 20");
        if (!playerCols.includes('xp_level')) db.exec("ALTER TABLE players ADD COLUMN xp_level INTEGER DEFAULT 0");
        if (!playerCols.includes('xp_progress')) db.exec("ALTER TABLE players ADD COLUMN xp_progress REAL DEFAULT 0");
        if (!playerCols.includes('dimension')) db.exec("ALTER TABLE players ADD COLUMN dimension TEXT DEFAULT ''");
        if (!playerCols.includes('pos_x')) db.exec("ALTER TABLE players ADD COLUMN pos_x REAL DEFAULT 0");
        if (!playerCols.includes('pos_y')) db.exec("ALTER TABLE players ADD COLUMN pos_y REAL DEFAULT 0");
        if (!playerCols.includes('pos_z')) db.exec("ALTER TABLE players ADD COLUMN pos_z REAL DEFAULT 0");
        if (!playerCols.includes('world_name')) db.exec("ALTER TABLE players ADD COLUMN world_name TEXT DEFAULT 'world'");
        if (!playerCols.includes('death_count')) db.exec("ALTER TABLE players ADD COLUMN death_count INTEGER DEFAULT 0");
        if (!playerCols.includes('kills')) db.exec("ALTER TABLE players ADD COLUMN kills INTEGER DEFAULT 0");
        if (!playerCols.includes('first_join')) db.exec("ALTER TABLE players ADD COLUMN first_join TEXT");
        if (!playerCols.includes('last_disconnect')) db.exec("ALTER TABLE players ADD COLUMN last_disconnect TEXT");
        if (!playerCols.includes('inventory')) db.exec("ALTER TABLE players ADD COLUMN inventory TEXT DEFAULT '[]'");
        if (!playerCols.includes('armor')) db.exec("ALTER TABLE players ADD COLUMN armor TEXT DEFAULT '[]'");
        if (!playerCols.includes('ender_chest')) db.exec("ALTER TABLE players ADD COLUMN ender_chest TEXT DEFAULT '[]'");
        if (!playerCols.includes('advancements')) db.exec("ALTER TABLE players ADD COLUMN advancements TEXT DEFAULT '{}'");
        if (!playerCols.includes('statistics')) db.exec("ALTER TABLE players ADD COLUMN statistics TEXT DEFAULT '{}'");
      } catch {}

      // Seed default roles
      try {
        const defaultRoles = [
          { name: 'Owner', level: 100, color: '#ff5555', permissions: ['*'] },
          { name: 'Admin', level: 80, color: '#ff9900', permissions: ['server.start', 'server.stop', 'server.restart', 'backup.create', 'backup.restore', 'player.ban', 'player.unban', 'player.kick', 'player.mute', 'whitelist.manage', 'plugin.manage', 'world.manage', 'permissions.manage', 'console.send'] },
          { name: 'Moderator', level: 60, color: '#55ff55', permissions: ['player.kick', 'player.mute', 'player.ban', 'console.read', 'chat.moderate'] },
          { name: 'Trusted Member', level: 40, color: '#55ffff', permissions: ['server.status', 'console.read'] },
          { name: 'Member', level: 20, color: '#aaaaaa', permissions: ['server.status'] },
          { name: 'Guest', level: 0, color: '#555555', permissions: [] },
        ];
        const insertRole = db.prepare('INSERT OR IGNORE INTO roles (name, level, color, permissions) VALUES (?, ?, ?, ?)');
        for (const role of defaultRoles) {
          insertRole.run(role.name, role.level, role.color, JSON.stringify(role.permissions));
        }
      } catch {}

      // Migrate legacy server_config
      try { migrateDefaultServer(); } catch {}

      // Fix existing users with lowercase roles
      try {
        db.prepare("UPDATE users SET role = 'Owner' WHERE role = 'owner'").run();
        db.prepare("UPDATE users SET role = 'Admin' WHERE role = 'admin'").run();
        db.prepare("UPDATE users SET role = 'Moderator' WHERE role = 'moderator'").run();
      } catch {}

      // Seed default owner
      try {
        const existingOwner = db.prepare("SELECT id FROM users WHERE role = 'Owner'").get();
        if (!existingOwner) {
          const defaultPassword = process.env.DEFAULT_OWNER_PASSWORD || 'minecontrol';
          console.log('[DB] Creating default owner account. Change password immediately via Settings.');
          if (!process.env.DEFAULT_OWNER_PASSWORD) {
            console.log('[DB] Default owner password is "minecontrol". Set DEFAULT_OWNER_PASSWORD env var to override.');
          }
          const hash = bcrypt.hashSync(defaultPassword, 10);
          db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(uuidv4(), 'owner', hash, 'Owner');
        }
      } catch {}

      // Create indexes
      try {
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);
          CREATE INDEX IF NOT EXISTS idx_players_username ON players(username);
          CREATE INDEX IF NOT EXISTS idx_chat_log_server_id ON chat_log(server_id);
          CREATE INDEX IF NOT EXISTS idx_chat_log_timestamp ON chat_log(timestamp);
          CREATE INDEX IF NOT EXISTS idx_backups_server_id ON backups(server_id);
          CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at);
          CREATE INDEX IF NOT EXISTS idx_worlds_server_id ON worlds(server_id);
          CREATE INDEX IF NOT EXISTS idx_schedules_server_id ON schedules(server_id);
          CREATE INDEX IF NOT EXISTS idx_system_stats_timestamp ON system_stats(timestamp);
          CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
          CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
          CREATE INDEX IF NOT EXISTS idx_notifications_server_id ON notifications(server_id);
        `);
      } catch {}

      db.prepare('INSERT INTO schema_version (version) VALUES (1)').run();
    } catch (err) {
      console.error('[DB] Migration v1 failed:', (err as Error).message);
      // Ensure schema_version tracks what we managed to create
      try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (1)').run(); } catch {}
    }
  }

  if (currentVersion < 2) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS mods (
          name TEXT PRIMARY KEY, version TEXT NOT NULL DEFAULT '1.0',
          enabled INTEGER NOT NULL DEFAULT 1, description TEXT, author TEXT,
          source TEXT DEFAULT '', modrinth_id TEXT, curseforge_id INTEGER, side TEXT DEFAULT 'both'
        );
        CREATE TABLE IF NOT EXISTS shaders (
          name TEXT PRIMARY KEY, version TEXT NOT NULL DEFAULT '1.0',
          enabled INTEGER NOT NULL DEFAULT 1, description TEXT, author TEXT, source TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS resource_packs (
          name TEXT PRIMARY KEY, version TEXT NOT NULL DEFAULT '1.0',
          enabled INTEGER NOT NULL DEFAULT 1, description TEXT, author TEXT, source TEXT DEFAULT ''
        );
      `);
      db.prepare('INSERT INTO schema_version (version) VALUES (2)').run();
    } catch (err) {
      console.error('[DB] Migration v2 failed:', (err as Error).message);
      try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (2)').run(); } catch {}
    }
  }

  if (currentVersion < 3) {
    try {
      // Add approval_status and trusted columns to players table
      const playerCols = db.prepare("PRAGMA table_info('players')").all().map((r: any) => r.name);
      if (!playerCols.includes('approval_status')) {
        db.exec("ALTER TABLE players ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'");
      }
      if (!playerCols.includes('trusted')) {
        db.exec("ALTER TABLE players ADD COLUMN trusted INTEGER NOT NULL DEFAULT 1");
      }
      if (!playerCols.includes('last_ip')) {
        db.exec("ALTER TABLE players ADD COLUMN last_ip TEXT DEFAULT ''");
      }
      if (!playerCols.includes('ops')) {
        db.exec("ALTER TABLE players ADD COLUMN ops INTEGER NOT NULL DEFAULT 0");
      }

      // Player history table
      db.exec(`
        CREATE TABLE IF NOT EXISTS player_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          player_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_data TEXT DEFAULT '',
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_player_history_player_id ON player_history(player_id);
        CREATE INDEX IF NOT EXISTS idx_player_history_timestamp ON player_history(timestamp);
        CREATE INDEX IF NOT EXISTS idx_player_history_type ON player_history(event_type);
      `);

      // Update existing players to have default approval/trusted
      db.prepare("UPDATE players SET approval_status = 'approved', trusted = 1 WHERE approval_status IS NULL").run();
      db.prepare("UPDATE players SET trusted = 1 WHERE trusted IS NULL").run();
      db.prepare("UPDATE players SET ops = 0 WHERE ops IS NULL").run();

      db.prepare('INSERT INTO schema_version (version) VALUES (3)').run();
    } catch (err) {
      console.error('[DB] Migration v3 failed:', (err as Error).message);
      try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (3)').run(); } catch {}
    }
  }

  if (currentVersion < 4) {
    try {
      // Expand worlds table with new columns
      const worldCols = db.prepare("PRAGMA table_info('worlds')").all().map((r: any) => r.name);
    if (!worldCols.includes('version')) db.exec("ALTER TABLE worlds ADD COLUMN version TEXT DEFAULT ''");
    if (!worldCols.includes('software')) db.exec("ALTER TABLE worlds ADD COLUMN software TEXT DEFAULT ''");
    if (!worldCols.includes('folder_path')) db.exec("ALTER TABLE worlds ADD COLUMN folder_path TEXT DEFAULT ''");
    if (!worldCols.includes('chunk_count')) db.exec("ALTER TABLE worlds ADD COLUMN chunk_count INTEGER DEFAULT 0");
    if (!worldCols.includes('optimization_status')) db.exec("ALTER TABLE worlds ADD COLUMN optimization_status TEXT DEFAULT 'none'");
    if (!worldCols.includes('repair_status')) db.exec("ALTER TABLE worlds ADD COLUMN repair_status TEXT DEFAULT 'none'");
    if (!worldCols.includes('last_played')) db.exec("ALTER TABLE worlds ADD COLUMN last_played TEXT");
    if (!worldCols.includes('dimension_count')) db.exec("ALTER TABLE worlds ADD COLUMN dimension_count INTEGER DEFAULT 1");
    if (!worldCols.includes('last_optimized')) db.exec("ALTER TABLE worlds ADD COLUMN last_optimized TEXT");
    if (!worldCols.includes('last_repaired')) db.exec("ALTER TABLE worlds ADD COLUMN last_repaired TEXT");
    if (!worldCols.includes('generate_structures')) db.exec("ALTER TABLE worlds ADD COLUMN generate_structures INTEGER DEFAULT 1");
    if (!worldCols.includes('bonus_chest')) db.exec("ALTER TABLE worlds ADD COLUMN bonus_chest INTEGER DEFAULT 0");
    if (!worldCols.includes('world_type')) db.exec("ALTER TABLE worlds ADD COLUMN world_type TEXT DEFAULT 'default'");
    if (!worldCols.includes('hardcore')) db.exec("ALTER TABLE worlds ADD COLUMN hardcore INTEGER DEFAULT 0");
    if (!worldCols.includes('simulation_distance')) db.exec("ALTER TABLE worlds ADD COLUMN simulation_distance INTEGER DEFAULT 10");
    if (!worldCols.includes('view_distance')) db.exec("ALTER TABLE worlds ADD COLUMN view_distance INTEGER DEFAULT 10");
    if (!worldCols.includes('player_count')) db.exec("ALTER TABLE worlds ADD COLUMN player_count INTEGER DEFAULT 0");
    if (!worldCols.includes('backup_size')) db.exec("ALTER TABLE worlds ADD COLUMN backup_size TEXT DEFAULT '0 B'");
    if (!worldCols.includes('region_size')) db.exec("ALTER TABLE worlds ADD COLUMN region_size TEXT DEFAULT '0 B'");
    if (!worldCols.includes('playerdata_size')) db.exec("ALTER TABLE worlds ADD COLUMN playerdata_size TEXT DEFAULT '0 B'");
    if (!worldCols.includes('stats_size')) db.exec("ALTER TABLE worlds ADD COLUMN stats_size TEXT DEFAULT '0 B'");
    if (!worldCols.includes('loaded_chunks')) db.exec("ALTER TABLE worlds ADD COLUMN loaded_chunks INTEGER DEFAULT 0");
    if (!worldCols.includes('server_id')) db.exec("ALTER TABLE worlds ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");

    // World dimensions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS world_dimensions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        world_name TEXT NOT NULL,
        dimension_name TEXT NOT NULL DEFAULT 'minecraft:overworld',
        display_name TEXT NOT NULL DEFAULT 'Overworld',
        size TEXT DEFAULT '0 B',
        chunk_count INTEGER DEFAULT 0,
        player_count INTEGER DEFAULT 0,
        last_activity TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (world_name) REFERENCES worlds(name) ON DELETE CASCADE,
        UNIQUE(world_name, dimension_name)
      );
      CREATE INDEX IF NOT EXISTS idx_world_dimensions_world ON world_dimensions(world_name);

      INSERT OR IGNORE INTO world_dimensions (world_name, dimension_name, display_name) 
      SELECT name, 'minecraft:overworld', 'Overworld' FROM worlds;
      INSERT OR IGNORE INTO world_dimensions (world_name, dimension_name, display_name) 
      SELECT name, 'minecraft:nether', 'Nether' FROM worlds;
      INSERT OR IGNORE INTO world_dimensions (world_name, dimension_name, display_name) 
      SELECT name, 'minecraft:end', 'End' FROM worlds;
    `);

    // Add server_id to players if not exists
    const playerCols4 = db.prepare("PRAGMA table_info('players')").all().map((r: any) => r.name);
    if (!playerCols4.includes('server_id')) {
      db.exec("ALTER TABLE players ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE SET NULL");
      db.exec("CREATE INDEX IF NOT EXISTS idx_players_server_id ON players(server_id)");
    }

    // Update dimension counts for existing worlds
    db.exec(`
      UPDATE worlds SET dimension_count = (
        SELECT COUNT(*) FROM world_dimensions WHERE world_name = worlds.name
      ) WHERE name IN (SELECT world_name FROM world_dimensions);
    `);

      db.prepare('INSERT INTO schema_version (version) VALUES (4)').run();
    } catch (err) {
      console.error('[DB] Migration v4 failed:', (err as Error).message);
      try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (4)').run(); } catch {}
    }
  }

  if (currentVersion < 5) {
    try {
      const backupCols = db.prepare("PRAGMA table_info('backups')").all().map((r: any) => r.name);
      if (!backupCols.includes('reason')) db.exec("ALTER TABLE backups ADD COLUMN reason TEXT DEFAULT ''");
      if (!backupCols.includes('minecraft_version')) db.exec("ALTER TABLE backups ADD COLUMN minecraft_version TEXT DEFAULT ''");
      if (!backupCols.includes('server_software')) db.exec("ALTER TABLE backups ADD COLUMN server_software TEXT DEFAULT ''");
      if (!backupCols.includes('original_size')) db.exec("ALTER TABLE backups ADD COLUMN original_size TEXT DEFAULT ''");
      if (!backupCols.includes('compressed_size')) db.exec("ALTER TABLE backups ADD COLUMN compressed_size TEXT DEFAULT ''");
      if (!backupCols.includes('compression_ratio')) db.exec("ALTER TABLE backups ADD COLUMN compression_ratio REAL DEFAULT 0");
      if (!backupCols.includes('restore_count')) db.exec("ALTER TABLE backups ADD COLUMN restore_count INTEGER DEFAULT 0");
      if (!backupCols.includes('export_status')) db.exec("ALTER TABLE backups ADD COLUMN export_status TEXT DEFAULT 'none'");
      if (!backupCols.includes('integrity_status')) db.exec("ALTER TABLE backups ADD COLUMN integrity_status TEXT DEFAULT 'pending'");
      if (!backupCols.includes('integrity_checked_at')) db.exec("ALTER TABLE backups ADD COLUMN integrity_checked_at TEXT");
      if (!backupCols.includes('includes_worlds')) db.exec("ALTER TABLE backups ADD COLUMN includes_worlds INTEGER DEFAULT 1");
      if (!backupCols.includes('includes_players')) db.exec("ALTER TABLE backups ADD COLUMN includes_players INTEGER DEFAULT 1");
      if (!backupCols.includes('includes_plugins')) db.exec("ALTER TABLE backups ADD COLUMN includes_plugins INTEGER DEFAULT 1");
      if (!backupCols.includes('includes_mods')) db.exec("ALTER TABLE backups ADD COLUMN includes_mods INTEGER DEFAULT 1");
      if (!backupCols.includes('includes_config')) db.exec("ALTER TABLE backups ADD COLUMN includes_config INTEGER DEFAULT 1");
      if (!backupCols.includes('includes_resourcepacks')) db.exec("ALTER TABLE backups ADD COLUMN includes_resourcepacks INTEGER DEFAULT 1");
      if (!backupCols.includes('content_manifest')) db.exec("ALTER TABLE backups ADD COLUMN content_manifest TEXT DEFAULT '{}'");
      if (!backupCols.includes('created_by')) db.exec("ALTER TABLE backups ADD COLUMN created_by TEXT DEFAULT 'system'");

      db.exec(`
        CREATE TABLE IF NOT EXISTS backup_schedule (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          frequency TEXT NOT NULL DEFAULT 'daily',
          enabled INTEGER NOT NULL DEFAULT 0,
          next_run TEXT,
          last_run TEXT,
          time_of_day TEXT DEFAULT '03:00',
          day_of_week INTEGER DEFAULT 0,
          day_of_month INTEGER DEFAULT 1,
          max_backups INTEGER DEFAULT 0,
          max_storage_mb INTEGER DEFAULT 0,
          max_age_days INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(server_id)
        );
      `);

      db.prepare('INSERT INTO schema_version (version) VALUES (5)').run();
    } catch (err) { console.error('[DB] Migration v5 failed:', (err as Error).message); try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (5)').run(); } catch {} }
  }

  if (currentVersion < 6) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS connection_diagnostics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          local_address TEXT DEFAULT '',
          lan_address TEXT DEFAULT '',
          public_ip TEXT DEFAULT '',
          playit_address TEXT DEFAULT '',
          port INTEGER DEFAULT 25565,
          server_running INTEGER DEFAULT 0,
          firewall_active INTEGER DEFAULT 0,
          firewall_rule_exists INTEGER DEFAULT 0,
          lan_reachable INTEGER DEFAULT 0,
          playit_active INTEGER DEFAULT 0,
          playit_latency INTEGER,
          local_ping_ok INTEGER DEFAULT 0,
          local_ping_latency INTEGER,
          tcp_port_open INTEGER DEFAULT 0,
          java_process_running INTEGER DEFAULT 0,
          recommended_method TEXT DEFAULT 'localhost',
          diagnostics_json TEXT DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_conn_diag_server ON connection_diagnostics(server_id);
        CREATE INDEX IF NOT EXISTS idx_conn_diag_time ON connection_diagnostics(timestamp);

        CREATE TABLE IF NOT EXISTS connection_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          preferred_mode TEXT DEFAULT 'auto',
          last_successful_method TEXT DEFAULT '',
          last_diagnostics_at TEXT,
          UNIQUE(server_id)
        );
      `);

      db.prepare('INSERT INTO schema_version (version) VALUES (6)').run();
    } catch (err) { console.error('[DB] Migration v6 failed:', (err as Error).message); try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (6)').run(); } catch {} }
  }

  if (currentVersion < 7) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS discord_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          bot_token TEXT DEFAULT '',
          guild_id TEXT DEFAULT '',
          text_channel_id TEXT DEFAULT '',
          voice_channel_id TEXT DEFAULT '',
          auto_reconnect INTEGER DEFAULT 1,
          notify_server_start INTEGER DEFAULT 1,
          notify_server_stop INTEGER DEFAULT 1,
          notify_server_crash INTEGER DEFAULT 1,
          notify_server_restart INTEGER DEFAULT 1,
          notify_backup_created INTEGER DEFAULT 1,
          notify_backup_restored INTEGER DEFAULT 1,
          notify_backup_failed INTEGER DEFAULT 1,
          notify_player_join INTEGER DEFAULT 0,
          notify_player_left INTEGER DEFAULT 0,
          notify_player_kicked INTEGER DEFAULT 0,
          notify_player_banned INTEGER DEFAULT 0,
          notify_player_unbanned INTEGER DEFAULT 1,
          notify_player_approved INTEGER DEFAULT 1,
          notify_whitelist_updated INTEGER DEFAULT 1,
          notify_software_changed INTEGER DEFAULT 1,
          notify_version_changed INTEGER DEFAULT 1,
          notify_update_available INTEGER DEFAULT 1,
          bot_status TEXT DEFAULT 'disconnected',
          last_connected_at TEXT,
          last_error TEXT DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(server_id)
        );

        CREATE TABLE IF NOT EXISTS discord_notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT DEFAULT '',
          sent_at TEXT NOT NULL DEFAULT (datetime('now')),
          success INTEGER DEFAULT 1,
          error TEXT DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_discord_notif_server ON discord_notifications(server_id);
        CREATE INDEX IF NOT EXISTS idx_discord_notif_type ON discord_notifications(event_type);
        CREATE INDEX IF NOT EXISTS idx_discord_notif_time ON discord_notifications(sent_at);
      `);

      // Migrate existing config from server_config to discord_config
      const hasDiscordConfig = db.prepare("SELECT COUNT(*) as c FROM discord_config WHERE server_id IN (SELECT value FROM server_config WHERE key = 'active_server_id')").get() as any;
      if (hasDiscordConfig.c === 0) {
        const activeId = (db.prepare("SELECT value FROM server_config WHERE key = 'active_server_id'").get() as any)?.value;
        if (activeId) {
          const token = (db.prepare("SELECT value FROM server_config WHERE key = 'discordToken'").get() as any)?.value || '';
          const channel = (db.prepare("SELECT value FROM server_config WHERE key = 'discordChannel'").get() as any)?.value || '';
          const voice = (db.prepare("SELECT value FROM server_config WHERE key = 'discordVoiceChannelId'").get() as any)?.value || '';
          db.prepare(`
            INSERT OR IGNORE INTO discord_config (server_id, bot_token, text_channel_id, voice_channel_id, bot_status)
            VALUES (?, ?, ?, ?, 'disconnected')
          `).run(activeId, token, channel, voice);
        }
      }

      db.prepare('INSERT INTO schema_version (version) VALUES (7)').run();
    } catch (err) { console.error('[DB] Migration v7 failed:', (err as Error).message); try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (7)').run(); } catch {} }
  }

  if (currentVersion < 8) {
    try {
      const hasOldTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='feedback_tickets'").get();
      let needsRecreate = false;
      if (hasOldTable) {
        const oldCols = db.prepare("PRAGMA table_info('feedback_tickets')").all().map((r: any) => r.name);
        needsRecreate = !oldCols.includes('sync_status');
      }

      if (needsRecreate) {
        // Rename old table, create new, migrate data
        db.exec(`ALTER TABLE feedback_tickets RENAME TO feedback_tickets_old`);

        db.exec(`
          CREATE TABLE feedback_tickets (
            id TEXT PRIMARY KEY,
            ticket_id TEXT UNIQUE NOT NULL,
            issue_type TEXT NOT NULL DEFAULT 'general' CHECK(issue_type IN ('bug','feature','performance','crash','general')),
            summary TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','pending','in_review','resolved','closed','rejected')),
            username TEXT NOT NULL,
            server_id TEXT,
            server_name TEXT DEFAULT '',
            world_name TEXT DEFAULT '',
            player_count INTEGER DEFAULT 0,
            minecraft_version TEXT DEFAULT '',
            server_software TEXT DEFAULT '',
            connected_plugins TEXT DEFAULT '[]',
            connected_mods TEXT DEFAULT '[]',
            connection_mode TEXT DEFAULT '',
            diagnostic_data TEXT,
            diagnostic_sanitized INTEGER NOT NULL DEFAULT 1,
            screenshot_paths TEXT DEFAULT '[]',
            attachment_paths TEXT DEFAULT '[]',
            log_snapshots TEXT DEFAULT '{}',
            error_stack_trace TEXT DEFAULT '',
            github_url TEXT,
            issue_tracker_url TEXT DEFAULT '',
            issue_tracker_id TEXT DEFAULT '',
            sync_status TEXT NOT NULL DEFAULT 'local' CHECK(sync_status IN ('local','pending','synced','failed')),
            sync_retries INTEGER NOT NULL DEFAULT 0,
            sync_last_attempt TEXT,
            sync_error TEXT DEFAULT '',
            votes INTEGER NOT NULL DEFAULT 0,
            priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','critical')),
            last_status_change_by TEXT DEFAULT '',
            last_status_change_at TEXT,
            developer_notes TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
        `);

        // Migrate data from old table
        try {
          const oldHasNotes = db.prepare("PRAGMA table_info('feedback_tickets_old')").all().map((r: any) => r.name);
          const hasDevNotes = oldHasNotes.includes('developer_notes');
          db.exec(`
            INSERT OR IGNORE INTO feedback_tickets (id, ticket_id, issue_type, summary, description, status, username, diagnostic_data, screenshot_paths, github_url, votes, developer_notes, created_at, updated_at)
            SELECT id, ticket_id, 
              CASE WHEN type='bug' THEN 'bug' WHEN type='feature' THEN 'feature' WHEN type='performance' THEN 'performance' WHEN type='crash' THEN 'crash' ELSE 'general' END,
              title, description, 
              CASE WHEN status='in_progress' THEN 'in_review' ELSE status END,
              username, diagnostic_data, screenshot_paths, github_url, votes,
              ${hasDevNotes ? 'developer_notes' : "''"},
              created_at, updated_at
            FROM feedback_tickets_old
          `);
        } catch {}
      } else if (!hasOldTable) {
        // Create from scratch
        db.exec(`
          CREATE TABLE IF NOT EXISTS feedback_tickets (
            id TEXT PRIMARY KEY,
            ticket_id TEXT UNIQUE NOT NULL,
            issue_type TEXT NOT NULL DEFAULT 'general' CHECK(issue_type IN ('bug','feature','performance','crash','general')),
            summary TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','pending','in_review','resolved','closed','rejected')),
            username TEXT NOT NULL,
            server_id TEXT,
            server_name TEXT DEFAULT '',
            world_name TEXT DEFAULT '',
            player_count INTEGER DEFAULT 0,
            minecraft_version TEXT DEFAULT '',
            server_software TEXT DEFAULT '',
            connected_plugins TEXT DEFAULT '[]',
            connected_mods TEXT DEFAULT '[]',
            connection_mode TEXT DEFAULT '',
            diagnostic_data TEXT,
            diagnostic_sanitized INTEGER NOT NULL DEFAULT 1,
            screenshot_paths TEXT DEFAULT '[]',
            attachment_paths TEXT DEFAULT '[]',
            log_snapshots TEXT DEFAULT '{}',
            error_stack_trace TEXT DEFAULT '',
            github_url TEXT,
            issue_tracker_url TEXT DEFAULT '',
            issue_tracker_id TEXT DEFAULT '',
            sync_status TEXT NOT NULL DEFAULT 'local' CHECK(sync_status IN ('local','pending','synced','failed')),
            sync_retries INTEGER NOT NULL DEFAULT 0,
            sync_last_attempt TEXT,
            sync_error TEXT DEFAULT '',
            votes INTEGER NOT NULL DEFAULT 0,
            priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','critical')),
            last_status_change_by TEXT DEFAULT '',
            last_status_change_at TEXT,
            developer_notes TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
        `);
      }

      // Ticket history table
      db.exec(`
        CREATE TABLE IF NOT EXISTS ticket_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id TEXT NOT NULL,
          field TEXT NOT NULL,
          old_value TEXT DEFAULT '',
          new_value TEXT DEFAULT '',
          changed_by TEXT NOT NULL DEFAULT 'system',
          note TEXT DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (ticket_id) REFERENCES feedback_tickets(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket ON ticket_history(ticket_id);
        CREATE INDEX IF NOT EXISTS idx_ticket_history_time ON ticket_history(created_at);
      `);

      // Ticket attachments table
      db.exec(`
        CREATE TABLE IF NOT EXISTS ticket_attachments (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL,
          file_name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          file_size INTEGER NOT NULL DEFAULT 0,
          mime_type TEXT DEFAULT '',
          type TEXT NOT NULL DEFAULT 'other' CHECK(type IN ('screenshot','log','crash_report','diagnostic','other')),
          uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (ticket_id) REFERENCES feedback_tickets(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id);
      `);

      // Sync queue for offline synchronization
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL,
          action TEXT NOT NULL DEFAULT 'create' CHECK(action IN ('create','update','sync')),
          payload TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')),
          retries INTEGER NOT NULL DEFAULT 0,
          max_retries INTEGER NOT NULL DEFAULT 10,
          error TEXT DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_attempt TEXT,
          completed_at TEXT,
          FOREIGN KEY (ticket_id) REFERENCES feedback_tickets(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
        CREATE INDEX IF NOT EXISTS idx_sync_queue_ticket ON sync_queue(ticket_id);
      `);

      // Issue tracker configuration
      db.exec(`
        CREATE TABLE IF NOT EXISTS issue_tracker_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          provider TEXT NOT NULL DEFAULT 'github' CHECK(provider IN ('github','gitlab','jira','custom')),
          url TEXT NOT NULL DEFAULT '',
          api_token TEXT DEFAULT '',
          repository TEXT DEFAULT '',
          project_key TEXT DEFAULT '',
          enabled INTEGER NOT NULL DEFAULT 0,
          auto_sync INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(server_id)
        );
      `);

      // Drop old table if migration was done
      try { db.exec(`DROP TABLE IF EXISTS feedback_tickets_old`); } catch {}

      db.prepare('INSERT INTO schema_version (version) VALUES (8)').run();
    } catch (err) { console.error('[DB] Migration v8 failed:', (err as Error).message); try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (8)').run(); } catch {} }
  }

  if (currentVersion < 9) {
    try {
      // Guide preferences (persists user settings across restarts)
      db.exec(`
        CREATE TABLE IF NOT EXISTS guide_preferences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL DEFAULT 'default',
          key TEXT NOT NULL,
          value TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(user_id, key)
        );

        CREATE TABLE IF NOT EXISTS guide_bookmarks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL DEFAULT 'default',
          section_id TEXT NOT NULL,
          article_id TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL,
          url TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(user_id, section_id, article_id)
        );

        CREATE TABLE IF NOT EXISTS guide_recently_viewed (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL DEFAULT 'default',
          section_id TEXT NOT NULL,
          article_id TEXT NOT NULL,
          title TEXT NOT NULL,
          viewed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS guide_tutorial_progress (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL DEFAULT 'default',
          tutorial_id TEXT NOT NULL,
          step_index INTEGER NOT NULL DEFAULT 0,
          completed INTEGER NOT NULL DEFAULT 0,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          completed_at TEXT,
          UNIQUE(user_id, tutorial_id)
        );

        CREATE TABLE IF NOT EXISTS guide_search_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL DEFAULT 'default',
          query TEXT NOT NULL,
          result_count INTEGER NOT NULL DEFAULT 0,
          searched_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_guide_recently_viewed_user ON guide_recently_viewed(user_id, viewed_at);
        CREATE INDEX IF NOT EXISTS idx_guide_search_history_user ON guide_search_history(user_id, searched_at);
        CREATE INDEX IF NOT EXISTS idx_guide_bookmarks_user ON guide_bookmarks(user_id);
        CREATE INDEX IF NOT EXISTS idx_guide_tutorial_progress_user ON guide_tutorial_progress(user_id);
      `);

      db.prepare('INSERT INTO schema_version (version) VALUES (9)').run();
    } catch (err) { console.error('[DB] Migration v9 failed:', (err as Error).message); try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (9)').run(); } catch {} }
  }

  if (currentVersion < 10) {
    try {
      // Privacy preferences (persists user privacy settings across restarts)
      db.exec(`
        CREATE TABLE IF NOT EXISTS privacy_preferences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS feature_permissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          feature_key TEXT NOT NULL UNIQUE,
          enabled INTEGER NOT NULL DEFAULT 1,
          label TEXT NOT NULL DEFAULT '',
          description TEXT DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS security_checks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          check_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pass','fail','warn','pending')),
          detail TEXT DEFAULT '',
          score_impact INTEGER NOT NULL DEFAULT 0,
          checked_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS encrypted_credentials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          credential_key TEXT NOT NULL UNIQUE,
          encrypted_data TEXT NOT NULL,
          iv TEXT NOT NULL,
          auth_tag TEXT NOT NULL,
          salt TEXT DEFAULT '',
          key_version INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS credential_metadata (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          credential_key TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          has_value INTEGER NOT NULL DEFAULT 0,
          source TEXT DEFAULT 'manual',
          last_updated TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS security_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          detail TEXT DEFAULT '',
          ip TEXT DEFAULT '',
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_security_audit_time ON security_audit_log(timestamp);
      `);

      // Seed default feature permissions
      const defaultPermissions = [
        { feature_key: 'filesystem_access', label: 'Filesystem Access', description: 'Access to read/write server files', enabled: 1 },
        { feature_key: 'network_access', label: 'Network Access', description: 'Outbound network connections for updates and APIs', enabled: 1 },
        { feature_key: 'firewall_changes', label: 'Firewall Changes', description: 'Ability to modify Windows Firewall rules', enabled: 1 },
        { feature_key: 'discord_integration', label: 'Discord Integration', description: 'Connect to Discord bot API', enabled: 0 },
        { feature_key: 'playit_integration', label: 'Playit.gg Integration', description: 'Connect to Playit.gg tunnel service', enabled: 0 },
        { feature_key: 'auto_updates', label: 'Automatic Updates', description: 'Check for and download application updates', enabled: 1 },
        { feature_key: 'feedback_upload', label: 'Feedback Uploads', description: 'Upload bug reports and feature requests', enabled: 0 },
        { feature_key: 'diagnostic_upload', label: 'Diagnostic Uploads', description: 'Upload diagnostic data for troubleshooting', enabled: 0 },
        { feature_key: 'external_api_calls', label: 'External API Calls', description: 'Allow calls to Mojang, PaperMC, and other APIs', enabled: 1 },
        { feature_key: 'telemetry', label: 'Usage Telemetry', description: 'Anonymous usage statistics', enabled: 0 },
      ];
      const insertPerm = db.prepare('INSERT OR IGNORE INTO feature_permissions (feature_key, label, description, enabled) VALUES (?, ?, ?, ?)');
      for (const p of defaultPermissions) {
        insertPerm.run(p.feature_key, p.label, p.description, p.enabled);
      }

      // Seed default privacy preferences
      const defaultPrefs = [
        { key: 'collect_analytics', value: 'false' },
        { key: 'mask_secrets_in_logs', value: 'true' },
        { key: 'mask_secrets_in_ui', value: 'true' },
        { key: 'auto_clear_logs', value: 'false' },
        { key: 'log_retention_days', value: '30' },
        { key: 'last_security_check', value: '' },
        { key: 'export_include_secrets', value: 'false' },
      ];
      const insertPref = db.prepare('INSERT OR IGNORE INTO privacy_preferences (key, value) VALUES (?, ?)');
      for (const p of defaultPrefs) {
        insertPref.run(p.key, p.value);
      }

      // Seed credential metadata for known credential types
      const defaultCredentials = [
        { credential_key: 'discord_bot_token', display_name: 'Discord Bot Token' },
        { credential_key: 'playit_token', display_name: 'Playit.gg Token' },
        { credential_key: 'github_token', display_name: 'GitHub API Token' },
        { credential_key: 'gitlab_token', display_name: 'GitLab API Token' },
        { credential_key: 'jira_token', display_name: 'Jira API Token' },
        { credential_key: 'issue_tracker_token', display_name: 'Issue Tracker Token' },
      ];
      const insertCred = db.prepare('INSERT OR IGNORE INTO credential_metadata (credential_key, display_name) VALUES (?, ?)');
      for (const c of defaultCredentials) {
        insertCred.run(c.credential_key, c.display_name);
      }

      // Initial security check records (will be updated on first check)
      const initialChecks = [
        { check_type: 'database_status', status: 'pending', detail: 'Not yet checked', score_impact: 0 },
        { check_type: 'encryption_status', status: 'pending', detail: 'Not yet checked', score_impact: 0 },
        { check_type: 'firewall_status', status: 'pending', detail: 'Not yet checked', score_impact: 0 },
        { check_type: 'backup_status', status: 'pending', detail: 'Not yet checked', score_impact: 0 },
        { check_type: 'credential_status', status: 'pending', detail: 'Not yet checked', score_impact: 0 },
        { check_type: 'connection_status', status: 'pending', detail: 'Not yet checked', score_impact: 0 },
        { check_type: 'permission_status', status: 'pending', detail: 'Not yet checked', score_impact: 0 },
      ];
      const insertCheck = db.prepare('INSERT OR IGNORE INTO security_checks (check_type, status, detail, score_impact) VALUES (?, ?, ?, ?)');
      for (const c of initialChecks) {
        insertCheck.run(c.check_type, c.status, c.detail, c.score_impact);
      }

      db.prepare('INSERT INTO schema_version (version) VALUES (10)').run();
    } catch (err) { console.error('[DB] Migration v10 failed:', (err as Error).message); try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (10)').run(); } catch {} }
  }

  if (currentVersion < 11) {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS update_preferences (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `).run();

      db.prepare(`
        CREATE TABLE IF NOT EXISTS update_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version TEXT NOT NULL,
          action TEXT NOT NULL,
          previous_version TEXT,
          status TEXT NOT NULL,
          details TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      db.prepare(`
        CREATE TABLE IF NOT EXISTS release_notes_cache (
          version TEXT PRIMARY KEY,
          release_date TEXT,
          new_features TEXT,
          bug_fixes TEXT,
          improvements TEXT,
          breaking_changes TEXT,
          known_issues TEXT,
          upgrade_notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      db.prepare(`
        CREATE TABLE IF NOT EXISTS update_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_version TEXT,
          to_version TEXT,
          status TEXT,
          result TEXT,
          details TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      const pkgVersion = (() => { try { return require('../../package.json').version; } catch { return '1.0.52'; } })();

      const defaultPrefs: Record<string, string> = {
        auto_download: 'false',
        auto_install: 'false',
        notify_before_install: 'true',
        check_on_startup: 'true',
        last_update_check: '',
        last_check_result: 'never',
        current_version: pkgVersion,
        update_available: 'false',
        latest_version: '',
        download_progress: '0',
        download_status: 'idle',
        install_status: 'idle',
        migration_status: 'none',
        rollback_available: 'false',
      };
      const insertPref = db.prepare('INSERT OR IGNORE INTO update_preferences (key, value) VALUES (?, ?)');
      for (const [k, v] of Object.entries(defaultPrefs)) {
        insertPref.run(k, v);
      }

      // Seed release notes cache for known versions
      const releaseNotes: Array<{ version: string; release_date: string; new_features: string; bug_fixes: string; improvements: string; breaking_changes: string; known_issues: string; upgrade_notes: string }> = [
        {
          version: '1.0.52',
          release_date: '2025-06-15',
          new_features: 'Centralized Active Server singleton. SQLite performance indexes. Graceful shutdown chain. Frontend ActiveServerContext. Database indexes. Folder structure cleanup.',
          bug_fixes: 'Discord listener leak fix. Preload IPC deduplication. Fixed concurrent socket registration.',
          improvements: 'Reduced memory footprint by 40%. Faster database queries with indexes. Cleaner architecture separation.',
          breaking_changes: 'Active Server state moved to singleton service. Database path normalized. Electron IPC channels renamed.',
          known_issues: 'Socket.IO reconnection may double-register handlers after extended idle. Minor UI flicker on theme toggle.',
          upgrade_notes: 'Settings and server data preserved automatically. SQLite schema migrated to v9.'
        },
        {
          version: '1.0.51',
          release_date: '2025-06-10',
          new_features: 'Architecture audit hardening. Critical production fixes.',
          bug_fixes: 'Fixed race condition in backup service. Resolved memory leak in console streaming. Fixed Windows path normalization on startup.',
          improvements: 'Improved error categorization in update system. Enhanced logging for debugging.',
          breaking_changes: 'None.',
          known_issues: 'Backup integrity check may report false positives on network drives.',
          upgrade_notes: 'No manual migration needed. All settings preserved.'
        },
        {
          version: '1.0.50',
          release_date: '2025-06-05',
          new_features: 'Bug fixes and polish release. Feedback system refinements.',
          bug_fixes: 'Fixed player list not refreshing. Resolved backup restore path errors. Corrected RAM allocation display.',
          improvements: 'Polish pass on all UI components. Better error messages throughout.',
          breaking_changes: 'None.',
          known_issues: 'Mod/plugin marketplace may timeout on slow connections.',
          upgrade_notes: 'All data preserved. No migration steps required.'
        }
      ];
      const insertNotes = db.prepare('INSERT OR IGNORE INTO release_notes_cache (version, release_date, new_features, bug_fixes, improvements, breaking_changes, known_issues, upgrade_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      for (const n of releaseNotes) {
        insertNotes.run(n.version, n.release_date, n.new_features, n.bug_fixes, n.improvements, n.breaking_changes, n.known_issues, n.upgrade_notes);
      }

      // Record the initial installation as update history
      db.prepare("INSERT INTO update_history (version, action, status, details) VALUES (?, 'installed', 'success', 'Initial installation or upgrade from previous version')").run(pkgVersion);

      db.prepare('INSERT INTO schema_version (version) VALUES (11)').run();
    } catch (err) { console.error('[DB] Migration v11 failed:', (err as Error).message); try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (11)').run(); } catch {} }
  }

  if (currentVersion < 12) {
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS uninstall_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          status TEXT NOT NULL,
          details TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      db.prepare(`
        CREATE TABLE IF NOT EXISTS restore_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `).run();

      const defaultRestoreState: Record<string, string> = {
        last_restore: '',
        installation_detected: 'false',
        restore_completed: 'false',
        last_detection: '',
        data_exists: 'false',
        server_count: '0',
      };
      const insertState = db.prepare('INSERT OR IGNORE INTO restore_state (key, value) VALUES (?, ?)');
      for (const [k, v] of Object.entries(defaultRestoreState)) {
        insertState.run(k, v);
      }

      db.prepare('INSERT INTO schema_version (version) VALUES (12)').run();
    } catch (err) { console.error('[DB] Migration v12 failed:', (err as Error).message); try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (12)').run(); } catch {} }
  }

  if (currentVersion < 13) {
    try {
      // Add GitHub sync columns to feedback_tickets
      const ticketCols = db.prepare("PRAGMA table_info('feedback_tickets')").all().map((r: any) => r.name);
      if (!ticketCols.includes('github_state')) db.exec("ALTER TABLE feedback_tickets ADD COLUMN github_state TEXT DEFAULT ''");
      if (!ticketCols.includes('github_labels')) db.exec("ALTER TABLE feedback_tickets ADD COLUMN github_labels TEXT DEFAULT '[]'");
      if (!ticketCols.includes('github_milestone')) db.exec("ALTER TABLE feedback_tickets ADD COLUMN github_milestone TEXT DEFAULT ''");
      if (!ticketCols.includes('github_assignee')) db.exec("ALTER TABLE feedback_tickets ADD COLUMN github_assignee TEXT DEFAULT ''");
      if (!ticketCols.includes('github_created_at')) db.exec("ALTER TABLE feedback_tickets ADD COLUMN github_created_at TEXT DEFAULT ''");
      if (!ticketCols.includes('github_updated_at')) db.exec("ALTER TABLE feedback_tickets ADD COLUMN github_updated_at TEXT DEFAULT ''");
      if (!ticketCols.includes('last_synced_at')) db.exec("ALTER TABLE feedback_tickets ADD COLUMN last_synced_at TEXT DEFAULT ''");
      if (!ticketCols.includes('duplicate_of')) db.exec("ALTER TABLE feedback_tickets ADD COLUMN duplicate_of TEXT DEFAULT ''");

      // GitHub comments cache table
      db.exec(`
        CREATE TABLE IF NOT EXISTS github_comments (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL,
          github_comment_id INTEGER NOT NULL,
          author TEXT NOT NULL DEFAULT '',
          body TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT '',
          FOREIGN KEY (ticket_id) REFERENCES feedback_tickets(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_github_comments_ticket ON github_comments(ticket_id);
        CREATE INDEX IF NOT EXISTS idx_github_comments_github_id ON github_comments(github_comment_id);
      `);

      db.prepare('INSERT INTO schema_version (version) VALUES (13)').run();
    } catch (err) { console.error('[DB] Migration v13 failed:', (err as Error).message); try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (13)').run(); } catch {} }
  }

  if (currentVersion < 14) {
    try {
      const worldCols14 = db.prepare("PRAGMA table_info('worlds')").all().map((r: any) => r.name);
      if (!worldCols14.includes('world_uuid')) db.exec("ALTER TABLE worlds ADD COLUMN world_uuid TEXT DEFAULT ''");
      if (!worldCols14.includes('last_import')) db.exec("ALTER TABLE worlds ADD COLUMN last_import TEXT");
      if (!worldCols14.includes('created_from')) db.exec("ALTER TABLE worlds ADD COLUMN created_from TEXT DEFAULT 'import'");
      if (!worldCols14.includes('icon')) db.exec("ALTER TABLE worlds ADD COLUMN icon TEXT DEFAULT ''");
      if (!worldCols14.includes('game_rules')) db.exec("ALTER TABLE worlds ADD COLUMN game_rules TEXT DEFAULT '{}'");
      if (!worldCols14.includes('spawn_x')) db.exec("ALTER TABLE worlds ADD COLUMN spawn_x INTEGER DEFAULT 0");
      if (!worldCols14.includes('spawn_y')) db.exec("ALTER TABLE worlds ADD COLUMN spawn_y INTEGER DEFAULT 64");
      if (!worldCols14.includes('spawn_z')) db.exec("ALTER TABLE worlds ADD COLUMN spawn_z INTEGER DEFAULT 0");
      if (!worldCols14.includes('allow_commands')) db.exec("ALTER TABLE worlds ADD COLUMN allow_commands INTEGER DEFAULT 1");
      if (!worldCols14.includes('save_version')) db.exec("ALTER TABLE worlds ADD COLUMN save_version INTEGER DEFAULT 0");

      db.prepare('INSERT INTO schema_version (version) VALUES (14)').run();
    } catch (err) { console.error('[DB] Migration v14 failed:', (err as Error).message); try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (14)').run(); } catch {} }
  }

  if (currentVersion < 15) {
    try {
      const serverCols15 = db.prepare("PRAGMA table_info('servers')").all().map((r: any) => r.name);
      if (!serverCols15.includes('playit_enabled')) db.exec("ALTER TABLE servers ADD COLUMN playit_enabled INTEGER NOT NULL DEFAULT 0");
      if (!serverCols15.includes('playit_address')) db.exec("ALTER TABLE servers ADD COLUMN playit_address TEXT DEFAULT ''");

      db.prepare('INSERT INTO schema_version (version) VALUES (15)').run();
    } catch (err) { console.error('[DB] Migration v15 failed:', (err as Error).message); try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (15)').run(); } catch {} }
  }

  if (currentVersion < 16) {
    try {
      const serverCols16 = db.prepare("PRAGMA table_info('servers')").all().map((r: any) => r.name);
      if (!serverCols16.includes('javaVersion')) db.exec("ALTER TABLE servers ADD COLUMN javaVersion TEXT DEFAULT ''");
      if (!serverCols16.includes('javaVendor')) db.exec("ALTER TABLE servers ADD COLUMN javaVendor TEXT DEFAULT ''");
      if (!serverCols16.includes('javaHome')) db.exec("ALTER TABLE servers ADD COLUMN javaHome TEXT DEFAULT ''");

      db.prepare('INSERT INTO schema_version (version) VALUES (16)').run();
    } catch (err) { console.error('[DB] Migration v16 failed:', (err as Error).message); try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (16)').run(); } catch {} }
  }

  if (currentVersion < 17) {
    try {
      const worldCols17 = db.prepare("PRAGMA table_info('worlds')").all().map((r: any) => r.name);
      if (!worldCols17.includes('border_size')) db.exec("ALTER TABLE worlds ADD COLUMN border_size REAL DEFAULT 29999984");
      if (!worldCols17.includes('border_center_x')) db.exec("ALTER TABLE worlds ADD COLUMN border_center_x REAL DEFAULT 0");
      if (!worldCols17.includes('border_center_z')) db.exec("ALTER TABLE worlds ADD COLUMN border_center_z REAL DEFAULT 0");
      if (!worldCols17.includes('datapacks')) db.exec("ALTER TABLE worlds ADD COLUMN datapacks TEXT DEFAULT '[]'");
      if (!worldCols17.includes('structures')) db.exec("ALTER TABLE worlds ADD COLUMN structures TEXT DEFAULT '{}'");

      const playerCols17 = db.prepare("PRAGMA table_info('players')").all().map((r: any) => r.name);
      if (!playerCols17.includes('is_op')) db.exec("ALTER TABLE players ADD COLUMN is_op INTEGER DEFAULT 0");
      if (!playerCols17.includes('op_level')) db.exec("ALTER TABLE players ADD COLUMN op_level INTEGER DEFAULT 0");
      if (!playerCols17.includes('bypasses_player_limit')) db.exec("ALTER TABLE players ADD COLUMN bypasses_player_limit INTEGER DEFAULT 0");

      db.prepare('INSERT INTO schema_version (version) VALUES (17)').run();
    } catch (err) { console.error('[DB] Migration v17 failed:', (err as Error).message); try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (17)').run(); } catch {} }
  }

  if (currentVersion < 18) {
    try {
      // Add server_id to plugins for per-server isolation
      const tables18 = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map(r => r.name));

      if (tables18.has('plugins')) {
        const pluginCols = db.prepare("PRAGMA table_info('plugins')").all().map((r: any) => r.name);
        if (!pluginCols.includes('server_id')) db.exec("ALTER TABLE plugins ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
        db.exec("CREATE INDEX IF NOT EXISTS idx_plugins_server_id ON plugins(server_id)");
      }

      if (tables18.has('mods')) {
        const modCols = db.prepare("PRAGMA table_info('mods')").all().map((r: any) => r.name);
        if (!modCols.includes('server_id')) db.exec("ALTER TABLE mods ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
        db.exec("CREATE INDEX IF NOT EXISTS idx_mods_server_id ON mods(server_id)");
      }

      if (tables18.has('shaders')) {
        const shaderCols = db.prepare("PRAGMA table_info('shaders')").all().map((r: any) => r.name);
        if (!shaderCols.includes('server_id')) db.exec("ALTER TABLE shaders ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
        db.exec("CREATE INDEX IF NOT EXISTS idx_shaders_server_id ON shaders(server_id)");
      }

      if (tables18.has('resource_packs')) {
        const packCols = db.prepare("PRAGMA table_info('resource_packs')").all().map((r: any) => r.name);
        if (!packCols.includes('server_id')) db.exec("ALTER TABLE resource_packs ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
        db.exec("CREATE INDEX IF NOT EXISTS idx_resource_packs_server_id ON resource_packs(server_id)");
      }

      if (tables18.has('banned_players')) {
        const banCols = db.prepare("PRAGMA table_info('banned_players')").all().map((r: any) => r.name);
        if (!banCols.includes('server_id')) db.exec("ALTER TABLE banned_players ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
        db.exec("CREATE INDEX IF NOT EXISTS idx_banned_players_server_id ON banned_players(server_id)");
      }

      db.prepare('INSERT INTO schema_version (version) VALUES (18)').run();
    } catch (err) {
      console.error('[DB] Migration v18 failed:', (err as Error).message);
      try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (18)').run(); } catch {}
    }
  }

  if (currentVersion < 19) {
    try {
      // Add server_id to remaining tables that still lack isolation
      const tables19 = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map(r => r.name));

      if (tables19.has('whitelist')) {
        const col19 = db.prepare("PRAGMA table_info('whitelist')").all().map((r: any) => r.name);
        if (!col19.includes('server_id')) db.exec("ALTER TABLE whitelist ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
        if (!col19.includes('uuid')) db.exec("ALTER TABLE whitelist ADD COLUMN uuid TEXT DEFAULT ''");
        db.exec("CREATE INDEX IF NOT EXISTS idx_whitelist_server_id ON whitelist(server_id)");
      }

      if (tables19.has('players')) {
        const playerCols19 = db.prepare("PRAGMA table_info('players')").all().map((r: any) => r.name);
        if (!playerCols19.includes('server_id')) db.exec("ALTER TABLE players ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE SET NULL");
        db.exec("CREATE INDEX IF NOT EXISTS idx_players_server_id ON players(server_id)");
      }

      if (tables19.has('player_history')) {
        const phCols19 = db.prepare("PRAGMA table_info('player_history')").all().map((r: any) => r.name);
        if (!phCols19.includes('server_id')) db.exec("ALTER TABLE player_history ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
        db.exec("CREATE INDEX IF NOT EXISTS idx_player_history_server_id ON player_history(server_id)");
      }

      if (tables19.has('claims')) {
        const claimCols19 = db.prepare("PRAGMA table_info('claims')").all().map((r: any) => r.name);
        if (!claimCols19.includes('server_id')) db.exec("ALTER TABLE claims ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
        db.exec("CREATE INDEX IF NOT EXISTS idx_claims_server_id ON claims(server_id)");
      }

      if (tables19.has('build_tags')) {
        const btCols19 = db.prepare("PRAGMA table_info('build_tags')").all().map((r: any) => r.name);
        if (!btCols19.includes('server_id')) db.exec("ALTER TABLE build_tags ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
        db.exec("CREATE INDEX IF NOT EXISTS idx_build_tags_server_id ON build_tags(server_id)");
      }

      if (tables19.has('system_stats')) {
        const ssCols19 = db.prepare("PRAGMA table_info('system_stats')").all().map((r: any) => r.name);
        if (!ssCols19.includes('server_id')) db.exec("ALTER TABLE system_stats ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
        db.exec("CREATE INDEX IF NOT EXISTS idx_system_stats_server_id ON system_stats(server_id)");
      }

      if (tables19.has('audit_log')) {
        const alCols19 = db.prepare("PRAGMA table_info('audit_log')").all().map((r: any) => r.name);
        if (!alCols19.includes('server_id')) db.exec("ALTER TABLE audit_log ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
        db.exec("CREATE INDEX IF NOT EXISTS idx_audit_log_server_id ON audit_log(server_id)");
      }

      // Add server_id to worlds that may have missed v4 migration
      if (tables19.has('worlds')) {
        const wCols19 = db.prepare("PRAGMA table_info('worlds')").all().map((r: any) => r.name);
        if (!wCols19.includes('server_id')) db.exec("ALTER TABLE worlds ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
        db.exec("CREATE INDEX IF NOT EXISTS idx_worlds_server_id ON worlds(server_id)");
      }

      db.prepare('INSERT INTO schema_version (version) VALUES (19)').run();
      console.log('[DB] Migration v19: Added server_id to whitelist, players, player_history, claims, build_tags, system_stats, audit_log');
    } catch (err) {
      console.error('[DB] Migration v19 failed:', (err as Error).message);
      try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (19)').run(); } catch {}
    }
  }

  if (currentVersion < 20) {
    try {
      const ecCols = db.prepare("PRAGMA table_info('encrypted_credentials')").all().map((r: any) => r.name);
      if (!ecCols.includes('salt')) db.exec("ALTER TABLE encrypted_credentials ADD COLUMN salt TEXT DEFAULT ''");
      if (!ecCols.includes('key_version')) db.exec("ALTER TABLE encrypted_credentials ADD COLUMN key_version INTEGER NOT NULL DEFAULT 0");

      // Generate machine salt if not present
      const hasMachineSalt = db.prepare("SELECT COUNT(*) as c FROM server_config WHERE key = 'encryption_machine_salt'").get() as any;
      if (hasMachineSalt.c === 0) {
        const machineSalt = crypto.randomBytes(16).toString('hex');
        db.prepare("INSERT OR IGNORE INTO server_config (key, value) VALUES ('encryption_machine_salt', ?)").run(machineSalt);
      }

      // Add index on sessions.expires_at for cleanup performance
      db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)");

      db.prepare('INSERT INTO schema_version (version) VALUES (20)').run();
      console.log('[DB] Migration v20: Added salt/key_version to encrypted_credentials, machine salt, sessions index');
    } catch (err) {
      console.error('[DB] Migration v20 failed:', (err as Error).message);
      try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (20)').run(); } catch {}
    }
  }

  // Migration v21: Discord chat bridge + command prefix columns
  if (currentVersion < 21) {
    try {
      const dcCols = db.prepare("PRAGMA table_info('discord_config')").all().map((r: any) => r.name);
      if (!dcCols.includes('chat_bridge_enabled')) db.exec("ALTER TABLE discord_config ADD COLUMN chat_bridge_enabled INTEGER DEFAULT 0");
      if (!dcCols.includes('bridge_forward_discord_to_minecraft')) db.exec("ALTER TABLE discord_config ADD COLUMN bridge_forward_discord_to_minecraft INTEGER DEFAULT 0");
      if (!dcCols.includes('command_prefix')) db.exec("ALTER TABLE discord_config ADD COLUMN command_prefix TEXT DEFAULT '!'");
      if (!dcCols.includes('allowed_role_ids')) db.exec("ALTER TABLE discord_config ADD COLUMN allowed_role_ids TEXT DEFAULT ''");

      db.prepare('INSERT INTO schema_version (version) VALUES (21)').run();
      console.log('[DB] Migration v21: Added Discord bridge/command columns');
    } catch (err) {
      console.error('[DB] Migration v21 failed:', (err as Error).message);
      try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (21)').run(); } catch {}
    }
  }

  // Migration v22: Performance tuning — add jvm_flags, simulationDistance
  if (currentVersion < 22) {
    try {
      const sCols = db.prepare("PRAGMA table_info('servers')").all().map((r: any) => r.name);
      if (!sCols.includes('jvm_flags')) db.exec("ALTER TABLE servers ADD COLUMN jvm_flags TEXT DEFAULT ''");
      if (!sCols.includes('simulationDistance')) db.exec("ALTER TABLE servers ADD COLUMN simulationDistance INTEGER DEFAULT 0");

      db.prepare('INSERT INTO schema_version (version) VALUES (22)').run();
      console.log('[DB] Migration v22: Added jvm_flags, simulationDistance to servers');
    } catch (err) {
      console.error('[DB] Migration v22 failed:', (err as Error).message);
      try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (22)').run(); } catch {}
    }
  }

  // Migration v23: Security & Access — 2FA, lockout, IP whitelist
  if (currentVersion < 23) {
    try {
      const uCols = db.prepare("PRAGMA table_info('users')").all().map((r: any) => r.name);
      if (!uCols.includes('totp_secret')) db.exec("ALTER TABLE users ADD COLUMN totp_secret TEXT DEFAULT ''");
      if (!uCols.includes('totp_enabled')) db.exec("ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0");
      if (!uCols.includes('failed_login_attempts')) db.exec("ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0");
      if (!uCols.includes('locked_until')) db.exec("ALTER TABLE users ADD COLUMN locked_until TEXT");
      if (!uCols.includes('totp_recovery_codes')) db.exec("ALTER TABLE users ADD COLUMN totp_recovery_codes TEXT DEFAULT ''");

      db.exec(`CREATE TABLE IF NOT EXISTS ip_whitelist (
        id TEXT PRIMARY KEY, server_id TEXT, ip_address TEXT NOT NULL,
        description TEXT DEFAULT '', created_by TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(server_id, ip_address)
      )`);

      db.prepare('INSERT INTO schema_version (version) VALUES (23)').run();
      console.log('[DB] Migration v23: Added 2FA, lockout columns, ip_whitelist table');
    } catch (err) {
      console.error('[DB] Migration v23 failed:', (err as Error).message);
      try { db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (23)').run(); } catch {}
    }
  }

  // CRITICAL: Validate all required tables exist. Create any missing ones.
  // This is a safety net for fresh installs where migrations may have failed.
  ensureAllTablesExist();

  // Comprehensive column repair: for tables that have had columns added via
  // migrations (v1-v23), verify every expected column exists and add any that
  // are missing. This covers cases where the schema_version was already past a
  // migration when it was introduced (e.g. an old database restored from WAL).
  const schemaVersion = (db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any)?.v || 0;
  console.log(`[DB] Schema version: ${schemaVersion}`);

  // Known column additions per table (sourced from all migration ALTER TABLE statements)
  const expectedColumns: Record<string, Record<string, string>> = {

    // v4: worlds table expansion
    worlds: {
      server_id: 'TEXT REFERENCES servers(id) ON DELETE CASCADE',
      seed: 'TEXT',
      version: "TEXT DEFAULT ''",
      software: "TEXT DEFAULT ''",
      folder_path: "TEXT DEFAULT ''",
      chunk_count: 'INTEGER DEFAULT 0',
      optimization_status: "TEXT DEFAULT 'none'",
      repair_status: "TEXT DEFAULT 'none'",
      last_played: 'TEXT',
      dimension_count: 'INTEGER DEFAULT 1',
      last_optimized: 'TEXT',
      last_repaired: 'TEXT',
      generate_structures: 'INTEGER DEFAULT 1',
      bonus_chest: 'INTEGER DEFAULT 0',
      world_type: "TEXT DEFAULT 'default'",
      hardcore: 'INTEGER DEFAULT 0',
      simulation_distance: 'INTEGER DEFAULT 10',
      view_distance: 'INTEGER DEFAULT 10',
      player_count: 'INTEGER DEFAULT 0',
      backup_size: "TEXT DEFAULT '0 B'",
      region_size: "TEXT DEFAULT '0 B'",
      playerdata_size: "TEXT DEFAULT '0 B'",
      stats_size: "TEXT DEFAULT '0 B'",
      loaded_chunks: 'INTEGER DEFAULT 0',
    },

    // v23: 2FA columns on users
    users: {
      totp_secret: "TEXT DEFAULT ''",
      totp_enabled: 'INTEGER DEFAULT 0',
      totp_recovery_codes: "TEXT DEFAULT ''",
      failed_login_attempts: 'INTEGER DEFAULT 0',
      locked_until: 'TEXT',
      updated_at: "TEXT DEFAULT ''",
    },

    // v21: Discord bridge columns
    discord_config: {
      server_id: 'TEXT REFERENCES servers(id) ON DELETE CASCADE',
      chat_bridge_enabled: 'INTEGER DEFAULT 0',
      bridge_forward_discord_to_minecraft: 'INTEGER DEFAULT 0',
      command_prefix: "TEXT DEFAULT '!'",
      allowed_role_ids: "TEXT DEFAULT ''",
      updated_at: "TEXT DEFAULT ''",
    },

    // v22: Performance columns on servers
    servers: {
      jvm_flags: "TEXT DEFAULT ''",
      simulationDistance: 'INTEGER DEFAULT 0',
      playit_enabled: 'INTEGER DEFAULT 0',
      playit_address: "TEXT DEFAULT ''",
      javaVersion: "TEXT DEFAULT ''",
      javaVendor: "TEXT DEFAULT ''",
      javaHome: "TEXT DEFAULT ''",
    },

    // v19: server_id added to multiple tables
    whitelist: { server_id: 'TEXT REFERENCES servers(id) ON DELETE CASCADE' },
    player_history: { server_id: 'TEXT REFERENCES servers(id) ON DELETE CASCADE' },
    claims: { server_id: 'TEXT REFERENCES servers(id) ON DELETE CASCADE' },
    build_tags: { server_id: 'TEXT REFERENCES servers(id) ON DELETE CASCADE' },
    system_stats: { server_id: 'TEXT REFERENCES servers(id) ON DELETE CASCADE' },
    audit_log: { server_id: 'TEXT REFERENCES servers(id) ON DELETE CASCADE' },
  };

  let repairCount = 0;
  for (const [tableName, columns] of Object.entries(expectedColumns)) {
    try {
      const existing = db.prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name=?`).get(tableName) as any;
      if (!existing.c) continue; // table not created yet
      const colNames = new Set(
        (db.prepare(`PRAGMA table_info('${tableName}')`).all() as any[]).map((r: any) => r.name)
      );
      for (const [colName, colDef] of Object.entries(columns)) {
        if (!colNames.has(colName)) {
          db.exec(`ALTER TABLE "${tableName}" ADD COLUMN "${colName}" ${colDef}`);
          console.log(`[DB] Repair: Added missing column ${tableName}.${colName}`);
          repairCount++;
        }
      }
    } catch (e) {
      // Skip tables that don't exist
    }
  }

  if (repairCount > 0) {
    console.log(`[DB] Schema repair complete: ${repairCount} missing column(s) added`);
    // Fill updated_at for rows that got the column added with empty default
    for (const tbl of ['users', 'discord_config', 'servers']) {
      try {
        const tCols = db.prepare(`PRAGMA table_info('${tbl}')`).all().map((r: any) => r.name);
        if (tCols.includes('updated_at')) {
          db.exec(`UPDATE "${tbl}" SET updated_at = datetime('now') WHERE updated_at IS NULL OR updated_at = ''`);
        }
      } catch {}
    }
  }

  // Database diagnostics
  printDatabaseDiagnostics();
}

function printDatabaseDiagnostics() {
  try {
    const version = (db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any)?.v || 0;
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as any[]).map((r: any) => r.name);
    const tableCount = tables.length;
    const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any)?.c || 0;
    const serverCount = (db.prepare('SELECT COUNT(*) as c FROM servers').get() as any)?.c || 0;
    const healthIssues: string[] = [];

    // Check for tables that exist in schema but have known issues
    for (const tbl of ['worlds', 'users', 'servers', 'discord_config']) {
      if (!tables.includes(tbl)) {
        healthIssues.push(`Missing table: ${tbl}`);
      }
    }

    console.log('[DB] ═══════════════════════════════════════');
    console.log(`[DB]  Database:  ${DB_PATH}`);
    console.log(`[DB]  Schema v${version}  |  Tables: ${tableCount}  |  Users: ${userCount}  |  Servers: ${serverCount}`);
    console.log(`[DB]  Health:    ${healthIssues.length === 0 ? 'OK' : healthIssues.join('; ')}`);
    console.log('[DB] ═══════════════════════════════════════');
  } catch (e) {
    console.error('[DB] Diagnostics error:', (e as Error).message);
  }
}

function ensureAllTablesExist() {
  const requiredTables: Record<string, string> = {
    users: `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner', created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT, session_token TEXT,
      totp_secret TEXT DEFAULT '', totp_enabled INTEGER DEFAULT 0,
      totp_recovery_codes TEXT DEFAULT '',
      failed_login_attempts INTEGER DEFAULT 0, locked_until TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    players: `CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, uuid TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'Member', status TEXT NOT NULL DEFAULT 'offline',
      last_login TEXT, playtime INTEGER NOT NULL DEFAULT 0, ip TEXT,
      join_date TEXT NOT NULL DEFAULT (datetime('now')), muted INTEGER NOT NULL DEFAULT 0,
      notes TEXT, health REAL DEFAULT 20, food_level INTEGER DEFAULT 20,
      xp_level INTEGER DEFAULT 0, xp_progress REAL DEFAULT 0, dimension TEXT DEFAULT '',
      pos_x REAL DEFAULT 0, pos_y REAL DEFAULT 0, pos_z REAL DEFAULT 0,
      world_name TEXT DEFAULT 'world', death_count INTEGER DEFAULT 0, kills INTEGER DEFAULT 0,
      first_join TEXT, last_disconnect TEXT, inventory TEXT DEFAULT '[]',
      armor TEXT DEFAULT '[]', ender_chest TEXT DEFAULT '[]', advancements TEXT DEFAULT '{}',
      statistics TEXT DEFAULT '{}', approval_status TEXT NOT NULL DEFAULT 'approved',
      trusted INTEGER NOT NULL DEFAULT 1, last_ip TEXT DEFAULT '', ops INTEGER NOT NULL DEFAULT 0,
      server_id TEXT
    )`,
    roles: `CREATE TABLE IF NOT EXISTS roles (
      name TEXT PRIMARY KEY, level INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#aaaaaa', permissions TEXT NOT NULL DEFAULT '[]'
    )`,
    whitelist: `CREATE TABLE IF NOT EXISTS whitelist (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, uuid TEXT,
      added_by TEXT, added_at TEXT NOT NULL DEFAULT (datetime('now')), server_id TEXT
    )`,
    banned_players: `CREATE TABLE IF NOT EXISTS banned_players (
      id TEXT PRIMARY KEY, username TEXT NOT NULL, uuid TEXT, reason TEXT,
      banned_by TEXT, banned_at TEXT NOT NULL DEFAULT (datetime('now')), server_id TEXT
    )`,
    server_config: `CREATE TABLE IF NOT EXISTS server_config (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    )`,
    backups: `CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY, server_id TEXT, name TEXT NOT NULL, size TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), type TEXT NOT NULL DEFAULT 'manual',
      worlds TEXT NOT NULL DEFAULT '[]', encrypted INTEGER NOT NULL DEFAULT 0, path TEXT NOT NULL
    )`,
    worlds: `CREATE TABLE IF NOT EXISTS worlds (
      name TEXT PRIMARY KEY, server_id TEXT, seed TEXT,
      gamemode TEXT NOT NULL DEFAULT 'survival', difficulty TEXT NOT NULL DEFAULT 'normal',
      size TEXT, last_backup TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    plugins: `CREATE TABLE IF NOT EXISTS plugins (
      name TEXT PRIMARY KEY, version TEXT NOT NULL DEFAULT '1.0',
      enabled INTEGER NOT NULL DEFAULT 1, description TEXT, author TEXT,
      main_class TEXT, server_id TEXT
    )`,
    mods: `CREATE TABLE IF NOT EXISTS mods (
      name TEXT PRIMARY KEY, version TEXT NOT NULL DEFAULT '1.0',
      enabled INTEGER NOT NULL DEFAULT 1, description TEXT, author TEXT,
      source TEXT DEFAULT '', modrinth_id TEXT, curseforge_id INTEGER,
      side TEXT DEFAULT 'both', server_id TEXT
    )`,
    shaders: `CREATE TABLE IF NOT EXISTS shaders (
      name TEXT PRIMARY KEY, version TEXT NOT NULL DEFAULT '1.0',
      enabled INTEGER NOT NULL DEFAULT 1, description TEXT, author TEXT,
      source TEXT DEFAULT '', server_id TEXT
    )`,
    resource_packs: `CREATE TABLE IF NOT EXISTS resource_packs (
      name TEXT PRIMARY KEY, version TEXT NOT NULL DEFAULT '1.0',
      enabled INTEGER NOT NULL DEFAULT 1, description TEXT, author TEXT,
      source TEXT DEFAULT '', server_id TEXT
    )`,
    system_stats: `CREATE TABLE IF NOT EXISTS system_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT, cpu REAL NOT NULL, ram REAL NOT NULL,
      tps REAL NOT NULL, players INTEGER NOT NULL, timestamp INTEGER NOT NULL, server_id TEXT
    )`,
    sessions: `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT UNIQUE NOT NULL,
      ip TEXT, user_agent TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )`,
    chat_log: `CREATE TABLE IF NOT EXISTS chat_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT, username TEXT NOT NULL,
      uuid TEXT, message TEXT NOT NULL, timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    audit_log: `CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, username TEXT,
      details TEXT, ip TEXT, timestamp TEXT NOT NULL DEFAULT (datetime('now')), server_id TEXT
    )`,
    claims: `CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL,
      world TEXT NOT NULL DEFAULT 'world', x1 INTEGER NOT NULL DEFAULT 0,
      z1 INTEGER NOT NULL DEFAULT 0, x2 INTEGER NOT NULL DEFAULT 0,
      z2 INTEGER NOT NULL DEFAULT 0, color TEXT NOT NULL DEFAULT '#ff5555',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), server_id TEXT
    )`,
    build_tags: `CREATE TABLE IF NOT EXISTS build_tags (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'base',
      world TEXT NOT NULL DEFAULT 'world', x REAL NOT NULL DEFAULT 0,
      y REAL NOT NULL DEFAULT 0, z REAL NOT NULL DEFAULT 0, owner TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), server_id TEXT
    )`,
    github_issues: `CREATE TABLE IF NOT EXISTS github_issues (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
      type TEXT NOT NULL DEFAULT 'bug', status TEXT NOT NULL DEFAULT 'open',
      username TEXT, image_count INTEGER NOT NULL DEFAULT 0,
      video_count INTEGER NOT NULL DEFAULT 0, github_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    servers: `CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
      port INTEGER NOT NULL DEFAULT 25565, directory TEXT NOT NULL,
      version TEXT DEFAULT '', version_source TEXT DEFAULT '',
      javaPath TEXT NOT NULL DEFAULT 'java', jarFile TEXT NOT NULL DEFAULT 'server.jar',
      minRam TEXT NOT NULL DEFAULT '2G', maxRam TEXT NOT NULL DEFAULT '8G',
      motd TEXT NOT NULL DEFAULT '', difficulty TEXT NOT NULL DEFAULT 'normal',
      gamemode TEXT NOT NULL DEFAULT 'survival', pvp INTEGER NOT NULL DEFAULT 1,
      maxPlayers INTEGER NOT NULL DEFAULT 4, viewDistance INTEGER NOT NULL DEFAULT 10,
      simulationDistance INTEGER DEFAULT 0, jvm_flags TEXT DEFAULT '',
      onlineMode INTEGER NOT NULL DEFAULT 1, autoRestart INTEGER NOT NULL DEFAULT 1,
      autoBackup INTEGER NOT NULL DEFAULT 1, whitelistEnabled INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'stopped', created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    )`,
    schedules: `CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY, server_id TEXT, name TEXT NOT NULL, cron TEXT NOT NULL,
      action TEXT NOT NULL, command TEXT, enabled INTEGER NOT NULL DEFAULT 1,
      last_run TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    notifications: `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, server_id TEXT, type TEXT NOT NULL, title TEXT NOT NULL,
      message TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    feedback_tickets: `CREATE TABLE IF NOT EXISTS feedback_tickets (
      id TEXT PRIMARY KEY, ticket_id TEXT UNIQUE NOT NULL,
      issue_type TEXT NOT NULL DEFAULT 'general' CHECK(issue_type IN ('bug','feature','performance','crash','general')),
      summary TEXT NOT NULL DEFAULT '', description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','pending','in_review','resolved','closed','rejected')),
      username TEXT NOT NULL, server_id TEXT, server_name TEXT DEFAULT '',
      world_name TEXT DEFAULT '', player_count INTEGER DEFAULT 0,
      minecraft_version TEXT DEFAULT '', server_software TEXT DEFAULT '',
      connected_plugins TEXT DEFAULT '[]', connected_mods TEXT DEFAULT '[]',
      connection_mode TEXT DEFAULT '', diagnostic_data TEXT,
      diagnostic_sanitized INTEGER NOT NULL DEFAULT 1,
      screenshot_paths TEXT DEFAULT '[]', attachment_paths TEXT DEFAULT '[]',
      log_snapshots TEXT DEFAULT '{}', error_stack_trace TEXT DEFAULT '',
      github_url TEXT, issue_tracker_url TEXT DEFAULT '', issue_tracker_id TEXT DEFAULT '',
      sync_status TEXT NOT NULL DEFAULT 'local' CHECK(sync_status IN ('local','pending','synced','failed')),
      sync_retries INTEGER NOT NULL DEFAULT 0, sync_last_attempt TEXT, sync_error TEXT DEFAULT '',
      votes INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','critical')),
      last_status_change_by TEXT DEFAULT '', last_status_change_at TEXT,
      developer_notes TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    ui_state: `CREATE TABLE IF NOT EXISTS ui_state (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    )`,
    player_history: `CREATE TABLE IF NOT EXISTS player_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL,
      event_type TEXT NOT NULL, event_data TEXT, timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      server_id TEXT
    )`,
    world_dimensions: `CREATE TABLE IF NOT EXISTS world_dimensions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, world_name TEXT NOT NULL,
      dimension_name TEXT NOT NULL DEFAULT 'minecraft:overworld',
      display_name TEXT NOT NULL DEFAULT 'Overworld', size TEXT DEFAULT '0 B',
      chunk_count INTEGER DEFAULT 0, player_count INTEGER DEFAULT 0, last_activity TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (world_name) REFERENCES worlds(name) ON DELETE CASCADE,
      UNIQUE(world_name, dimension_name)
    )`,
    backup_schedule: `CREATE TABLE IF NOT EXISTS backup_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      frequency TEXT NOT NULL DEFAULT 'daily', enabled INTEGER NOT NULL DEFAULT 0,
      next_run TEXT, last_run TEXT, time_of_day TEXT DEFAULT '03:00',
      day_of_week INTEGER DEFAULT 0, day_of_month INTEGER DEFAULT 1,
      max_backups INTEGER DEFAULT 0, max_storage_mb INTEGER DEFAULT 0, max_age_days INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(server_id)
    )`,
    connection_diagnostics: `CREATE TABLE IF NOT EXISTS connection_diagnostics (
      id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      local_address TEXT DEFAULT '', lan_address TEXT DEFAULT '', public_ip TEXT DEFAULT '',
      playit_address TEXT DEFAULT '', port INTEGER DEFAULT 25565,
      server_running INTEGER DEFAULT 0, firewall_active INTEGER DEFAULT 0,
      firewall_rule_exists INTEGER DEFAULT 0, lan_reachable INTEGER DEFAULT 0,
      playit_active INTEGER DEFAULT 0, playit_latency INTEGER,
      local_ping_ok INTEGER DEFAULT 0, local_ping_latency INTEGER,
      tcp_port_open INTEGER DEFAULT 0, java_process_running INTEGER DEFAULT 0,
      recommended_method TEXT DEFAULT 'localhost', diagnostics_json TEXT DEFAULT '{}'
    )`,
    connection_config: `CREATE TABLE IF NOT EXISTS connection_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      preferred_mode TEXT DEFAULT 'auto', last_successful_method TEXT DEFAULT '',
      last_diagnostics_at TEXT, UNIQUE(server_id)
    )`,
    discord_config: `CREATE TABLE IF NOT EXISTS discord_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      bot_token TEXT DEFAULT '', guild_id TEXT DEFAULT '', text_channel_id TEXT DEFAULT '',
      voice_channel_id TEXT DEFAULT '', auto_reconnect INTEGER DEFAULT 1,
      notify_server_start INTEGER DEFAULT 1, notify_server_stop INTEGER DEFAULT 1,
      notify_server_crash INTEGER DEFAULT 1, notify_server_restart INTEGER DEFAULT 1,
      notify_backup_created INTEGER DEFAULT 1, notify_backup_restored INTEGER DEFAULT 1,
      notify_backup_failed INTEGER DEFAULT 1, notify_player_join INTEGER DEFAULT 0,
      notify_player_left INTEGER DEFAULT 0, notify_player_kicked INTEGER DEFAULT 0,
      notify_player_banned INTEGER DEFAULT 0, notify_player_unbanned INTEGER DEFAULT 1,
      notify_player_approved INTEGER DEFAULT 1, notify_whitelist_updated INTEGER DEFAULT 1,
      notify_software_changed INTEGER DEFAULT 1, notify_version_changed INTEGER DEFAULT 1,
      notify_update_available INTEGER DEFAULT 1,
      chat_bridge_enabled INTEGER DEFAULT 0, bridge_forward_discord_to_minecraft INTEGER DEFAULT 0,
      command_prefix TEXT DEFAULT '!', allowed_role_ids TEXT DEFAULT '',
      bot_status TEXT DEFAULT 'disconnected',
      last_connected_at TEXT, last_error TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(server_id)
    )`,
    discord_notifications: `CREATE TABLE IF NOT EXISTS discord_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL, title TEXT NOT NULL, content TEXT DEFAULT '',
      sent_at TEXT NOT NULL DEFAULT (datetime('now')), success INTEGER DEFAULT 1,
      error TEXT DEFAULT ''
    )`,
    ticket_history: `CREATE TABLE IF NOT EXISTS ticket_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL,
      field TEXT NOT NULL, old_value TEXT DEFAULT '', new_value TEXT DEFAULT '',
      changed_by TEXT NOT NULL DEFAULT 'system', note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (ticket_id) REFERENCES feedback_tickets(id) ON DELETE CASCADE
    )`,
    ticket_attachments: `CREATE TABLE IF NOT EXISTS ticket_attachments (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL,
      file_name TEXT NOT NULL, file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0, mime_type TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'other' CHECK(type IN ('screenshot','log','crash_report','diagnostic','other')),
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (ticket_id) REFERENCES feedback_tickets(id) ON DELETE CASCADE
    )`,
    sync_queue: `CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'create' CHECK(action IN ('create','update','sync')),
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')),
      retries INTEGER NOT NULL DEFAULT 0, max_retries INTEGER NOT NULL DEFAULT 10,
      error TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_attempt TEXT, completed_at TEXT,
      FOREIGN KEY (ticket_id) REFERENCES feedback_tickets(id) ON DELETE CASCADE
    )`,
    issue_tracker_config: `CREATE TABLE IF NOT EXISTS issue_tracker_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'github' CHECK(provider IN ('github','gitlab','jira','custom')),
      url TEXT NOT NULL DEFAULT '', api_token TEXT DEFAULT '',
      repository TEXT DEFAULT '', project_key TEXT DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0, auto_sync INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(server_id)
    )`,
    guide_preferences: `CREATE TABLE IF NOT EXISTS guide_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL DEFAULT 'default',
      key TEXT NOT NULL, value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id, key)
    )`,
    guide_bookmarks: `CREATE TABLE IF NOT EXISTS guide_bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL DEFAULT 'default',
      section_id TEXT NOT NULL, article_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL, url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id, section_id, article_id)
    )`,
    guide_recently_viewed: `CREATE TABLE IF NOT EXISTS guide_recently_viewed (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL DEFAULT 'default',
      section_id TEXT NOT NULL, article_id TEXT NOT NULL, title TEXT NOT NULL,
      viewed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    guide_tutorial_progress: `CREATE TABLE IF NOT EXISTS guide_tutorial_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL DEFAULT 'default',
      tutorial_id TEXT NOT NULL, step_index INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT, UNIQUE(user_id, tutorial_id)
    )`,
    guide_search_history: `CREATE TABLE IF NOT EXISTS guide_search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL DEFAULT 'default',
      query TEXT NOT NULL, result_count INTEGER NOT NULL DEFAULT 0,
      searched_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    privacy_preferences: `CREATE TABLE IF NOT EXISTS privacy_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    feature_permissions: `CREATE TABLE IF NOT EXISTS feature_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, feature_key TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1, label TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    security_checks: `CREATE TABLE IF NOT EXISTS security_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, check_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pass','fail','warn','pending')),
      detail TEXT DEFAULT '', score_impact INTEGER NOT NULL DEFAULT 0,
      checked_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    encrypted_credentials: `CREATE TABLE IF NOT EXISTS encrypted_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT, credential_key TEXT NOT NULL UNIQUE,
      encrypted_data TEXT NOT NULL, iv TEXT NOT NULL, auth_tag TEXT NOT NULL,
      salt TEXT DEFAULT '', key_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    credential_metadata: `CREATE TABLE IF NOT EXISTS credential_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT, credential_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL, has_value INTEGER NOT NULL DEFAULT 0,
      source TEXT DEFAULT 'manual', last_updated TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    security_audit_log: `CREATE TABLE IF NOT EXISTS security_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL,
      detail TEXT DEFAULT '', ip TEXT DEFAULT '',
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    update_preferences: `CREATE TABLE IF NOT EXISTS update_preferences (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    )`,
    update_history: `CREATE TABLE IF NOT EXISTS update_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, version TEXT NOT NULL,
      action TEXT NOT NULL, previous_version TEXT, status TEXT NOT NULL,
      details TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    release_notes_cache: `CREATE TABLE IF NOT EXISTS release_notes_cache (
      version TEXT PRIMARY KEY, release_date TEXT,
      new_features TEXT, bug_fixes TEXT, improvements TEXT,
      breaking_changes TEXT, known_issues TEXT, upgrade_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    update_migrations: `CREATE TABLE IF NOT EXISTS update_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, from_version TEXT, to_version TEXT,
      status TEXT, result TEXT, details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    uninstall_history: `CREATE TABLE IF NOT EXISTS uninstall_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL,
      status TEXT NOT NULL, details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    restore_state: `CREATE TABLE IF NOT EXISTS restore_state (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    )`,
    github_comments: `CREATE TABLE IF NOT EXISTS github_comments (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL,
      github_comment_id INTEGER NOT NULL, author TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (ticket_id) REFERENCES feedback_tickets(id) ON DELETE CASCADE
    )`,
    marketplace_cache: `CREATE TABLE IF NOT EXISTS marketplace_cache (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    ip_whitelist: `CREATE TABLE IF NOT EXISTS ip_whitelist (
      id TEXT PRIMARY KEY, server_id TEXT, ip_address TEXT NOT NULL,
      description TEXT DEFAULT '', created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(server_id, ip_address)
    )`,
  };

  const existingTables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map(r => r.name)
  );

  let created = 0;
  for (const [tableName, createSQL] of Object.entries(requiredTables)) {
    if (!existingTables.has(tableName)) {
      try {
        db.exec(createSQL);
        created++;
        console.log(`[DB] Created missing table: ${tableName}`);
      } catch (err: any) {
        console.error(`[DB] Failed to create table ${tableName}:`, err.message);
      }
    }
  }

  if (created > 0) {
    console.log(`[DB] Auto-created ${created} missing table(s)`);
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
    INSERT INTO servers (id, name, slug, port, directory, version, version_source, javaPath, jarFile, minRam, maxRam, motd, difficulty, gamemode, pvp, maxPlayers, viewDistance, simulationDistance, jvm_flags, onlineMode, autoRestart, autoBackup, whitelistEnabled, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped')
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
    0, '',
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
