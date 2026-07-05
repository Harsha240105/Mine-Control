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
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);`);

  const currentVersion = (db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any)?.v || 0;

  // IMPORTANT: Do NOT return early here. v1-v2 blocks are idempotent (CREATE IF NOT EXISTS + PRAGMA checks),
  // and v3+ migrations must always be reachable regardless of starting version.
  // Previously had "if (currentVersion >= 2) return;" which BLOCKED all v3-v13 migrations.

  if (currentVersion < 1) {
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
      path TEXT NOT NULL,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS worlds (
      name TEXT PRIMARY KEY,
      server_id TEXT,
      seed TEXT,
      gamemode TEXT NOT NULL DEFAULT 'survival',
      difficulty TEXT NOT NULL DEFAULT 'normal',
      size TEXT,
      last_backup TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
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
      server_id TEXT,
      username TEXT NOT NULL,
      uuid TEXT,
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
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

    CREATE TABLE IF NOT EXISTS feedback_tickets (
      id TEXT PRIMARY KEY,
      ticket_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('bug', 'feature')),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'resolved', 'closed')),
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
    const serverCols = db.prepare("PRAGMA table_info('servers')").all().map((r: any) => r.name);
    if (!serverCols.includes('version')) db.exec("ALTER TABLE servers ADD COLUMN version TEXT DEFAULT ''");
    if (!serverCols.includes('version_source')) db.exec("ALTER TABLE servers ADD COLUMN version_source TEXT DEFAULT ''");
    if (!serverCols.includes('seed')) db.exec("ALTER TABLE servers ADD COLUMN seed TEXT DEFAULT ''");
    if (!serverCols.includes('network')) db.exec("ALTER TABLE servers ADD COLUMN network TEXT DEFAULT 'local'");
    db.exec("UPDATE servers SET version = REPLACE(REPLACE(REPLACE(jarFile, 'paper-', ''), 'vanilla-', ''), '.jar', ''), version_source = CASE WHEN jarFile LIKE 'paper-%' THEN 'PaperMC' WHEN jarFile LIKE 'vanilla-%' THEN 'Mojang' ELSE '' END WHERE version = '' OR version IS NULL");

    // Add server_id to legacy tables
    const backupCols = db.prepare("PRAGMA table_info('backups')").all().map((r: any) => r.name);
    if (!backupCols.includes('server_id')) db.exec("ALTER TABLE backups ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
    const worldCols = db.prepare("PRAGMA table_info('worlds')").all().map((r: any) => r.name);
    if (!worldCols.includes('server_id')) db.exec("ALTER TABLE worlds ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
    const chatCols = db.prepare("PRAGMA table_info('chat_log')").all().map((r: any) => r.name);
    if (!chatCols.includes('server_id')) db.exec("ALTER TABLE chat_log ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");

    // Add player tracking columns
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

    // Seed default roles if they don't exist
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

    // Migrate legacy server_config to a named server entry
    migrateDefaultServer();

    // Fix existing users with lowercase roles
    db.prepare("UPDATE users SET role = 'Owner' WHERE role = 'owner'").run();
    db.prepare("UPDATE users SET role = 'Admin' WHERE role = 'admin'").run();
    db.prepare("UPDATE users SET role = 'Moderator' WHERE role = 'moderator'").run();

    // Seed default owner if not exists
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

    // Create indexes for performance
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

    db.prepare('INSERT INTO schema_version (version) VALUES (1)').run();
  }

  if (currentVersion < 2) {
    db.exec(`
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
    `);
    db.prepare('INSERT INTO schema_version (version) VALUES (2)').run();
  }

  if (currentVersion < 3) {
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
  }

  if (currentVersion < 4) {
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
  }

  if (currentVersion < 5) {
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
  }

  if (currentVersion < 6) {
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
  }

  if (currentVersion < 7) {
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
  }

  if (currentVersion < 8) {
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
  }

  if (currentVersion < 9) {
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
  }

  if (currentVersion < 10) {
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
  }

  if (currentVersion < 11) {
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
  }

  if (currentVersion < 12) {
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
  }

  if (currentVersion < 13) {
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
  }

  if (currentVersion < 14) {
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
  }

  if (currentVersion < 15) {
    const serverCols15 = db.prepare("PRAGMA table_info('servers')").all().map((r: any) => r.name);
    if (!serverCols15.includes('playit_enabled')) db.exec("ALTER TABLE servers ADD COLUMN playit_enabled INTEGER NOT NULL DEFAULT 0");
    if (!serverCols15.includes('playit_address')) db.exec("ALTER TABLE servers ADD COLUMN playit_address TEXT DEFAULT ''");

    db.prepare('INSERT INTO schema_version (version) VALUES (15)').run();
  }

  if (currentVersion < 16) {
    const serverCols16 = db.prepare("PRAGMA table_info('servers')").all().map((r: any) => r.name);
    if (!serverCols16.includes('javaVersion')) db.exec("ALTER TABLE servers ADD COLUMN javaVersion TEXT DEFAULT ''");
    if (!serverCols16.includes('javaVendor')) db.exec("ALTER TABLE servers ADD COLUMN javaVendor TEXT DEFAULT ''");
    if (!serverCols16.includes('javaHome')) db.exec("ALTER TABLE servers ADD COLUMN javaHome TEXT DEFAULT ''");

    db.prepare('INSERT INTO schema_version (version) VALUES (16)').run();
  }

  if (currentVersion < 17) {
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
  }

  if (currentVersion < 18) {
    // Add server_id to plugins for per-server isolation
    const pluginCols = db.prepare("PRAGMA table_info('plugins')").all().map((r: any) => r.name);
    if (!pluginCols.includes('server_id')) db.exec("ALTER TABLE plugins ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
    db.exec("CREATE INDEX IF NOT EXISTS idx_plugins_server_id ON plugins(server_id)");

    // Add server_id to mods for per-server isolation
    const modCols = db.prepare("PRAGMA table_info('mods')").all().map((r: any) => r.name);
    if (!modCols.includes('server_id')) db.exec("ALTER TABLE mods ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
    db.exec("CREATE INDEX IF NOT EXISTS idx_mods_server_id ON mods(server_id)");

    // Add server_id to shaders for per-server isolation
    const shaderCols = db.prepare("PRAGMA table_info('shaders')").all().map((r: any) => r.name);
    if (!shaderCols.includes('server_id')) db.exec("ALTER TABLE shaders ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
    db.exec("CREATE INDEX IF NOT EXISTS idx_shaders_server_id ON shaders(server_id)");

    // Add server_id to resource_packs for per-server isolation
    const packCols = db.prepare("PRAGMA table_info('resource_packs')").all().map((r: any) => r.name);
    if (!packCols.includes('server_id')) db.exec("ALTER TABLE resource_packs ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
    db.exec("CREATE INDEX IF NOT EXISTS idx_resource_packs_server_id ON resource_packs(server_id)");

    // Add server_id to banned_players for per-server isolation
    const banCols = db.prepare("PRAGMA table_info('banned_players')").all().map((r: any) => r.name);
    if (!banCols.includes('server_id')) db.exec("ALTER TABLE banned_players ADD COLUMN server_id TEXT REFERENCES servers(id) ON DELETE CASCADE");
    db.exec("CREATE INDEX IF NOT EXISTS idx_banned_players_server_id ON banned_players(server_id)");

    db.prepare('INSERT INTO schema_version (version) VALUES (18)').run();
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
